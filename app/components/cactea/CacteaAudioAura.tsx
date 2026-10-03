"use client";

import { useEffect, useRef } from "react";
import Cactea from "./Cactea";
import type { CacteaProps } from "./Cactea.types";

interface CacteaAudioAuraProps extends CacteaProps {
  volumeRef?: React.RefObject<number>;
}

export default function CacteaAudioAura({
  state,
  size = "md",
  className,
  ariaLabel,
  volumeRef,
  chatExpressions,
}: CacteaAudioAuraProps) {
  const isListening = state === "listening";
  const isSpeaking = state === "speaking";
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isListening) return;
    const ring = ringRef.current;
    if (!ring) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      const volume = Math.max(0, Math.min(1, volumeRef?.current ?? 0));
      ring.style.setProperty("--aura-scale", reducedMotion.matches ? "1" : (1.02 + volume * 0.12).toFixed(3));
      ring.style.setProperty("--aura-opacity", (0.55 + volume * 0.25).toFixed(3));
      if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(update);
    };
    const refresh = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      update();
    };

    refresh();
    reducedMotion.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      reducedMotion.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
      ring.style.removeProperty("--aura-scale");
      ring.style.removeProperty("--aura-opacity");
    };
  }, [isListening, volumeRef]);

  return (
    <div
      className={`cactea-aura-wrapper ${className ?? ""} ${isListening ? "cactea-aura-active" : ""} ${isSpeaking ? "cactea-aura-speaking" : ""}`.trim()}
    >
      <div ref={ringRef} className="cactea-aura-ring" aria-hidden="true" />
      <Cactea state={state} size={size} ariaLabel={ariaLabel} interactive chatExpressions={chatExpressions} />
    </div>
  );
}
