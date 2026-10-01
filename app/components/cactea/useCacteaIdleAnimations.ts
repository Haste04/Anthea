"use client";

import { useEffect, useRef } from "react";

type Gesture = "jump" | "smile";

export default function useCacteaIdleAnimations(enabled: boolean) {
  const mascotRef = useRef<HTMLButtonElement>(null);
  const jumpRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const mascot = mascotRef.current;
    const bounce = mascot?.firstElementChild as HTMLElement | null;
    const mouth = mascot?.querySelector<HTMLElement>("[data-cactea-mouth] > img");
    if (!enabled || !mascot || !bounce || !mouth || typeof bounce.animate !== "function") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const active = new Map<Gesture, Animation>();
    let alive = true;
    let timer = 0;
    let nextGesture: Gesture = "jump";

    function clearTimer() {
      if (timer) window.clearTimeout(timer);
      timer = 0;
    }

    function schedule() {
      if (!alive || document.hidden || reducedMotion.matches || timer || active.size) return;
      const delay = nextGesture === "jump"
        ? 15000 + Math.random() * 10000
        : 8000 + Math.random() * 6000;
      timer = window.setTimeout(() => {
        timer = 0;
        play(nextGesture);
      }, delay);
    }

    function play(gesture: Gesture) {
      if (!alive || document.hidden || active.has(gesture)) return;
      if (gesture === "smile" && reducedMotion.matches) return;
      clearTimer();

      let animation: Animation;
      if (gesture === "jump") {
        if (reducedMotion.matches) {
          animation = bounce!.animate([{ opacity: 1 }, { opacity: 0.8 }, { opacity: 1 }], {
            duration: 180, easing: "ease-out",
          });
        } else {
          const height = Math.max(6, Math.min(10, mascot!.getBoundingClientRect().width * 0.025));
          animation = bounce!.animate([
            { transform: "translateY(0) scale(1)", offset: 0 },
            { transform: "translateY(0) scale(1.035, .965)", offset: 0.18 },
            { transform: `translateY(-${height}px) scale(.98, 1.02)`, offset: 0.45 },
            { transform: "translateY(0) scale(1.025, .975)", offset: 0.75 },
            { transform: "translateY(0) scale(1)", offset: 1 },
          ], { duration: 700, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
        }
      } else {
        // Animate the existing artwork, keeping its shape and texture intact.
        animation = mouth!.animate([
          { transform: "translateY(0) scale(1)", offset: 0 },
          { transform: "translateY(-2%) scale(1.08, 1.1)", offset: 0.2 },
          { transform: "translateY(-2%) scale(1.08, 1.1)", offset: 0.7 },
          { transform: "translateY(0) scale(1)", offset: 1 },
        ], { duration: 2200, easing: "ease-in-out" });
      }

      active.set(gesture, animation);
      nextGesture = gesture === "jump" ? "smile" : "jump";
      animation.onfinish = () => {
        if (!alive || active.get(gesture) !== animation) return;
        active.delete(gesture);
        animation.onfinish = null;
        schedule();
      };
    }

    function stop() {
      clearTimer();
      active.forEach(animation => {
        animation.onfinish = null;
        animation.cancel();
      });
      active.clear();
    }

    function availabilityChanged() {
      stop();
      schedule();
    }

    jumpRef.current = () => play("jump");
    document.addEventListener("visibilitychange", availabilityChanged);
    reducedMotion.addEventListener("change", availabilityChanged);
    schedule();

    return () => {
      alive = false;
      jumpRef.current = null;
      stop();
      document.removeEventListener("visibilitychange", availabilityChanged);
      reducedMotion.removeEventListener("change", availabilityChanged);
    };
  }, [enabled]);

  return { mascotRef, jump: () => jumpRef.current?.() };
}
