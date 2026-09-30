import styles from './Dashboard.module.css';

type Props = {
  text: string;
  brief: string;
  nextStep?: string | null;
  speaking: boolean;
  disabled: boolean;
  onBrief: () => void;
  onMore: () => void;
  onStop: () => void;
};

export default function AssistantAnswer({ text, brief, nextStep, speaking, disabled, onBrief, onMore, onStop }: Props) {
  const step = nextStep?.trim();
  const advice = step && brief.includes(step) ? brief.replace(step, '').trim() : brief;
  const showStep = Boolean(step && advice && step !== brief.trim());
  const hasDetails = text.trim() !== brief.trim();
  return <div className={styles.answer}>
    <p className={styles.mainAdvice}>{advice || brief}</p>
    {showStep && <div className={styles.answerNextStep}><strong>Next step</strong><p>{step}</p></div>}
    <div className={styles.answerActions}>
      <button type="button" disabled={disabled} onClick={speaking ? onStop : onBrief}>{speaking ? 'Stop audio' : 'Hear brief answer'}</button>
      {hasDetails && <>
        <details className={styles.answerDetails}><summary>Details</summary><div>{text}</div></details>
        <button type="button" className={styles.hearMore} disabled={disabled || speaking} onClick={onMore}>Hear more</button>
      </>}
    </div>
  </div>;
}
