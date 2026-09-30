"use client";

import Image from "next/image";
import { memo } from "react";
import body from "../../../public/cacthea/body.png";
import leftArm from "../../../public/cacthea/left-arm.png";
import rightArm from "../../../public/cacthea/right-arm.png";
import leftEye from "../../../public/cacthea/left-eye.png";
import rightEye from "../../../public/cacthea/right-eye.png";
import mouth from "../../../public/cacthea/mouth.png";
import type { CacteaProps } from "./Cactea.types";
import styles from "./Cactea.module.css";
import { ClosedEye, OpenMouth, WorriedBrow } from "./FaceExpressions";

// Enable manually when adjusting layer alignment; never show in production.
const CACTEA_DEBUG = false;

const mascotSizes = {
  sm: "64px",
  md: "120px",
  lg: "(max-width: 700px) 43vw, 320px",
  hero: "(max-width: 700px) 58vw, 400px",
} as const;

const layerNames = [
  "left-arm",
  "right-arm",
  "body",
  "left-eye",
  "right-eye",
  "mouth",
] as const;

type LayerName = (typeof layerNames)[number];

const layerStyles: Record<LayerName, string> = {
  "left-arm": styles.leftArm,
  "right-arm": styles.rightArm,
  body: styles.body,
  "left-eye": styles.leftEye,
  "right-eye": styles.rightEye,
  mouth: styles.mouth,
};

// Static imports give changed artwork a new content-hashed URL, including
// the complete body with its built-in spikes.
const layerImages = {
  body,
  "left-arm": leftArm,
  "right-arm": rightArm,
  "left-eye": leftEye,
  "right-eye": rightEye,
  mouth,
};

const activityLabels: Partial<Record<CacteaProps["state"], string>> = {
  wave: "Cactea is waving hello",
  listening: "Cactea is listening",
  thinking: "Cactea is thinking",
  speaking: "Cactea is speaking",
  success: "Cactea has finished responding",
  error: "Cactea needs you to try again",
  sixSeven: "Cactea is doing the six seven gesture",
};

function Cactea({ state, size = "md", className, ariaLabel, interactive = false }: CacteaProps) {
  const classes = `${styles.mascot} ${styles[size]} ${interactive ? styles.interactive : ""} ${className ?? ""} ${CACTEA_DEBUG ? styles.debug : ""}`.trim();
  const artwork = (
    <div className={styles.bounce}>
      <div className={styles.rig}>
        {layerNames.map((name) => (
          <span
            key={name}
            className={`${styles.layer} ${layerStyles[name]}`}
            aria-hidden="true"
          >
            <Image
              src={layerImages[name]}
              alt=""
              sizes={mascotSizes[size]}
              draggable={false}
            />
            {(name === "left-eye" || name === "right-eye") && <>
              <span className={styles.closedEye}><ClosedEye /></span>
              <span className={styles.worriedBrow}><WorriedBrow /></span>
            </>}
            {name === "mouth" && <>
              <span className={styles.openMouth}><OpenMouth /></span>
              <span className={styles.roundMouth}><OpenMouth round /></span>
            </>}
          </span>
        ))}
      </div>
    </div>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className={classes}
        data-state={state}
        aria-label={ariaLabel ?? "Make Cactea jump"}
        onClick={(event) => {
          const bounce = event.currentTarget.firstElementChild;
          if (!(bounce instanceof HTMLElement)) return;
          const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          const current = getComputedStyle(bounce).transform;
          bounce.getAnimations().forEach((animation) => animation.cancel());
          if (reducedMotion) {
            bounce.animate([{ opacity: 1 }, { opacity: 0.72 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
            return;
          }
          const resting = window.matchMedia("(hover: hover) and (pointer: fine)").matches && event.currentTarget.matches(":hover")
            ? "translateY(-2%) rotate(-2deg)"
            : "none";
          bounce.animate([
            { transform: current, offset: 0 },
            { transform: "translateY(0) scale(1.04, .96)", offset: 0.16 },
            { transform: "translateY(-12%) scale(.97, 1.03)", offset: 0.48 },
            { transform: "translateY(0) scale(1.02, .98)", offset: 0.78 },
            { transform: resting, offset: 1 },
          ], { duration: 800, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
        }}
      >
        {artwork}
      </button>
    );
  }

  return <div className={classes} data-state={state} role="img" aria-label={ariaLabel ?? activityLabels[state] ?? "Cactea, Anthea's plant care mascot"}>{artwork}</div>;
}

export default memo(Cactea);
