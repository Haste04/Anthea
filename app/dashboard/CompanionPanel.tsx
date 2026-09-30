"use client";

import { useEffect, useState } from "react";
import CacteaAudioAura from "@/app/components/cactea/CacteaAudioAura";
import type { AgentMode, CacteaState } from "@/lib/cactea-state";
import styles from "./Dashboard.module.css";

export type PlantSummary = {
  next_check: string | null;
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
};

type CompanionPanelProps = {
  mode: AgentMode;
  state: CacteaState;
  summary: PlantSummary | null;
  conversationNumber: number;
  onAskNext: () => void;
  onChooseSuggestion: (question: string) => void;
  actionsDisabled: boolean;
  transcribing?: boolean;
  volumeRef?: React.RefObject<number>;
};

const statusCopy: Record<AgentMode, string> = {
  idle: "Let’s help your plants grow.",
  listening: "Go ahead. I’m listening.",
  processing: "Let’s work it out.",
  speaking: "Here’s what I’d try.",
};

const confidenceCopy: Record<string, string> = {
  high: "High confidence",
  medium: "Moderate confidence",
  low: "Low confidence—more details may help",
  none: "Not enough evidence for a specific diagnosis",
};

const idleSuggestions = [
  { line: "A leaf changed? Tell me what it looks like.", question: "My plant's leaves have changed. What details should I check?" },
  { line: "Before watering, let's check the soil together.", question: "How can I tell whether my plant needs water?" },
  { line: "Wondering if this spot has enough light?", question: "How can I tell if my plant is getting the right amount of light?" },
  { line: "New plant at home? Let's get to know it.", question: "I have a new plant. What should I tell you to make a care plan?" },
] as const;

export default function CompanionPanel({ mode, state, summary, conversationNumber, onAskNext, onChooseSuggestion, actionsDisabled, transcribing, volumeRef }: CompanionPanelProps) {
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const cyclePaused = hovered || focused;
  const showSuggestion = mode === "idle" && state !== "success" && state !== "error" && !actionsDisabled && !transcribing;
  useEffect(() => {
    if (!showSuggestion || cyclePaused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setSuggestionIndex(index => (index + 1) % idleSuggestions.length);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [showSuggestion, cyclePaused]);
  const status = statusCopy[mode];
  const interval = summary?.watering_days;
  const hasInterval = typeof interval === "number" && Number.isFinite(interval) && interval > 0;

  return (
    <aside className={styles.companion} aria-labelledby="companion-title">
      <section className={styles.companionGarden}>
        <p className={styles.eyebrow}>Your growing companion</p>
        <CacteaAudioAura state={state} size="lg" volumeRef={volumeRef} className={styles.companionMascot} />
        <h2 id="companion-title">Cactea</h2>
        <p className={styles.companionSubtitle}>Anthea’s AI voice assistant</p>
        <div className={styles.companionStatus} data-suggestion={showSuggestion}
          onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
          {showSuggestion ? <>
            <span className={styles.suggestionEyebrow}>A thought from Cactea</span>
            <button className={styles.suggestionQuestion} type="button" onClick={() => onChooseSuggestion(idleSuggestions[suggestionIndex].question)} aria-label={`${idleSuggestions[suggestionIndex].line} Add a question to the chat draft.`}>
              {idleSuggestions[suggestionIndex].line}<span aria-hidden="true">↗</span>
            </button>
            <div className={styles.suggestionFooter}><span>Tap to start a question</span><button type="button" className={styles.suggestionNext} onClick={() => setSuggestionIndex(index => (index + 1) % idleSuggestions.length)} aria-label="Show another suggestion">Another idea <span aria-hidden="true">→</span></button></div>
          </> : <p>{transcribing ? "Let me catch your words." : status}</p>}
        </div>
      </section>

      <details className={styles.plantCard}>
        <summary>Plant summary{summary?.species_candidate && <span>{summary.species_candidate}</span>}</summary>
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
      </details>
    </aside>
  );
}
