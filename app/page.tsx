"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MicButton from "@/app/components/MicButton";
import Visualizer from "@/app/components/Visualizer";
import { blobToWav } from "@/lib/wav";

type AgentMode = "idle" | "listening" | "speaking" | "processing";

// #region agent log
function dbgLog(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
  runId = "post-fix"
) {
  const payload = {
    sessionId: "779f22",
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  const body = JSON.stringify(payload);
  fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).catch(() => {});
  fetch("http://127.0.0.1:7448/ingest/432769e9-bda4-4f77-a75b-df7412c83e47", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "779f22",
    },
    body,
  }).catch(() => {});
}
// #endregion

const BENIGN_STT_ERRORS = new Set(["aborted", "no-speech"]);

type AssistantResponse = {
  response_text: string;
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
};

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
  const [transcript, setTranscript] = useState("");
  const [responseText, setResponseText] = useState("");
  const [amplitude, setAmplitude] = useState(0);
  const [micSupported, setMicSupported] = useState(true);
  const [textFallback, setTextFallback] = useState(false);
  const [typedInput, setTypedInput] = useState("");
  const [statusHint, setStatusHint] = useState(
    "Tap the button and describe your plant."
  );
  const [meta, setMeta] = useState<Omit<AssistantResponse, "response_text"> | null>(
    null
  );

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

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== "undefined";
    setMicSupported(ok);
    if (!ok) {
      setTextFallback(true);
      setStatusHint("Microphone recording unavailable. Type your plant description below.");
    }
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
        resolve(new Blob(chunks, { type: recorderMimeRef.current || "audio/webm" }));
        return;
      }
      recorder.onstop = () => {
        const chunks = recordedChunksRef.current;
        mediaRecorderRef.current = null;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(new Blob(chunks, { type: recorderMimeRef.current || "audio/webm" }));
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
      setStatusHint("Tap the button and describe your plant.");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    utter.onstart = () => setMode("speaking");
    utter.onend = () => {
      setMode("idle");
      setStatusHint("Tap the button and describe your plant.");
    };
    utter.onerror = () => {
      setMode("idle");
      setStatusHint("Tap the button and describe your plant.");
    };
    setMode("speaking");
    window.speechSynthesis.speak(utter);
  }, []);

  const submitTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        const msg = "I did not hear anything. Please try again.";
        setResponseText(msg);
        speakText(msg);
        return;
      }

      setMode("processing");
      setStatusHint("Thinking…");
      setResponseText("");
      setMeta(null);

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: trimmed }),
        });
        const data = (await res.json()) as AssistantResponse & { error?: string };
        if (!res.ok && !data.response_text) {
          throw new Error(data.error || "Request failed");
        }
        const spoken =
          data.response_text ||
          "I couldn't process that, please try again.";
        setResponseText(spoken);
        setMeta({
          species_candidate: data.species_candidate,
          watering_days: data.watering_days,
          is_estimate: data.is_estimate,
          diagnosis_confidence: data.diagnosis_confidence,
        });
        speakText(spoken);
      } catch (err) {
        // #region agent log
        dbgLog("C", "page.tsx:submit-catch", "assistant fetch failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        // #endregion
        const msg = "I couldn't process that, please try again.";
        setResponseText(msg);
        speakText(msg);
      }
    },
    [speakText]
  );

  const transcribeWithGemini = useCallback(async (blob: Blob): Promise<string> => {
    setStatusHint("Transcribing with cloud speech…");
    let wav: Blob;
    try {
      wav = await blobToWav(blob);
    } catch {
      wav = blob;
    }
    const form = new FormData();
    form.append("audio", wav, "speech.wav");
    // #region agent log
    dbgLog("C", "page.tsx:transcribe", "Sending audio to /api/transcribe", {
      bytes: wav.size,
      type: wav.type,
    });
    // #endregion
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    const data = (await res.json()) as { transcript?: string; error?: string };
    // #region agent log
    dbgLog("C", "page.tsx:transcribe-result", "Cloud STT result", {
      ok: res.ok,
      len: (data.transcript ?? "").length,
      error: data.error ?? null,
    });
    // #endregion
    if (!res.ok) {
      throw new Error(data.error || "Transcription failed");
    }
    return (data.transcript ?? "").trim();
  }, []);

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
      if ((!text || preferCloudSttRef.current) && recorded && recorded.size > 0) {
        text = await transcribeWithGemini(recorded);
        if (text) {
          setTranscript(text);
          transcriptRef.current = text;
        }
      } else if (!text && recorded && recorded.size > 0) {
        text = await transcribeWithGemini(recorded);
        if (text) {
          setTranscript(text);
          transcriptRef.current = text;
        }
      }

      // #region agent log
      dbgLog("C", "page.tsx:triggerSubmit", "Submitting after listen", {
        usedCloud: !browserText || preferCloudSttRef.current,
        len: text.length,
        hadRecording: !!recorded && recorded.size > 0,
      });
      // #endregion

      await submitTranscript(text);
    } catch (err) {
      // #region agent log
      dbgLog("C", "page.tsx:triggerSubmit-catch", "Submit/transcribe failed", {
        err: err instanceof Error ? err.message : String(err),
      });
      // #endregion
      const msg =
        err instanceof Error && err.message.includes("GEMINI_API_KEY")
          ? "Cloud speech needs a Gemini API key in .env.local. Add GEMINI_API_KEY and restart."
          : "I couldn't process that, please try again.";
      setResponseText(msg);
      setMode("idle");
      setStatusHint(msg);
      setTextFallback(true);
    }
  }, [
    stopAudioMeter,
    stopMediaRecorder,
    stopRecognition,
    submitTranscript,
    transcribeWithGemini,
  ]);

  const startAmplitudeLoop = useCallback(
    (onSilence: () => void) => {
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

        // RMS-only speech gate (works without browser STT transcript)
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
    },
    []
  );

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
      // #region agent log
      dbgLog("D", "page.tsx:beginListening", "beginListening entered", {
        autoSilence: opts.autoSilenceSubmit,
      });
      // #endregion
      submittedRef.current = false;
      preferCloudSttRef.current = false;
      silenceStartedRef.current = null;
      lastHeardSpeechRef.current = false;
      setTranscript("");
      transcriptRef.current = "";
      setResponseText("");
      setMeta(null);
      setMode("listening");
      setStatusHint(
        opts.autoSilenceSubmit
          ? "Listening… pause when finished."
          : "Hold and speak… release to send."
      );

      try {
        await startMicStream();
      } catch (err) {
        // #region agent log
        dbgLog("B", "page.tsx:mic-catch", "getUserMedia failed", {
          err: err instanceof Error ? err.message : String(err),
        });
        // #endregion
        cleanupListening();
        setMode("idle");
        setTextFallback(true);
        setStatusHint(
          "Microphone permission is required. Type your plant description below."
        );
        return;
      }

      // Browser STT is optional live captions; cloud STT is the reliable path
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
          setTranscript(next);
          transcriptRef.current = next;
        };
        recognition.onerror = (event) => {
          const code = event.error;
          // #region agent log
          dbgLog("C", "page.tsx:onerror", "SpeechRecognition error event", {
            error: code,
          });
          // #endregion
          if (BENIGN_STT_ERRORS.has(code)) return;
          // Keep mic + MediaRecorder running; use Gemini transcription on silence
          preferCloudSttRef.current = true;
          setStatusHint(
            "Using cloud speech transcription… keep talking, then pause."
          );
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
          setStatusHint(
            "Using cloud speech transcription… keep talking, then pause."
          );
        }
      } else {
        preferCloudSttRef.current = true;
        setStatusHint(
          "Using cloud speech transcription… keep talking, then pause."
        );
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
            setResponseText(msg);
            speakText(msg);
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
      speakText,
      startAmplitudeLoop,
      startMicStream,
      stopMediaRecorder,
      triggerSubmit,
    ]
  );

  const onStartListen = useCallback(() => {
    // #region agent log
    dbgLog("D", "page.tsx:onStartListen", "Tap to speak clicked", {
      mode: modeRef.current,
    });
    // #endregion
    if (modeRef.current !== "idle") return;
    setTextFallback(false);
    void beginListening({ autoSilenceSubmit: true });
  }, [beginListening]);

  const onPushStart = useCallback(() => {
    if (modeRef.current !== "idle") return;
    setTextFallback(false);
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="brand">Anthea</p>
        <h1 className="headline">Plant voice assistant</h1>
        <p className="subhead">
          Describe traits, symptoms, and soil. I will identify, diagnose, and
          suggest watering.
        </p>
      </header>

      <main className="stage">
        <Visualizer amplitude={amplitude} mode={mode} />
        <p className="status" aria-live="polite">
          {statusHint}
        </p>

        {micSupported && (
          <MicButton
            mode={mode}
            speechSupported
            onStartListen={onStartListen}
            onPushStart={onPushStart}
            onPushEnd={onPushEnd}
          />
        )}

        {textFallback && (
          <form
            className="text-fallback"
            onSubmit={(e) => {
              e.preventDefault();
              const text = typedInput.trim();
              if (!text || mode === "processing" || mode === "speaking") return;
              setTranscript(text);
              transcriptRef.current = text;
              void submitTranscript(text);
            }}
          >
            <label htmlFor="typed-plant">
              Or type what you would say about the plant
            </label>
            <textarea
              id="typed-plant"
              rows={3}
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder="Square stems, purple flowers, yellowing lower leaves, sandy soil…"
              disabled={mode === "processing" || mode === "speaking"}
            />
            <button
              type="submit"
              className="mic-btn"
              disabled={
                !typedInput.trim() ||
                mode === "processing" ||
                mode === "speaking"
              }
            >
              Send
            </button>
          </form>
        )}

        <section className="panels" aria-live="polite">
          <div className="panel">
            <h2>You said</h2>
            <p>{transcript || "—"}</p>
          </div>
          <div className="panel">
            <h2>Reply</h2>
            <p>{responseText || "—"}</p>
            {meta && (
              <p className="meta">
                {meta.species_candidate
                  ? `Species: ${meta.species_candidate}. `
                  : ""}
                {meta.watering_days != null
                  ? `Watering: every ${meta.watering_days} days. `
                  : ""}
                {meta.is_estimate ? "Care data: estimate. " : "Care data: lookup. "}
                Diagnosis confidence: {meta.diagnosis_confidence}.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
