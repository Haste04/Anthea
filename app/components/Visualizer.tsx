"use client";

import { memo, useEffect, useRef, type RefObject } from "react";
import { startVisualizer, type VisualizerMode } from "@/lib/visualizer";

type VisualizerProps = {
  amplitudeRef: RefObject<number>;
  mode: VisualizerMode;
};

export default memo(function Visualizer({ amplitudeRef, mode }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startVisualizer(canvas, amplitudeRef, mode);
  }, [amplitudeRef, mode]);

  return (
    <canvas
      ref={canvasRef}
      className="visualizer-canvas"
      aria-hidden
      width={240}
      height={240}
    />
  );
});
