"use client";

import { useEffect, useRef } from "react";

export default function useHomeMascotFollow() {
  return useMascotEyeFollow(".ws-home-mascot");
}

export function useMascotEyeFollow(selector: string, maxOffset = 6, unit: "%" | "px" = "%") {
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const mascot = hero?.querySelector<HTMLElement>(selector);
    if (!hero || !mascot) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let frame = 0;
    let lastTime: number | null = null;
    let x = 0;
    let y = 0;
    let cursor: { x: number; y: number } | null = null;
    let boundsDirty = true;
    let bounds = { centerX: 0, centerY: 0 };

    function measure() {
      // Eye containers stay fixed; only their images receive the offset.
      const eyes = Array.from(mascot!.querySelectorAll<HTMLElement>("[data-cactea-eye]"));
      const boxes = eyes.map(eye => eye.getBoundingClientRect());
      if (!boxes.length) return;
      bounds = {
        centerX: boxes.reduce((sum, box) => sum + (box.left + box.right) / 2, 0) / boxes.length,
        centerY: boxes.reduce((sum, box) => sum + (box.top + box.bottom) / 2, 0) / boxes.length,
      };
      boundsDirty = false;
    }

    function writePosition() {
      mascot!.style.setProperty("--home-eye-x", `${x.toFixed(3)}${unit}`);
      mascot!.style.setProperty("--home-eye-y", `${y.toFixed(3)}${unit}`);
    }

    function animate(time: number) {
      frame = 0;
      if (!alive || reducedMotion.matches || document.hidden) return;
      if (boundsDirty) measure();

      let targetX = 0;
      let targetY = 0;
      if (cursor) {
        const dx = (cursor.x - bounds.centerX) / Math.max(1, window.innerWidth / 2);
        const dy = (cursor.y - bounds.centerY) / Math.max(1, window.innerHeight / 2);
        const distance = Math.max(1, Math.hypot(dx, dy));
        targetX = dx / distance * maxOffset;
        targetY = dy / distance * maxOffset;
      }

      const elapsed = lastTime === null ? 16 : Math.min(64, Math.max(0, time - lastTime));
      lastTime = time;
      const easing = 1 - Math.exp(-elapsed / 150);
      x += (targetX - x) * easing;
      y += (targetY - y) * easing;
      const settled = Math.hypot(targetX - x, targetY - y) < 0.02;
      if (settled) { x = targetX; y = targetY; }
      writePosition();
      if (!settled) frame = window.requestAnimationFrame(animate);
    }

    function schedule() {
      if (!alive || frame || reducedMotion.matches || document.hidden) return;
      lastTime = null;
      frame = window.requestAnimationFrame(animate);
    }

    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse" || reducedMotion.matches || document.hidden) return;
      cursor = { x: event.clientX, y: event.clientY };
      schedule();
    }

    function returnHome() {
      cursor = null;
      if (x || y || frame) schedule();
    }

    function leaveWindow(event: PointerEvent) {
      if (event.relatedTarget === null) returnHome();
    }

    function invalidateBounds() {
      boundsDirty = true;
      if (cursor || x || y) schedule();
    }

    function reset() {
      cursor = null;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      x = 0;
      y = 0;
      mascot!.style.removeProperty("--home-eye-x");
      mascot!.style.removeProperty("--home-eye-y");
    }

    function motionChanged() { if (reducedMotion.matches) reset(); }
    function visibilityChanged() {
      if (document.hidden) reset();
      boundsDirty = true;
    }

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerout", leaveWindow);
    window.addEventListener("blur", returnHome);
    window.addEventListener("resize", invalidateBounds);
    window.addEventListener("scroll", invalidateBounds, { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", returnHome);
    document.addEventListener("visibilitychange", visibilityChanged);
    reducedMotion.addEventListener("change", motionChanged);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(invalidateBounds);
    observer?.observe(hero);
    observer?.observe(mascot);

    return () => {
      alive = false;
      reset();
      observer?.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerout", leaveWindow);
      window.removeEventListener("blur", returnHome);
      window.removeEventListener("resize", invalidateBounds);
      window.removeEventListener("scroll", invalidateBounds, true);
      document.documentElement.removeEventListener("pointerleave", returnHome);
      document.removeEventListener("visibilitychange", visibilityChanged);
      reducedMotion.removeEventListener("change", motionChanged);
    };
  }, [selector, maxOffset, unit]);

  return heroRef;
}
