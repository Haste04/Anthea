"use client";

import { useEffect, useRef } from "react";
import { scroll } from "motion";

/** Home-only depth and reveals. The mascot keeps ownership of its inner rig. */
export default function useHomeGardenMotion() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    const hero = page?.querySelector<HTMLElement>("[data-garden-hero]");
    if (!page || !hero) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const layers = [...hero.querySelectorAll<HTMLElement>("[data-garden-depth]")];
    const stages = [...page.querySelectorAll<HTMLElement>("[data-garden-stage]")];
    const reveals = [...page.querySelectorAll<HTMLElement>("[data-garden-reveal]")];
    let alive = true;
    let stop = () => {};

    function sync() {
      stop();
      if (!alive || preference.matches || document.hidden) return;
      let active = true;
      let bounds: DOMRect | null = null;
      const compact = window.innerWidth <= 800;
      const stopScroll = scroll(progress => {
        if (!active) return;
        const clamped = Math.max(0, Math.min(1, progress));
        for (const layer of layers) {
          layer.style.setProperty("--garden-scroll-y", `${clamped * Number(layer.dataset.gardenDepth) * (compact ? 0.45 : 1)}px`);
        }
        bounds = null;
      }, { target: hero!, offset: ["start start", "end start"] });

      function resetPointer() {
        for (const layer of layers) {
          layer.style.removeProperty("--garden-pointer-x");
          layer.style.removeProperty("--garden-pointer-y");
        }
        for (const stage of stages) {
          stage.style.removeProperty("--garden-tilt-x");
          stage.style.removeProperty("--garden-tilt-y");
        }
      }
      function move(event: PointerEvent) {
        if (!active || compact || event.pointerType !== "mouse") return;
        bounds ??= hero!.getBoundingClientRect();
        const clamp = (value: number) => Math.max(-1, Math.min(1, value));
        const x = clamp((event.clientX - bounds.left) / Math.max(1, bounds.width) * 2 - 1);
        const y = clamp((event.clientY - bounds.top) / Math.max(1, bounds.height) * 2 - 1);
        for (const layer of layers) {
          const depth = Number(layer.dataset.gardenPointer || 0);
          layer.style.setProperty("--garden-pointer-x", `${x * depth}px`);
          layer.style.setProperty("--garden-pointer-y", `${y * depth * 0.6}px`);
        }
        for (const stage of stages) {
          stage.style.setProperty("--garden-tilt-x", `${-y * 3}deg`);
          stage.style.setProperty("--garden-tilt-y", `${x * 4}deg`);
        }
      }

      // Static content stays visible if observers aren't supported or JS is disabled.
      const observer = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
        if (!active) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.gardenVisible = "true";
          observer?.unobserve(entry.target);
        }
      }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }) : null;
      if (observer) {
        page!.dataset.gardenMotion = "on";
        for (const reveal of reveals) {
          // Only enrolled nodes start hidden; later data can never create invisible cards.
          reveal.dataset.gardenPending = "true";
          if (reveal.dataset.gardenVisible !== "true") observer.observe(reveal);
        }
      }
      hero!.addEventListener("pointermove", move, { passive: true });
      hero!.addEventListener("pointerleave", resetPointer);
      window.addEventListener("blur", resetPointer);
      stop = () => {
        active = false;
        stopScroll();
        observer?.disconnect();
        resetPointer();
        for (const layer of layers) layer.style.removeProperty("--garden-scroll-y");
        for (const reveal of reveals) delete reveal.dataset.gardenPending;
        delete page!.dataset.gardenMotion;
        hero!.removeEventListener("pointermove", move);
        hero!.removeEventListener("pointerleave", resetPointer);
        window.removeEventListener("blur", resetPointer);
      };
    }

    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("resize", sync);
    return () => {
      alive = false;
      stop();
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("resize", sync);
    };
  }, []);

  return pageRef;
}
