import Cactea from "@/app/components/cactea/Cactea";
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
  actionsDisabled: boolean;
  transcribing?: boolean;
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

export default function CompanionPanel({ mode, state, summary, conversationNumber, onAskNext, actionsDisabled, transcribing }: CompanionPanelProps) {
  const status = statusCopy[mode];
  const interval = summary?.watering_days;
  const hasInterval = typeof interval === "number" && Number.isFinite(interval) && interval > 0;

  return (
    <aside className={styles.companion} aria-labelledby="companion-title">
      <section className={styles.companionGarden}>
        <p className={styles.eyebrow}>Your growing companion</p>
        <Cactea state={state} size="lg" className={styles.companionMascot} />
        <h2 id="companion-title">Cactea</h2>
        <p className={styles.companionSubtitle}>Anthea’s AI voice assistant</p>
        <div className={styles.companionStatus}>
          <p>{transcribing ? "Let me catch your words." : status}</p>
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
