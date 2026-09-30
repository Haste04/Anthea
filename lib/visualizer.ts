export type VisualizerMode = "idle" | "listening" | "speaking" | "processing";

export function startVisualizer(
  canvas: HTMLCanvasElement,
  amplitude: Readonly<{ current: number }>,
  mode: VisualizerMode,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const styles = getComputedStyle(canvas);
  const color = (name: string) => styles.getPropertyValue(name).trim();
  const green = color('--primary');
  const forest = color('--lw-forest');
  const amber = color('--accent');
  const softGreen = color('--selected-strong');
  const paleGreen = color('--selected');

  const size = 240;
  canvas.width = size;
  canvas.height = size;
  const cx = size / 2;
  const cy = size / 2;
  let phase = 0;
  let frame: number | null = null;
  let previousTime: number | null = null;
  let disposed = false;

  const draw = (animate: boolean) => {
    ctx.clearRect(0, 0, size, size);
    let pulse = 0.32;
    if (mode === "listening") {
      pulse = 0.35 + (animate ? Math.min(1, Math.max(0, amplitude.current)) * 0.55 : 0);
    } else if (mode === "speaking") {
      pulse = 0.45 + (animate ? Math.sin(phase) * 0.25 : 0);
    } else if (mode === "processing") {
      pulse = 0.4 + (animate ? Math.sin(phase) * 0.12 : 0);
    }

    const radius = 48 * (0.85 + pulse * 0.55);
    for (let i = 3; i >= 1; i--) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius + i * 18 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = green;
      ctx.globalAlpha = 0.08 * pulse;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const gradient = ctx.createRadialGradient(cx, cy, 8, cx, cy, radius);
    if (mode === "speaking") {
      gradient.addColorStop(0, softGreen);
      gradient.addColorStop(1, forest);
    } else if (mode === "listening") {
      gradient.addColorStop(0, amber);
      gradient.addColorStop(1, green);
    } else if (mode === "processing") {
      gradient.addColorStop(0, paleGreen);
      gradient.addColorStop(1, green);
    } else {
      gradient.addColorStop(0, paleGreen);
      gradient.addColorStop(1, softGreen);
    }

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  };

  // Historical avatars and idle sessions need just one paint, with no listeners.
  if (mode === "idle") {
    draw(false);
    return () => {};
  }

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const cancelFrame = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };

  const tick = (time: number) => {
    frame = null;
    if (disposed || document.hidden || reducedMotion.matches) return;
    const delta = previousTime === null ? 0 : Math.min(time - previousTime, 64);
    previousTime = time;
    // Preserve the original pulse speed independently of display refresh rate.
    phase += delta * (mode === "speaking" ? 0.0048 : 0.003);
    draw(true);
    frame = window.requestAnimationFrame(tick);
  };

  const syncPlayback = () => {
    cancelFrame();
    previousTime = null;
    if (disposed || document.hidden) return;
    draw(!reducedMotion.matches);
    if (!reducedMotion.matches) frame = window.requestAnimationFrame(tick);
  };

  reducedMotion.addEventListener("change", syncPlayback);
  document.addEventListener("visibilitychange", syncPlayback);
  syncPlayback();

  return () => {
    disposed = true;
    cancelFrame();
    reducedMotion.removeEventListener("change", syncPlayback);
    document.removeEventListener("visibilitychange", syncPlayback);
  };
}
