"use client";

import { useEffect, type RefObject } from "react";

export default function useCacteaSmile(mascotRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const mascot = mascotRef.current;
    if (!enabled || !mascot) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let timer = 0;

    function schedule() {
      if (!alive || document.hidden || reducedMotion.matches) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (!alive || document.hidden || reducedMotion.matches) return;
        mascot!.setAttribute("data-smiling", "true");
        timer = window.setTimeout(() => {
          timer = 0;
          if (!alive) return;
          mascot!.removeAttribute("data-smiling");
          schedule();
        }, 1800);
      }, 3200);
    }

    function reset() {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      mascot!.removeAttribute("data-smiling");
    }
    function refresh() { reset(); schedule(); }

    document.addEventListener("visibilitychange", refresh);
    reducedMotion.addEventListener("change", refresh);
    schedule();
    return () => {
      alive = false;
      reset();
      document.removeEventListener("visibilitychange", refresh);
      reducedMotion.removeEventListener("change", refresh);
    };
  }, [enabled, mascotRef]);
}
