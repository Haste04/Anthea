"use client";

import { useEffect, useRef, type ReactNode } from "react";
import attachHomeMascotDrag from "./attachHomeMascotDrag";
import styles from "./HomeGarden.module.css";

/** Exclusive to the large hero mascot on /home. */
export default function HomeMascotDrag({ children }: { children: ReactNode }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const actorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (anchorRef.current && actorRef.current) return attachHomeMascotDrag(anchorRef.current, actorRef.current);
  }, []);
  return <div ref={anchorRef} className={styles.mascotAnchor}>
    <div ref={actorRef} className={styles.mascotDrag}>{children}</div>
  </div>;
}
