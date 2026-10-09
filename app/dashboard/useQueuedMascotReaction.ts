"use client";

import { useCallback, useEffect, useState } from "react";

export default function useQueuedMascotReaction(blocked: boolean, onPlay: (text: string) => void) {
  const [pending, setPending] = useState<string | null>(null);
  const queue = useCallback((text: string) => setPending(text), []);
  const clear = useCallback(() => setPending(null), []);

  useEffect(() => {
    if (blocked || pending === null) return;
    let alive = true;
    // Dispatch after the response/feedback render, before starting gesture timers.
    const timer = window.setTimeout(() => {
      if (!alive) return;
      setPending(null);
      onPlay(pending);
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [blocked, onPlay, pending]);

  return { queue, clear };
}
