"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MicButton from "@/app/components/MicButton";
import Visualizer from "@/app/components/Visualizer";
import { blobToWav } from "@/lib/wav";

type AgentMode = "idle" | "listening" | "speaking" | "processing";

const BENIGN_STT_ERRORS = new Set(["aborted", "no-speech"]);

type AssistantResponse = {
  response_text: string;
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: Omit<AssistantResponse, "response_text"> | null;
  pending?: boolean;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const SILENCE_MS = 1200;
const RMS_THRESHOLD = 0.02;
const NO_SPEECH_TIMEOUT_MS = 15000;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function Home() {
  const [mode, setMode] = useState<AgentMode>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Describe a plant's traits, symptoms, and soil, and I'll help identify it, diagnose issues, and work out a watering schedule.",
    },
  ]);
  const [liveCaption, setLiveCaption] = useState("");
  const [amplitude, setAmplitude] = useState(0);
  const [micSupported, setMicSupported] = useState(true);
  const [typedInput, setTypedInput] = useState("");
  const [statusHint, setStatusHint] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef("");
  const preferCloudSttRef = useRef(false);
  const rafAmpRef = useRef<number>(0);
  const silenceStartedRef = useRef<number | null>(null);
  const lastHeardSpeechRef = useRef(false);
  const transcriptRef = useRef("");
  const submittedRef = useRef(false);
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<AgentMode>("idle");
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    transcriptRef.current = liveCaption;
  }, [liveCaption]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveCaption]);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setMicSupported(ok);
    if (!ok) {
      setMessages((prev) => [
        ...prev,
        {
          id: newId(),
          role: "assistant",
          text: "Microphone recording isn't available in this browser. You can still type a description below.",
        },
      ]);
    }
  }, []);

  const pushAssistantMessage = useCallback((text: string) => {
    setMessages((prev) => [...prev, { id: newId(), role: "assistant", text }]);
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  const stopMediaRecorder = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        const chunks = recordedChunksRef.current;
        mediaRecorderRef.current = null;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(
          new Blob(chunks, { type: recorderMimeRef.current || "audio/webm" }),
        );
        return;
      }
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        mediaRecorderRef.current = null;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(
          new Blob(chunks, { type: recorderMimeRef.current || "audio/webm" }),
        );
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (rafAmpRef.current) cancelAnimationFrame(rafAmpRef.current);
    rafAmpRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    setAmplitude(0);
  }, []);

  const cleanupListening = useCallback(() => {
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
    stopRecognition();
    stopAudioMeter();
    silenceStartedRef.current = null;
    lastHeardSpeechRef.current = false;
  }, [stopAudioMeter, stopRecognition]);

  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setMode("idle");
      setStatusHint("");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.onstart = () => setMode("speaking");
    utter.onend = () => {
      setMode("idle");
      setStatusHint("");
    };
    utter.onerror = () => {
      setMode("idle");
      setStatusHint("");
    };
    setMode("speaking");
    window.speechSynthesis.speak(utter);
  }, []);

  const submitTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        const msg = "I did not hear anything. Please try again.";
        pushAssistantMessage(msg);
        speakText(msg);
        return;
      }

      const userId = newId();
      const assistantId = newId();
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", text: trimmed },
        { id: assistantId, role: "assistant", text: "", pending: true },
      ]);
      setMode("processing");
      setStatusHint("Thinking…");
      setLiveCaption("");

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: trimmed }),
        });
        const data = (await res.json()) as AssistantResponse & {
          error?: string;
        };
        if (!res.ok && !data.response_text) {
          throw new Error(data.error || "Request failed");
        }
        const spoken =
          data.response_text || "I couldn't process that, please try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: spoken,
                  pending: false,
                  meta: {
                    species_candidate: data.species_candidate,
                    watering_days: data.watering_days,
                    is_estimate: data.is_estimate,
                    diagnosis_confidence: data.diagnosis_confidence,
                  },
                }
              : m,
          ),
        );
        speakText(spoken);
      } catch (err) {
        console.error("assistant fetch failed", err);
        const msg = "I couldn't process that, please try again.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: msg, pending: false } : m,
          ),
        );
        speakText(msg);
      }
    },
    [pushAssistantMessage, speakText],
  );

  const transcribeWithGemini = useCallback(
    async (blob: Blob): Promise<string> => {
      setStatusHint("Transcribing…");
      let wav: Blob;
      try {
        wav = await blobToWav(blob);
      } catch {
        wav = blob;
      }
      const form = new FormData();
      form.append("audio", wav, "speech.wav");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        transcript?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Transcription failed");
      }
      return (data.transcript ?? "").trim();
    },
    [],
  );

  const triggerSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    const browserText = transcriptRef.current.trim();
    const recorded = await stopMediaRecorder();
    stopRecognition();
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
    stopAudioMeter();
    silenceStartedRef.current = null;

    setMode("processing");

    try {
      let text = browserText;
      if (
        (!text || preferCloudSttRef.current) &&
        recorded &&
        recorded.size > 0
      ) {
        text = await transcribeWithGemini(recorded);
        if (text) {
          setLiveCaption(text);
          transcriptRef.current = text;
        }
      } else if (!text && recorded && recorded.size > 0) {
        text = await transcribeWithGemini(recorded);
        if (text) {
          setLiveCaption(text);
          transcriptRef.current = text;
        }
      }

      await submitTranscript(text);
    } catch (err) {
      console.error("submit/transcribe failed", err);
      const msg =
        err instanceof Error && err.message.includes("GEMINI_API_KEY")
          ? "Cloud speech needs a Gemini API key configured. Try typing your description instead."
          : "I couldn't process that, please try again.";
      pushAssistantMessage(msg);
      setMode("idle");
      setStatusHint("");
    }
  }, [
    pushAssistantMessage,
    stopAudioMeter,
    stopMediaRecorder,
    stopRecognition,
    submitTranscript,
    transcribeWithGemini,
  ]);

  const startAmplitudeLoop = useCallback((onSilence: () => void) => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (modeRef.current !== "listening") return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      setAmplitude(Math.min(1, rms * 4));

      if (rms >= RMS_THRESHOLD) {
        silenceStartedRef.current = null;
        lastHeardSpeechRef.current = true;
      } else if (lastHeardSpeechRef.current) {
        if (silenceStartedRef.current == null) {
          silenceStartedRef.current = performance.now();
        } else if (
          performance.now() - silenceStartedRef.current >=
          SILENCE_MS
        ) {
          onSilence();
          return;
        }
      }

      rafAmpRef.current = requestAnimationFrame(tick);
    };

    rafAmpRef.current = requestAnimationFrame(tick);
  }, []);

  const startMicStream = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;

    recordedChunksRef.current = [];
    const mime = pickRecorderMime();
    recorderMimeRef.current = mime;
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunksRef.current.push(event.data);
    };
    recorder.start(250);
  }, []);

  const beginListening = useCallback(
    async (opts: { autoSilenceSubmit: boolean }) => {
      submittedRef.current = false;
      preferCloudSttRef.current = false;
      silenceStartedRef.current = null;
      lastHeardSpeechRef.current = false;
      setLiveCaption("");
      transcriptRef.current = "";
      setMode("listening");
      setStatusHint(opts.autoSilenceSubmit ? "Listening…" : "Hold and speak…");

      try {
        await startMicStream();
      } catch (err) {
        console.error("getUserMedia failed", err);
        cleanupListening();
        setMode("idle");
        setStatusHint("");
        pushAssistantMessage(
          "Microphone permission is required for voice input. You can type your plant description below instead.",
        );
        return;
      }

      const Ctor = getSpeechRecognitionCtor();
      if (Ctor) {
        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          if (preferCloudSttRef.current) return;
          let interim = "";
          let finalText = "";
          for (let i = 0; i < event.results.length; i++) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += piece;
            else interim += piece;
          }
          const next = (finalText || interim).trim();
          setLiveCaption(next);
          transcriptRef.current = next;
        };
        recognition.onerror = (event) => {
          const code = event.error;
          if (BENIGN_STT_ERRORS.has(code)) return;
          preferCloudSttRef.current = true;
          setStatusHint("Using cloud speech… keep talking, then pause.");
          try {
            recognition.stop();
          } catch {
            /* ignore */
          }
        };
        recognition.onend = () => {
          /* RMS silence / release is the submit trigger */
        };
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          preferCloudSttRef.current = true;
          setStatusHint("Using cloud speech… keep talking, then pause.");
        }
      } else {
        preferCloudSttRef.current = true;
        setStatusHint("Using cloud speech… keep talking, then pause.");
      }

      if (opts.autoSilenceSubmit) {
        startAmplitudeLoop(() => {
          void triggerSubmit();
        });
        noSpeechTimerRef.current = setTimeout(() => {
          if (submittedRef.current) return;
          if (!lastHeardSpeechRef.current) {
            submittedRef.current = true;
            void stopMediaRecorder();
            cleanupListening();
            const msg = "I did not hear anything. Please try again.";
            pushAssistantMessage(msg);
            speakText(msg);
            setMode("idle");
            setStatusHint("");
          } else {
            void triggerSubmit();
          }
        }, NO_SPEECH_TIMEOUT_MS);
      } else {
        startAmplitudeLoop(() => {
          /* PTT submits on release only */
        });
      }
    },
    [
      cleanupListening,
      pushAssistantMessage,
      speakText,
      startAmplitudeLoop,
      startMicStream,
      stopMediaRecorder,
      triggerSubmit,
    ],
  );

  const onStartListen = useCallback(() => {
    if (modeRef.current !== "idle") return;
    void beginListening({ autoSilenceSubmit: true });
  }, [beginListening]);

  const onPushStart = useCallback(() => {
    if (modeRef.current !== "idle") return;
    void beginListening({ autoSilenceSubmit: false });
  }, [beginListening]);

  const onPushEnd = useCallback(() => {
    if (modeRef.current !== "listening") return;
    void triggerSubmit();
  }, [triggerSubmit]);

  useEffect(() => {
    return () => {
      void stopMediaRecorder();
      cleanupListening();
      if (typeof window !== "undefined") window.speechSynthesis.cancel();
    };
  }, [cleanupListening, stopMediaRecorder]);

  const composerDisabled = mode === "processing" || mode === "speaking";
  const statusDotLabel =
    mode === "listening"
      ? "Listening"
      : mode === "processing"
        ? "Thinking"
        : mode === "speaking"
          ? "Speaking"
          : "Ready";

  return (
    <div className="app-shell">
      <header className="chat-header">
        <span className="brand">Anthea</span>
        <span className={`status-pill status-pill--${mode}`}>
          <span className="status-dot" aria-hidden />
          {statusDotLabel}
        </span>
      </header>

      <main className="chat-scroll" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`msg-row msg-row--${m.role}`}>
            {m.role === "assistant" && (
              <div className={`msg-avatar msg-avatar--${mode}`}>
                <Visualizer amplitude={amplitude} mode={mode} />
              </div>
            )}
            <div className="msg-col">
              <div className={`msg-bubble msg-bubble--${m.role}`}>
                {m.pending ? (
                  <span className="typing-dots" aria-label="Thinking">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  m.text
                )}
              </div>
              {m.meta && !m.pending && (
                <p className="msg-meta">
                  {m.meta.species_candidate
                    ? `Species: ${m.meta.species_candidate}. `
                    : ""}
                  {m.meta.watering_days != null
                    ? `Watering: every ${m.meta.watering_days} days. `
                    : ""}
                  {m.meta.is_estimate
                    ? "Care data: estimate. "
                    : "Care data: lookup. "}
                  Diagnosis confidence: {m.meta.diagnosis_confidence}.
                </p>
              )}
            </div>
          </div>
        ))}

        {mode === "listening" && (
          <div className="msg-row msg-row--user msg-row--ghost">
            <div className="msg-col">
              <div className="msg-bubble msg-bubble--user msg-bubble--ghost">
                {liveCaption || "…"}
              </div>
            </div>
          </div>
        )}

        <div ref={scrollEndRef} />
      </main>

      {statusHint && <p className="status-hint">{statusHint}</p>}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          const text = typedInput.trim();
          if (!text || composerDisabled) return;
          setTypedInput("");
          void submitTranscript(text);
        }}
      >
        {micSupported && (
          <div className="composer-mic">
            <MicButton
              mode={mode}
              speechSupported
              onStartListen={onStartListen}
              onPushStart={onPushStart}
              onPushEnd={onPushEnd}
            />
          </div>
        )}
        <textarea
          className="composer-input"
          rows={1}
          value={typedInput}
          onChange={(e) => setTypedInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const text = typedInput.trim();
              if (!text || composerDisabled) return;
              setTypedInput("");
              void submitTranscript(text);
            }
          }}
          placeholder="Describe your plant, or tap the mic…"
          disabled={composerDisabled}
        />
        <button
          type="submit"
          className="composer-send"
          disabled={!typedInput.trim() || composerDisabled}
          aria-label="Send"
        >
          →
        </button>
      </form>
    </div>
  );
}
