"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { heardLifewood } from "@/lib/lifewood";

export default function useLifewoodGreeting() {
  const [active, setActive] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playedRef = useRef(false);

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelTimer();
    playedRef.current = false;
    setActive(false);
  }, [cancelTimer]);

  const trigger = useCallback((transcript: string) => {
    if (playedRef.current || !heardLifewood(transcript)) return;
    playedRef.current = true;
    setActive(true);
    const timer = setTimeout(() => {
      if (timerRef.current !== timer) return;
      timerRef.current = null;
      setActive(false);
    }, 2000);
    timerRef.current = timer;
  }, []);

  useEffect(() => cancelTimer, [cancelTimer]);

  return { active, trigger, reset };
}
