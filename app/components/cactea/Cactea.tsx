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
};

function Cactea({ state, size = "md", className, ariaLabel }: CacteaProps) {
  return (
    <div
      className={`${styles.mascot} ${styles[size]} ${className ?? ""} ${CACTEA_DEBUG ? styles.debug : ""}`.trim()}
      data-state={state}
      role="img"
      aria-label={ariaLabel ?? activityLabels[state] ?? "Cactea, Anthea's plant care mascot"}
    >
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
}

export default memo(Cactea);
