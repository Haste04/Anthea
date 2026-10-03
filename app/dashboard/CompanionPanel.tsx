"use client";

import { useEffect, useState, type ReactNode } from "react";
import CacteaAudioAura from "@/app/components/cactea/CacteaAudioAura";
import { useMascotEyeFollow } from "@/app/components/workspace/useHomeMascotFollow";
import type { AgentMode, CacteaState } from "@/lib/cactea-state";
import styles from "./Dashboard.module.css";

type CompanionPanelProps = {
  mode: AgentMode;
  state: CacteaState;
  children: ReactNode;
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

const idleSuggestions = [
  { line: "A leaf changed? Tell me what it looks like.", question: "My plant's leaves have changed. What details should I check?" },
  { line: "Before watering, let's check the soil together.", question: "How can I tell whether my plant needs water?" },
  { line: "Wondering if this spot has enough light?", question: "How can I tell if my plant is getting the right amount of light?" },
  { line: "New plant at home? Let's get to know it.", question: "I have a new plant. What should I tell you to make a care plan?" },
] as const;

export default function CompanionPanel({ mode, state, children, onChooseSuggestion, actionsDisabled, transcribing, volumeRef }: CompanionPanelProps) {
  const companionRef = useMascotEyeFollow(".cactea-aura-wrapper", 4, "px");
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

  return (
    <aside ref={companionRef} className={styles.companion} aria-labelledby="companion-title">
      <section className={styles.companionGarden}>
        <p className={styles.eyebrow}>Your growing companion</p>
        <CacteaAudioAura state={state} size="lg" volumeRef={volumeRef} className={styles.companionMascot} chatExpressions />
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

      {children}
    </aside>
  );
}
