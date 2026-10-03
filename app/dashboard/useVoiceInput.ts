"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceCapture, emptyCaptureState } from "@/lib/voice-capture";
import { buildPlantVocabulary, type PlantNameReview } from "@/lib/voice-vocabulary";

let warming: Promise<void> | null = null;
let warmedAt = 0;
function warmFallback() {
  if (warming || Date.now() - warmedAt < 5 * 60_000) return;
  warming = fetch("/api/transcribe", {
    method: "POST", headers: { "x-anthea-warmup": "1" }, signal: AbortSignal.timeout(55000),
  }).then(response => { if (response.ok) warmedAt = Date.now(); })
    .catch(() => { /* Voice input still works if best-effort warmup fails. */ })
    .finally(() => { warming = null; });
}

export default function useVoiceInput(callbacks: {
  onTranscript(text: string): void;
  onDraft(text: string): void;
  onReview?(review: PlantNameReview): void;
  onPhase(phase: "idle" | "listening" | "processing"): void;
  vocabulary?: string[];
}) {
  const latest = useRef(callbacks);
  useEffect(() => { latest.current = callbacks; });
  const [state, setState] = useState(emptyCaptureState);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const amplitudeRef = useRef(0);
  const captureRef = useRef<VoiceCapture | null>(null);
  useEffect(() => {
    const capture = new VoiceCapture({
      onState: setState,
      onPhase: phase => latest.current.onPhase(phase),
      onTranscript: text => latest.current.onTranscript(text),
      onDraft: text => latest.current.onDraft(text),
      onReview: review => latest.current.onReview?.(review),
      onAnalyser: analyser => { analyserRef.current = analyser; },
      onLevel: level => { amplitudeRef.current = level; },
    });
    captureRef.current = capture;
    warmFallback();
    return () => { capture.cancel(false); captureRef.current = null; };
  }, []);
  const start = useCallback((autoSubmit = true) => {
    warmFallback();
    return captureRef.current?.start(autoSubmit, latest.current.vocabulary ?? buildPlantVocabulary([]));
  }, []);
  const finish = useCallback(() => captureRef.current?.finish(), []);
  const cancel = useCallback(() => captureRef.current?.cancel(), []);
  const retry = useCallback(() => captureRef.current?.retry(), []);
  const confirmName = useCallback((name: string) => captureRef.current?.confirmName(name), []);
  return {
    ...state, analyserRef, amplitudeRef, start, finish, cancel, retry, confirmName,
  };
}
