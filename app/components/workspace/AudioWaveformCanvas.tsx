"use client";

import { useEffect, useRef } from "react";

interface AudioWaveformCanvasProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isListening: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export default function AudioWaveformCanvas({
  analyserRef,
  isListening,
  width = 100,
  height = 24,
  className,
}: AudioWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animFrameId: number;

    const analyser = analyserRef.current;
    if (!isListening || !analyser) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const styles = getComputedStyle(canvas);
    const green = styles.getPropertyValue("--primary").trim();
    const amber = styles.getPropertyValue("--accent").trim();

    const render = () => {
      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, width, height);

      const barCount = 14;
      const gap = 4;
      const totalGap = gap * (barCount - 1);
      const barWidth = Math.max(2, (width - totalGap) / barCount);

      for (let i = 0; i < barCount; i++) {
        // Sample frequency bins across spectrum
        const binIndex = Math.floor((i / barCount) * (bufferLength / 4));
        const value = dataArray[binIndex] || 0;
        const level = Math.min(1, value / 110);
        const barHeight = 16 + Math.pow(level, 0.6) * (height - 18);
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;

        ctx.fillStyle = i === 6 || i === 7 ? amber : green;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, barWidth, barHeight, 3);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      animFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [analyserRef, isListening, width, height]);

  if (!isListening) return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={`audio-waveform-canvas ${className ?? ""}`.trim()}
      aria-hidden="true"
    />
  );
}
