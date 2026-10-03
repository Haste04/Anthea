import { LiveTranscription } from "@/lib/live-transcription";
import { VoiceActivityDetector, VOICE_AUDIO_CONSTRAINTS, readCalibration, rmsLevel } from "@/lib/voice-activity";
import { blobToWav } from "@/lib/wav";
import { microphoneProblem } from "@/lib/voice-feedback";
import { applyPlantNameSuggestion, buildPlantVocabulary, findPlantNameReview, normalizeVoiceVocabulary, type PlantNameReview } from "@/lib/voice-vocabulary";

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string;
  onresult: ((event: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
export type CaptureState = {
  ready: boolean; transcribing: boolean; caption: string; liveAvailable: boolean;
  issue: string | null; canRetry: boolean;
  review: PlantNameReview | null;
};
export const emptyCaptureState: CaptureState = {
  ready: false, transcribing: false, caption: "", liveAvailable: false, issue: null, canRetry: false,
  review: null,
};
type Callbacks = {
  onState(state: CaptureState): void;
  onPhase(phase: "idle" | "listening" | "processing"): void;
  onTranscript(text: string): void;
  onDraft(text: string): void;
  onReview?(review: PlantNameReview): void;
  onAnalyser(analyser: AnalyserNode | null): void;
  onLevel(level: number): void;
};
type Session = {
  finishing: boolean; ready: boolean; controller: AbortController;
  vad: VoiceActivityDetector; browserText: string; browserFinal: string; browserInterim: boolean; browserFailed: boolean;
  stream?: MediaStream; context?: AudioContext; source?: MediaStreamAudioSourceNode;
  recorder?: MediaRecorder; recorded?: Promise<Blob | null>; chunks: Blob[];
  recognition?: Recognition; live?: LiveTranscription;
  vocabulary: string[];
  meter?: ReturnType<typeof setInterval>; deadline?: ReturnType<typeof setTimeout>;
  maxDuration?: ReturnType<typeof setTimeout>;
};

/** Owns one microphone turn; all async completions must still own this session. */
export class VoiceCapture {
  private session: Session | null = null;
  private retained: Blob | null = null;
  private retainedVocabulary: string[] = [];
  private state = { ...emptyCaptureState };
  constructor(private callbacks: Callbacks) {}

  private update(patch: Partial<CaptureState>) {
    this.state = { ...this.state, ...patch };
    this.callbacks.onState(this.state);
  }

  async start(autoSubmit = true, vocabulary = buildPlantVocabulary([])) {
    if (this.session) return;
    this.retained = null;
    const session: Session = {
      finishing: false, ready: false, controller: new AbortController(),
      vad: new VoiceActivityDetector(readCalibration() ?? undefined),
      browserText: "", browserFinal: "", browserInterim: false, browserFailed: false, chunks: [],
      vocabulary: normalizeVoiceVocabulary(vocabulary, 5000),
    };
    this.session = session;
    this.update({ ...emptyCaptureState });
    this.callbacks.onPhase("listening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: VOICE_AUDIO_CONSTRAINTS });
      if (this.session !== session) { stream.getTracks().forEach(track => track.stop()); return; }
      session.stream = stream;
      const context = new AudioContext();
      session.context = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      session.source = context.createMediaStreamSource(stream);
      session.source.connect(analyser);
      if (context.state === "suspended") await context.resume();
      if (this.session !== session) return;
      this.callbacks.onAnalyser(analyser);
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      session.recorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
      recorder.onerror = () => this.failRecording(session, "Recording stopped unexpectedly. Retry your microphone or type your question.");
      stream.getAudioTracks().forEach(track => {
        track.onended = () => this.failRecording(session, "The microphone disconnected. Reconnect it and retry, or type your question.");
      });
      recorder.start(100);
      session.ready = true;
      this.update({ ready: true });
      try { this.startBrowserRecognition(session); } catch { session.browserFailed = true; }
      session.live = new LiveTranscription(stream, context, {
        onCaption: text => {
          if (this.session === session) this.update({ caption: text, liveAvailable: true });
        },
        onReady: () => { if (this.session === session) this.update({ liveAvailable: true }); },
        onFailure: () => {
          if (this.session === session) this.update({ liveAvailable: Boolean(session.recognition && !session.browserFailed) });
        },
      }, session.vocabulary);
      const samples = new Float32Array(analyser.fftSize);
      // Metering uses a timer rather than RAF so reduced-motion settings do not affect VAD.
      session.meter = setInterval(() => {
        if (this.session !== session || session.finishing) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = rmsLevel(samples);
        this.callbacks.onLevel(Math.min(1, rms * 4));
        if (session.vad.update(rms, Date.now()) && autoSubmit) void this.finish();
      }, 20);
      session.deadline = setTimeout(() => {
        if (this.session !== session || session.finishing || session.vad.hasSpeech) return;
        if (session.browserText.trim() || session.live?.text.trim()) void this.finish();
        else this.failRecording(session, "No voice was detected. Move closer to your microphone, calibrate it in Settings, or type your question.");
      }, 15000);
      session.maxDuration = setTimeout(() => { if (this.session === session) void this.finish(); }, 60000);
    } catch (error) {
      if (this.session !== session) return;
      this.cancel();
      this.update({ issue: microphoneProblem(error) });
    }
  }

  private startBrowserRecognition(session: Session) {
    const browser = window as Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) return;
    const recognition = new Constructor();
    session.recognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = event => {
      if (this.session !== session) return;
      const results = Array.from(event.results);
      session.browserText = results.map(result => result[0].transcript.trim()).join(" ").trim();
      session.browserFinal = results.filter(result => result.isFinal).map(result => result[0].transcript.trim()).join(" ").trim();
      session.browserInterim = results.some(result => !result.isFinal && result[0].transcript.trim());
      if (!session.live?.active) this.update({ caption: session.browserText, liveAvailable: true });
    };
    recognition.onerror = event => {
      if (["aborted", "no-speech"].includes(event.error) || this.session !== session) return;
      session.browserFailed = true;
      if (!session.live?.active) this.update({ liveAvailable: false });
    };
    recognition.onend = () => {
      if (this.session !== session || session.finishing) return;
      // A recognizer that stopped early cannot cover the rest of the recording.
      session.browserFailed = true;
      if (!session.live?.active) this.update({ liveAvailable: false });
    };
    try { recognition.start(); } catch { session.browserFailed = true; }
  }

  private failRecording(session: Session, issue: string) {
    if (this.session !== session || session.finishing) return;
    const draft = session.live?.text || session.browserText;
    this.cancel();
    if (draft) this.callbacks.onDraft(draft);
    this.update({ issue });
  }

  private stopRecorder(session: Session): Promise<Blob | null> {
    if (session.recorded) return session.recorded;
    session.recorded = new Promise(resolve => {
      const recorder = session.recorder;
      const done = () => { clearTimeout(timer); resolve(session.chunks.length ? new Blob(session.chunks, { type: recorder?.mimeType || "audio/webm" }) : null); };
      const timer = setTimeout(done, 1000);
      if (!recorder || recorder.state === "inactive") { done(); return; }
      recorder.onstop = done;
      try { recorder.stop(); } catch { done(); }
    });
    return session.recorded;
  }

  private finishBrowser(session: Session): Promise<string> {
    const recognition = session.recognition;
    if (!recognition || session.browserFailed) return Promise.resolve("");
    const finalText = () => !session.browserFailed && !session.browserInterim ? session.browserFinal : "";
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(finalText()), 250);
      recognition.onend = () => { clearTimeout(timer); resolve(finalText()); };
      try { recognition.stop(); } catch { clearTimeout(timer); resolve(finalText()); }
    });
  }

  async finish() {
    const session = this.session;
    if (!session || session.finishing) return;
    // Releasing PTT while permission is pending must not start a late recording.
    if (!session.ready) { this.cancel(); return; }
    session.finishing = true;
    clearInterval(session.meter);
    clearTimeout(session.deadline);
    clearTimeout(session.maxDuration);
    this.update({ ready: false, transcribing: true, canRetry: false });
    this.callbacks.onPhase("processing");
    try {
      const [liveText, browserText, recorded] = await Promise.all([
        session.live?.finish().catch(() => "") ?? Promise.resolve(""),
        this.finishBrowser(session), this.stopRecorder(session),
      ]);
      if (this.session !== session) return;
      this.releaseAudio(session);
      this.retained = recorded;
      this.retainedVocabulary = session.vocabulary;
      let text = liveText.trim() || browserText.trim();
      if (recorded?.size) {
        if (!text && session.vad.hasSpeech) text = await this.transcribe(recorded, session.controller.signal, session.vocabulary);
        else if (findPlantNameReview(text, session.vocabulary)) {
          // Accuracy retries are best effort: preserve the original draft on failure.
          try { text = (await this.transcribe(recorded, session.controller.signal, session.vocabulary)) || text; }
          catch { /* Name review below still guards the original transcript. */ }
        }
      }
      if (this.session !== session) return;
      this.deliver(session, text);
    } catch (error) {
      if (this.session !== session) return;
      this.releaseAudio(session);
      this.session = null;
      if (this.state.caption) this.callbacks.onDraft(this.state.caption);
      this.callbacks.onPhase("idle");
      this.update({ ready: false, transcribing: false, canRetry: Boolean(this.retained), issue: error instanceof Error ? error.message : "Transcription failed. Retry or type your question." });
    }
  }

  private async transcribe(blob: Blob, signal: AbortSignal, vocabulary: string[]): Promise<string> {
    let audio = blob;
    try { audio = await blobToWav(blob); } catch { /* The server can decode the original recording. */ }
    if (signal.aborted) return "";
    const form = new FormData();
    form.append("audio", audio, audio.type.includes("wav") ? "speech.wav" : "speech");
    form.append("vocabulary", JSON.stringify(normalizeVoiceVocabulary(vocabulary)));
    const response = await fetch("/api/transcribe", {
      method: "POST", body: form, signal: AbortSignal.any([signal, AbortSignal.timeout(65000)]),
    });
    if (!response.ok) throw new Error(response.status === 429 ? "Too many voice requests. Wait a minute, then retry transcription." : "Transcription is unavailable. Retry the saved recording or type your question.");
    const data = await response.json();
    return typeof data.transcript === "string" ? data.transcript.trim() : "";
  }

  private deliver(session: Session, text: string) {
    if (this.session !== session) return;
    this.session = null;
    this.presentTranscript(text, session.vocabulary);
  }

  private presentTranscript(text: string, vocabulary: string[]) {
    const review = text ? findPlantNameReview(text, vocabulary) : null;
    if (review) {
      this.update({ ...emptyCaptureState, review, canRetry: Boolean(this.retained) });
      this.callbacks.onPhase("idle");
      this.callbacks.onDraft(text);
      this.callbacks.onReview?.(review);
      return;
    }
    this.retained = null;
    this.retainedVocabulary = [];
    this.update({ ...emptyCaptureState, issue: text ? null : "No words were detected. Try again or type your question." });
    this.callbacks.onPhase("idle");
    if (text) this.callbacks.onTranscript(text);
  }

  confirmName(name: string) {
    if (this.session || !this.state.review) return;
    const text = applyPlantNameSuggestion(this.state.review, name);
    if (text !== null) this.presentTranscript(text, this.retainedVocabulary);
  }

  async retry() {
    if (this.session || !this.retained) return;
    const session: Session = { finishing: true, ready: false, controller: new AbortController(), vad: new VoiceActivityDetector(), chunks: [], browserText: "", browserFinal: "", browserInterim: false, browserFailed: false, vocabulary: this.retainedVocabulary };
    this.session = session;
    this.update({ transcribing: true, canRetry: false, issue: null });
    this.callbacks.onPhase("processing");
    try { this.deliver(session, await this.transcribe(this.retained, session.controller.signal, session.vocabulary)); }
    catch (error) {
      if (this.session !== session) return;
      this.session = null;
      this.callbacks.onPhase("idle");
      this.update({ transcribing: false, canRetry: true, issue: error instanceof Error ? error.message : "Transcription failed. Try again." });
    }
  }

  private releaseAudio(session: Session) {
    clearInterval(session.meter); clearTimeout(session.deadline); clearTimeout(session.maxDuration);
    if (session.recognition) {
      session.recognition.onresult = null; session.recognition.onerror = null; session.recognition.onend = null;
      try { session.recognition.abort(); } catch { /* already stopped */ }
    }
    session.live?.abort();
    session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    session.source?.disconnect();
    if (session.context && session.context.state !== "closed") void session.context.close().catch(() => {});
    this.callbacks.onAnalyser(null);
    this.callbacks.onLevel(0);
  }

  cancel(notify = true) {
    const session = this.session;
    this.session = null;
    this.retained = null;
    this.retainedVocabulary = [];
    if (session) {
      session.controller.abort();
      void this.stopRecorder(session);
      this.releaseAudio(session);
    }
    if (notify) { this.update({ ...emptyCaptureState }); this.callbacks.onPhase("idle"); }
  }
}
