"use client";

import { useEffect, useRef } from "react";
import { scroll } from "motion";

/** Owns landing motion only; Cactea and the voice dashboard keep their own lifecycles. */
export default function useLandingMotion() {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sections = [...page.querySelectorAll<HTMLElement>("[data-scroll-section]")];
    const reveals = [...page.querySelectorAll<HTMLElement>("[data-reveal]")];
    let stopMotion: (preservePresentation?: boolean) => void = () => {};

    const syncMotion = () => {
      stopMotion(document.hidden && !preference.matches);
      if (preference.matches || document.hidden) return;

      let active = true;
      const subscriptions: (() => void)[] = [];
      const layers: HTMLElement[] = [];
      const scenes: HTMLElement[] = [];
      page.dataset.motion = "on";

      const story = sections.find(section => section.dataset.stickyStory !== undefined);
      const viewport = story?.querySelector?.<HTMLElement>("[data-story-viewport]");
      const heading = story?.querySelector?.<HTMLElement>("[data-story-heading]");
      const aside = story?.querySelector?.<HTMLElement>("[data-story-aside]");
      const sequence = story?.querySelector?.<HTMLElement>("ol");
      const copies = story ? [...story.querySelectorAll<HTMLElement>("[data-story-copy]")] : [];
      const visuals = copies.map(copy => copy.nextElementSibling as HTMLElement).filter(Boolean);

      // Only measure on setup/resize, never during scrolling. Text zoom gets a complete static story.
      const updatePinning = () => {
        if (!active || !viewport || !heading || !aside || !sequence) return;
        const frame = getComputedStyle(viewport);
        const available = window.innerHeight - parseFloat(frame.paddingTop) - parseFloat(frame.paddingBottom)
          - heading.offsetHeight - aside.offsetHeight - parseFloat(getComputedStyle(aside).marginTop)
          - parseFloat(getComputedStyle(sequence).marginTop);
        const contentHeight = Math.max(...copies.map(copy => copy.offsetHeight), ...visuals.map(visual => visual.offsetHeight));
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        page.dataset.storyPinned = String(window.innerWidth > 700 && window.innerHeight > 600
          && window.innerHeight >= rem * 42 && available >= contentHeight + 16);
      };
      updatePinning();
      const sizeObserver = viewport && window.ResizeObserver ? new window.ResizeObserver(updatePinning) : null;
      for (const element of [viewport, heading, aside, ...copies, ...visuals]) if (element) sizeObserver?.observe(element);
      window.addEventListener("resize", updatePinning);

      for (const section of sections) {
        const sectionLayers = [...section.querySelectorAll<HTMLElement>("[data-parallax-y]")].map(element => ({
          element,
          depth: Number(element.dataset.parallaxY),
          horizontal: Number(element.dataset.parallaxX || 0),
          scale: Number(element.dataset.parallaxScale || 0),
          rotation: Number(element.dataset.parallaxRotate || 0),
        }));
        const sectionScenes = [...section.querySelectorAll<HTMLElement>("[data-story-step]")];
        layers.push(...sectionLayers.map(layer => layer.element));
        scenes.push(...sectionScenes);
        const hero = section.dataset.scrollSection === "hero";
        const sticky = section.dataset.stickyStory !== undefined;
        let previous = -1;

        subscriptions.push(scroll(progress => {
          if (!active) return;
          const bounded = Math.max(0, Math.min(1, progress));
          if (bounded === previous) return;
          previous = bounded;
          const travel = bounded - (hero ? 0 : 0.5);
          for (const { element, depth, horizontal, scale, rotation } of sectionLayers) {
            element.style.setProperty("--parallax-y", `${travel * depth}px`);
            if (horizontal) element.style.setProperty("--parallax-x", `${travel * horizontal}px`);
            if (scale) element.style.setProperty("--parallax-scale", String(travel * scale));
            if (rotation) element.style.setProperty("--parallax-rotate", `${travel * rotation}deg`);
          }
          if (sticky) {
            const phase = bounded * 3;
            const clamp = (value: number) => Math.max(0, Math.min(1, value));
            section.dataset.activeStep = String(Math.min(2, Math.floor(phase)));
            section.style.setProperty("--story-progress", String(bounded));
            sectionScenes.forEach(scene => {
              const index = Number(scene.dataset.storyStep);
              const entering = index === 0 ? 1 : clamp((phase - index + 0.2) * 5);
              const leaving = index === 2 ? 1 : clamp((index + 1.1 - phase) * 5);
              scene.style.setProperty("--scene-opacity", String(Math.min(entering, leaving)));
              scene.style.setProperty("--copy-opacity", index === Math.min(2, Math.floor(phase)) ? "1" : "0");
              scene.style.setProperty("--scene-x", `${(index - phase + 0.5) * 60}px`);
              scene.style.setProperty("--scene-y", `${(index - phase) * 50}px`);
              scene.style.setProperty("--scene-scale", String(1 - Math.min(0.12, Math.abs(index - phase) * 0.06)));
            });
          }
        }, {
          target: section,
          offset: sticky ? ["start start", "end end"] : hero ? ["start start", "end start"] : ["start end", "end start"],
        }));
      }

      // Read positions together before setting attributes. Server-rendered content is always visible.
      const revealPositions = reveals.map(element => ({ element, visible: element.getBoundingClientRect().top < window.innerHeight * 0.92 }));
      const observer = window.IntersectionObserver ? new window.IntersectionObserver(entries => {
        if (!active) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          observer?.unobserve(entry.target);
        }
      }, { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }) : null;

      for (const { element, visible } of revealPositions) {
        if (!observer || visible || element.dataset.revealed === "true") element.dataset.revealed = "true";
        else {
          element.dataset.revealed = "false";
          observer.observe(element);
        }
      }

      const revealFocused = (event: Event) => {
        const element = (event.target as Element).closest<HTMLElement>("[data-reveal]");
        if (!element) return;
        element.dataset.revealed = "true";
        observer?.unobserve(element);
      };
      page.addEventListener("focusin", revealFocused);

      stopMotion = (preservePresentation = false) => {
        active = false;
        subscriptions.forEach(stop => stop());
        observer?.disconnect();
        sizeObserver?.disconnect();
        window.removeEventListener("resize", updatePinning);
        page.removeEventListener("focusin", revealFocused);
        // A hidden tab must stop work without unpinning the page or shifting its scroll position.
        if (preservePresentation) {
          page.dataset.motionPaused = "true";
          return;
        }
        delete page.dataset.motionPaused;
        delete page.dataset.storyPinned;
        delete page.dataset.motion;
        layers.forEach(element => {
          element.style.removeProperty("--parallax-y");
          element.style.removeProperty("--parallax-x");
          element.style.removeProperty("--parallax-scale");
          element.style.removeProperty("--parallax-rotate");
        });
        sections.forEach(section => {
          section.style.removeProperty("--story-progress");
          delete section.dataset.activeStep;
        });
        scenes.forEach(scene => {
          for (const property of ["--scene-opacity", "--copy-opacity", "--scene-x", "--scene-y", "--scene-scale"]) scene.style.removeProperty(property);
        });
        // Release pending entrances without completing them: development replays this effect.
        reveals.forEach(element => {
          if (element.dataset.revealed === "false") delete element.dataset.revealed;
        });
      };
    };

    syncMotion();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncMotion);
    return () => {
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncMotion);
      stopMotion();
    };
  }, []);

  return pageRef;
}
