"use client";

import { useId, useState, type ReactNode } from "react";
import type { AgentMode } from "@/lib/cactea-state";
import styles from "./Dashboard.module.css";

export type PlantSummary = {
  next_check: string | null;
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
};

type PlantSummaryCardProps = {
  summary: PlantSummary | null;
  mode: AgentMode;
  conversationNumber: number;
  onAskNext: () => void;
  actionsDisabled: boolean;
  toolbar: ReactNode;
};

const confidenceCopy: Record<string, string> = {
  high: "High confidence",
  medium: "Moderate confidence",
  low: "Low confidence—more details may help",
  none: "Not enough evidence for a specific diagnosis",
};

export default function PlantSummaryCard({ summary, mode, conversationNumber, onAskNext, actionsDisabled, toolbar }: PlantSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const interval = summary?.watering_days;
  const hasInterval = typeof interval === "number" && Number.isFinite(interval) && interval > 0;

  return (
      <section className={`${styles.plantCard} ${styles.summaryHeader}`} aria-label="Plant summary and conversation controls">
        <div className={styles.summaryHeaderRow}>
          <button
            type="button"
            id="chat-title"
            className={styles.summaryToggle}
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded(value => !value)}
          >
            <span className={styles.summaryChevron} aria-hidden="true">▶</span>
            <span>Plant summary</span>
          </button>
          {toolbar}
        </div>
        <div id={contentId} className={styles.summaryContent} hidden={!expanded}>
        {summary ? <>
          <p className={styles.summaryCaption}>Plant conversation {conversationNumber} · {mode === "processing" ? "Previous reply while I think." : "Latest completed reply."}</p>
          <div className={styles.nextCheck}>
            <h3>Next thing to check</h3>
            {summary.next_check ? <p>{summary.next_check}</p> : <button type="button" disabled={actionsDisabled} onClick={onAskNext}>Ask Cactea what to check next →</button>}
          </div>
          <dl className={styles.plantFacts}>
            <div>
              <dt>Possible plant</dt>
              <dd>{summary.species_candidate || "Not identified yet"}</dd>
            </div>
          </dl>
          <details className={styles.careDetails}>
            <summary>Watering &amp; diagnosis details</summary>
            <dl className={styles.plantFacts}>
            <div>
              <dt>Watering guidance</dt>
              <dd>{hasInterval ? `${summary.is_estimate ? "Estimated" : "Suggested"} interval: ${interval} ${interval === 1 ? "day" : "days"}` : "Tell me about its soil and watering habits."}
                {hasInterval && <p>Check soil moisture before watering; your plant’s conditions can change its needs.</p>}
              </dd>
            </div>
            <div>
              <dt>Diagnosis</dt>
              <dd>{confidenceCopy[summary.diagnosis_confidence] ?? "Not assessed"}</dd>
            </div>
          </dl>
          </details>
        </> : <div className={styles.plantEmpty}>
          <p>Plant conversation {conversationNumber}</p>
          <span>Describe its leaves, light, and watering habits. Useful details from my reply will appear here.</span>
        </div>}
        </div>
      </section>
  );
}
