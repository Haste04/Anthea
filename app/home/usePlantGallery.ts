"use client";

import { useEffect, useRef, useState } from "react";

export default function usePlantGallery(plantCount: number) {
  const galleryRef = useRef<HTMLDivElement>(null);
  const [navigation, setNavigation] = useState({ previous: false, next: false });

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    let alive = true;
    let frame = 0;

    function update() {
      frame = 0;
      if (!alive) return;
      const previous = gallery!.scrollLeft > 2;
      const next = gallery!.scrollWidth - gallery!.clientWidth - gallery!.scrollLeft > 2;
      setNavigation(current => current.previous === previous && current.next === next
        ? current : { previous, next });
    }
    function schedule() {
      if (alive && !frame) frame = window.requestAnimationFrame(update);
    }

    gallery.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const observer = window.ResizeObserver ? new window.ResizeObserver(schedule) : null;
    observer?.observe(gallery);
    schedule();
    return () => {
      alive = false;
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      gallery.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [plantCount]);

  function move(direction: -1 | 1) {
    const gallery = galleryRef.current;
    const card = gallery?.firstElementChild;
    if (!gallery || !card) return;
    const gap = parseFloat(getComputedStyle(gallery).columnGap) || 0;
    const stride = card.getBoundingClientRect().width + gap;
    if (!stride) return;
    const visibleCards = Math.max(1, Math.round(gallery.clientWidth / stride));
    gallery.scrollBy({
      left: direction * visibleCards * stride,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  return { galleryRef, navigation, move };
}
