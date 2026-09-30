const MODEL = "models/gemini-3.5-transcribe-live";
const SOCKET_URL = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained";

function encodePcm(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function joinTranscript(finalized: string[], interim: string): string {
  return [...finalized, interim].filter(Boolean).join(" ").trim();
}

type LiveMessage = {
  setupComplete?: object;
  serverContent?: {
    interimInputTranscription?: { text?: string };
    inputTranscription?: { text?: string };
  };
};

export class LiveTranscription {
  private socket: WebSocket | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private silentOutput: GainNode | null = null;
  private queued: string[] = [];
  private finalized: string[] = [];
  private interim = "";
  private closed = false;
  private ready = false;
  private failed = false;
  private onCaption: (text: string) => void;
  private onReady: () => void;
  private onFailure: () => void;
  readonly started: Promise<boolean>;

  constructor(stream: MediaStream, context: AudioContext, callbacks: {
    onCaption: (text: string) => void;
    onReady: () => void;
    onFailure: () => void;
  }) {
    this.onCaption = callbacks.onCaption;
    this.onReady = callbacks.onReady;
    this.onFailure = callbacks.onFailure;
    this.started = this.connect(stream, context);
  }

  get text() { return joinTranscript(this.finalized, this.interim); }
  get active() { return this.ready && !this.failed && !this.closed; }

  private sendAudio(data: string) {
    this.socket?.send(JSON.stringify({ realtimeInput: {
      audio: { data, mimeType: "audio/pcm;rate=16000" },
    } }));
  }

  private async connect(stream: MediaStream, context: AudioContext): Promise<boolean> {
    try {
      await context.audioWorklet.addModule("/audio/pcm-worklet.js");
      if (this.closed) return false;
      this.worklet = new AudioWorkletNode(context, "anthea-pcm");
      this.source = context.createMediaStreamSource(stream);
      this.silentOutput = context.createGain();
      this.silentOutput.gain.value = 0;
      this.source.connect(this.worklet);
      this.worklet.connect(this.silentOutput);
      this.silentOutput.connect(context.destination);
      this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (this.closed || this.failed) return;
        const data = encodePcm(event.data);
        if (this.ready) this.sendAudio(data);
        else {
          this.queued.push(data);
          if (this.queued.length > 100) this.queued.shift();
        }
      };

      const response = await fetch("/api/transcribe/live-token", { method: "POST", signal: AbortSignal.timeout(9000) });
      if (!response.ok) throw new Error("Live token unavailable");
      const body: { token?: string } = await response.json();
      if (!body.token || this.closed) return false;
      const socket = new WebSocket(`${SOCKET_URL}?access_token=${encodeURIComponent(body.token)}`);
      this.socket = socket;
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        };
        const timeout = setTimeout(() => {
          this.fail();
          settle(false);
        }, 7000);
        socket.onopen = () => {
          if (this.closed) { settle(false); return; }
          socket.send(JSON.stringify({ setup: {
            model: MODEL,
            generationConfig: { responseModalities: ["TEXT"] },
            inputAudioTranscription: { languageCodes: [] },
          } }));
        };
        socket.onmessage = (event) => {
          if (this.closed) return;
          let message: LiveMessage;
          try { message = JSON.parse(event.data); } catch { return; }
          if (message.setupComplete && !this.ready) {
            this.ready = true;
            for (const data of this.queued) this.sendAudio(data);
            this.queued = [];
            this.onReady();
            settle(true);
          }
          const content = message.serverContent;
          if (!content) return;
          const final = content.inputTranscription?.text?.trim();
          if (final) {
            this.finalized.push(final);
            this.interim = "";
          } else if (content.interimInputTranscription?.text) {
            this.interim = content.interimInputTranscription.text.trim();
          }
          if (final || content.interimInputTranscription?.text) this.onCaption(this.text);
        };
        socket.onerror = () => { this.fail(); settle(false); };
        socket.onclose = () => { if (!this.closed) this.fail(); settle(false); };
      });
    } catch {
      this.fail();
      return false;
    }
  }

  private fail() {
    if (this.failed || this.closed) return;
    this.failed = true;
    this.disconnectAudio();
    this.socket?.close();
    this.onFailure();
  }

  private disconnectAudio(clearQueue = true) {
    if (this.worklet) this.worklet.port.onmessage = null;
    this.source?.disconnect();
    this.worklet?.disconnect();
    this.silentOutput?.disconnect();
    if (clearQueue) this.queued = [];
  }

  async finish(): Promise<string> {
    if (this.worklet) {
      this.worklet.port.postMessage("flush");
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    this.disconnectAudio(false);
    if (!this.ready && !this.failed) {
      await Promise.race([this.started, new Promise(resolve => setTimeout(resolve, 2500))]);
    }
    if (this.active && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      const before = this.finalized.length;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1800);
        const prior = this.onCaption;
        this.onCaption = (text) => {
          prior(text);
          if (this.finalized.length > before) { clearTimeout(timeout); resolve(); }
        };
      });
    }
    const text = this.text;
    this.abort();
    return text;
  }

  abort() {
    if (this.closed) return;
    this.closed = true;
    this.disconnectAudio();
    this.socket?.close();
  }
}
