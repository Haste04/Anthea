"use client";

import { useEffect, useRef } from "react";

type VisualizerProps = {
  amplitude: number;
  mode: "idle" | "listening" | "speaking" | "processing";
};

export default function Visualizer({ amplitude, mode }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const speakPhaseRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 240;
    canvas.width = size;
    canvas.height = size;
    const cx = size / 2;
    const cy = size / 2;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      let pulse = 0.35;
      if (mode === "listening") {
        pulse = 0.35 + Math.min(1, Math.max(0, amplitude)) * 0.55;
      } else if (mode === "speaking") {
        speakPhaseRef.current += 0.08;
        pulse = 0.45 + Math.sin(speakPhaseRef.current) * 0.25;
      } else if (mode === "processing") {
        speakPhaseRef.current += 0.05;
        pulse = 0.4 + Math.sin(speakPhaseRef.current) * 0.12;
      } else {
        pulse = 0.32;
      }

      const baseRadius = 48;
      const radius = baseRadius * (0.85 + pulse * 0.55);

      // Soft outer rings
      for (let i = 3; i >= 1; i--) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius + i * 18 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(46, 125, 70, ${0.08 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
      if (mode === "speaking") {
        gradient.addColorStop(0, "#81c784");
        gradient.addColorStop(1, "#2e7d46");
      } else if (mode === "listening") {
        gradient.addColorStop(0, "#a5d6a7");
        gradient.addColorStop(1, "#388e3c");
      } else if (mode === "processing") {
        gradient.addColorStop(0, "#c8e6c9");
        gradient.addColorStop(1, "#66bb6a");
      } else {
        gradient.addColorStop(0, "#e8f5e9");
        gradient.addColorStop(1, "#81c784");
      }

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [amplitude, mode]);

  return (
    <canvas
      ref={canvasRef}
      className="visualizer-canvas"
      aria-hidden
      width={240}
      height={240}
    />
  );
}
