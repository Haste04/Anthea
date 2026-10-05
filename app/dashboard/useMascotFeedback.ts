"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CacteaFeedback } from "@/lib/cactea-state";

export default function useMascotFeedback() {
  const [feedback, setFeedback] = useState<CacteaFeedback>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldForSpeechRef = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const clear = useCallback(() => {
    cancelTimer();
    heldForSpeechRef.current = false;
    setFeedback(null);
  }, [cancelTimer]);

  const show = useCallback((next: Exclude<CacteaFeedback, null>, untilSpeechEnds = false) => {
    cancelTimer();
    heldForSpeechRef.current = untilSpeechEnds;
    setFeedback(next);
    if (untilSpeechEnds) return;
    const timer = setTimeout(() => {
      if (timerRef.current !== timer) return;
      timerRef.current = null;
      setFeedback(null);
    }, next === "angry" ? 1800 : next === "success" ? 720 : 900);
    timerRef.current = timer;
  }, [cancelTimer]);

  const finishSpeech = useCallback(() => {
    if (heldForSpeechRef.current) clear();
  }, [clear]);

  useEffect(() => cancelTimer, [cancelTimer]);

  return { feedback, show, clear, finishSpeech };
}
