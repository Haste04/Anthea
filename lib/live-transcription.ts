import { buildPlantVocabulary, normalizeVoiceVocabulary } from "@/lib/voice-vocabulary";

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
    turnComplete?: boolean;
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
  private flushComplete: (() => void) | null = null;
  private finishComplete: (() => void) | null = null;
  private connectionComplete: ((ready: boolean) => void) | null = null;
  private tokenRequest = new AbortController();
  private awaitingEnd = false;
  private ended = false;
  private onCaption: (text: string) => void;
  private onReady: () => void;
  private onFailure: () => void;
  readonly started: Promise<boolean>;

  constructor(stream: MediaStream, context: AudioContext, callbacks: {
    onCaption: (text: string) => void;
    onReady: () => void;
    onFailure: () => void;
  }, vocabulary = buildPlantVocabulary([])) {
    this.onCaption = callbacks.onCaption;
    this.onReady = callbacks.onReady;
    this.onFailure = callbacks.onFailure;
    this.started = this.connect(stream, context, normalizeVoiceVocabulary(vocabulary));
  }

  get text() { return joinTranscript(this.finalized, this.interim); }
  get active() { return this.ready && !this.failed && !this.closed; }

  private sendAudio(data: string) {
    this.socket?.send(JSON.stringify({ realtimeInput: {
      audio: { data, mimeType: "audio/pcm;rate=16000" },
    } }));
  }

  private async connect(stream: MediaStream, context: AudioContext, vocabulary: string[]): Promise<boolean> {
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
      this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer | { type: string }>) => {
        if (this.closed || this.failed) return;
        if (!(event.data instanceof ArrayBuffer)) {
          if (event.data.type === "flushed") this.flushComplete?.();
          return;
        }
        const data = encodePcm(event.data);
        if (this.ready) this.sendAudio(data);
        else {
          this.queued.push(data);
          // Never silently lose the start of an utterance during slow setup.
          if (this.queued.length > 600) this.fail();
        }
      };

      const response = await fetch("/api/transcribe/live-token", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vocabulary }),
        signal: AbortSignal.any([this.tokenRequest.signal, AbortSignal.timeout(9000)]),
      });
      if (!response.ok) throw new Error("Live token unavailable");
      const body: { token?: string; inputAudioTranscription?: { languageCodes: string[]; customVocabulary: string[] } } = await response.json();
      if (!body.token || !body.inputAudioTranscription) throw new Error("Missing live setup");
      if (this.closed) return false;
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
        this.connectionComplete = settle;
        socket.onopen = () => {
          if (this.closed) { settle(false); return; }
          socket.send(JSON.stringify({ setup: {
            model: MODEL,
            generationConfig: { responseModalities: ["TEXT"] },
            // Use the exact configuration constrained by this session's token.
            inputAudioTranscription: body.inputAudioTranscription,
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
          }
          if (content.interimInputTranscription?.text) {
            this.interim = content.interimInputTranscription.text.trim();
          }
          if (final || content.interimInputTranscription?.text) this.onCaption(this.text);
          if (content.turnComplete && this.awaitingEnd) {
            this.ended = true;
            this.finishComplete?.();
          }
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
    this.finishComplete?.();
    this.flushComplete?.();
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
    if (this.closed || this.failed) return "";
    this.source?.disconnect();
    if (this.worklet) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 80);
        this.flushComplete = () => { clearTimeout(timer); resolve(); };
        this.worklet!.port.postMessage("flush");
      });
      this.flushComplete = null;
    }
    this.disconnectAudio(false);
    if (!this.ready && !this.failed) {
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 350);
        void this.started.then(() => { clearTimeout(timer); resolve(); });
      });
    }
    if (this.active && this.socket?.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        // End-of-stream requests prompt immediate provider finalization. A text
        // segment is not completion: missing confirmation uses the full recording.
        const timeout = setTimeout(resolve, 1200);
        this.finishComplete = () => { clearTimeout(timeout); resolve(); };
        this.awaitingEnd = true;
        this.socket!.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      });
    }
    this.finishComplete = null;
    const text = !this.closed && !this.failed && this.ended && !this.interim ? this.finalized.join(" ").trim() : "";
    this.abort();
    return text;
  }

  abort() {
    if (this.closed) return;
    this.closed = true;
    this.tokenRequest.abort();
    this.connectionComplete?.(false);
    this.flushComplete?.();
    this.finishComplete?.();
    this.disconnectAudio();
    this.socket?.close();
  }
}
