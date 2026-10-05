"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  VOICE_AUDIO_CONSTRAINTS,
  calibrateVoice,
  readCalibration,
  saveCalibration,
  rmsLevel,
} from "@/lib/voice-activity";
import { microphoneProblem } from "@/lib/voice-feedback";

const EVENT = "anthea-voice-calibration";
const calibrationStamp = () => readCalibration()?.calibratedAt ?? 0;
const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
};
type Run = {
  stream: MediaStream;
  context: AudioContext;
  timer?: ReturnType<typeof setInterval>;
  ambient: number[];
  speech: number[];
};

export default function VoiceCalibration() {
  const savedAt = useSyncExternalStore(subscribe, calibrationStamp, () => 0);
  const [phase, setPhase] = useState<
    "idle" | "permission" | "quiet" | "speech"
  >("idle");
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState("");
  const [seconds, setSeconds] = useState(0);
  const runRef = useRef<Run | null>(null);
  const generation = useRef(0);

  const stop = () => {
    generation.current++;
    const run = runRef.current;
    runRef.current = null;
    if (!run) return;
    clearInterval(run.timer);
    run.stream.getTracks().forEach((track) => track.stop());
    void run.context.close().catch(() => {});
  };
  useEffect(
    () => () => {
      stop();
    },
    [],
  );

  const finish = () => {
    const run = runRef.current;
    if (!run) return;
    stop();
    setPhase("idle");
    setLevel(0);
    try {
      const result = calibrateVoice(run.ambient, run.speech);
      const saved = saveCalibration(result);
      window.dispatchEvent(new Event(EVENT));
      setNotice(
        saved
          ? "Microphone calibrated. Your next voice question will use this sensitivity and send after a short pause."
          : "The test succeeded, but browser storage is unavailable. Default microphone sensitivity will be used.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Calibration failed. Please try again.",
      );
    }
  };

  const start = async () => {
    stop();
    const current = generation.current;
    setPhase("permission");
    setNotice("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: VOICE_AUDIO_CONSTRAINTS,
      });
      if (current !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      let context: AudioContext;
      try {
        context = new AudioContext();
      } catch (error) {
        stream.getTracks().forEach((track) => track.stop());
        throw error;
      }
      const run: Run = { stream, context, ambient: [], speech: [] };
      runRef.current = run;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      context.createMediaStreamSource(stream).connect(analyser);
      if (context.state === "suspended") await context.resume();
      if (current !== generation.current) return;
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (runRef.current !== run) return;
          stop();
          setPhase("idle");
          setLevel(0);
          setNotice(
            "The microphone disconnected. Reconnect it and try the test again.",
          );
        };
      });
      const samples = new Float32Array(analyser.fftSize);
      const began = performance.now();
      let frames = 0;
      setPhase("quiet");
      setSeconds(2);
      run.timer = setInterval(() => {
        if (runRef.current !== run) return;
        const elapsed = performance.now() - began;
        analyser.getFloatTimeDomainData(samples);
        const rms = rmsLevel(samples);
        if (elapsed < 2000) run.ambient.push(rms);
        else run.speech.push(rms);
        if (++frames % 5 === 0) {
          setLevel(Math.min(1, rms * 4));
          setSeconds(
            Math.max(
              0,
              Math.ceil(((elapsed < 2000 ? 2000 : 14000) - elapsed) / 1000),
            ),
          );
        }
        if (elapsed >= 2000) setPhase("speech");
        if (elapsed >= 14000) finish();
      }, 20);
    } catch (error) {
      if (current !== generation.current) return;
      stop();
      setPhase("idle");
      setNotice(microphoneProblem(error));
    }
  };

  return (
    <section
      className="ws-panel ws-voice-calibration"
      aria-labelledby="voice-calibration-title"
    >
      <h2 id="voice-calibration-title">Test your microphone</h2>
      <p>
        Measure background noise and your speaking volume to tune when Cactea
        detects speech. The test stays on this device and does not send a chat
        message.
      </p>
      <br />
      <p className="ws-muted">
        {savedAt
          ? "Your saved microphone calibration is active."
          : "Using standard microphone sensitivity."}
      </p>
      <div role="status">
        {phase === "permission" && <p>Allow microphone access to begin.</p>}
        {phase === "quiet" && (
          <p>
            Stay quiet while we measure background noise. {seconds}s remaining.
          </p>
        )}
        {phase === "speech" && (
          <>
            <p>Read these sentences naturally. {seconds}s remaining.</p>
            <blockquote>
              My plant has yellow leaves and the soil feels dry. How much
              sunlight should my fern receive each day?
            </blockquote>
          </>
        )}
        {notice && <p>{notice}</p>}
      </div>
      {(phase === "quiet" || phase === "speech") && (
        <label className="ws-calibration-meter">
          Microphone level <meter min={0} max={1} value={level} />
        </label>
      )}
      <div className="ws-actions">
        {phase === "idle" ? (
          <button
            type="button"
            className="ws-secondary"
            onClick={() => void start()}
          >
            Start microphone test
          </button>
        ) : (
          <button
            type="button"
            className="ws-secondary"
            onClick={() => {
              stop();
              setPhase("idle");
              setLevel(0);
              setNotice("Microphone test cancelled.");
            }}
          >
            Cancel test
          </button>
        )}
        {phase === "speech" && (
          <button type="button" className="ws-primary" onClick={finish}>
            Finish test
          </button>
        )}
        {phase === "idle" && savedAt > 0 && (
          <button
            type="button"
            className="ws-text-button"
            onClick={() => {
              const saved = saveCalibration(null);
              window.dispatchEvent(new Event(EVENT));
              setNotice(
                saved
                  ? "Standard sensitivity restored."
                  : "Browser storage is unavailable; calibration could not be reset.",
              );
            }}
          >
            Reset calibration
          </button>
        )}
      </div>
    </section>
  );
}
