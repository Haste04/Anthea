"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Cactea from "@/app/components/cactea/Cactea";
import { parsePlantProfile, profileQuestions, type PlantProfile } from "@/lib/plant-profile";
import { readPlantProfile, savePlantProfile, usePlantProfile } from "@/lib/plant-profile-store";
import styles from "./welcome.module.css";

const introduction = "Hi, I’m Cactea! I’m Anthea’s AI voice assistant. Talk to me or type a question about your plants, from yellow leaves to watering advice. Have a minute? Three quick questions will help me make my guidance more useful for you.";

const stepNames = ["intro", "experience", "space", "goal", "ready"];
function stepSnapshot() {
  return Math.max(0, stepNames.indexOf(window.location.hash.slice(1)));
}
function subscribeStep(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  window.addEventListener("anthea-welcome-step", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
    window.removeEventListener("anthea-welcome-step", callback);
  };
}

const acknowledgments: Record<string, string> = {
  beginner: "We’ll take it one leaf at a time. I’ll explain the basics as we go.",
  some: "Lovely. We’ll build on what you already know.",
  confident: "Great! We can get into the care details together.",
  indoors: "Light and drainage are good places to start for indoor plants.",
  outdoors: "We’ll consider the weather and growing conditions when they matter.",
  both: "A little green everywhere. We’ll look at each plant’s own space.",
  first: "Your first plant is an exciting place to start. I’m here to help.",
  identify: "We’ll start with the details you can see: leaves, shape, and growth.",
  symptoms: "We’ll work through what’s changed together.",
  care: "Let’s find a routine that fits your plant and its surroundings.",
  explore: "Curiosity is a great start. Ask me anything about plant care.",
};

export default function WelcomeFlow() {
  const savedProfile = usePlantProfile();
  const requestedStep = useSyncExternalStore(subscribeStep, stepSnapshot, () => 0);
  const [answers, setAnswers] = useState<Partial<PlantProfile>>({});
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const effectiveAnswers = { ...savedProfile, ...answers };
  const step = requestedStep === 4 && !parsePlantProfile(effectiveAnswers) ? 0 : requestedStep;
  const question = step > 0 && step < 4 ? profileQuestions[step - 1] : null;

  function goToStep(nextStep: number) {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    window.history.pushState(null, "", `#${stepNames[nextStep]}`);
    window.dispatchEvent(new Event("anthea-welcome-step"));
  }

  useEffect(() => {
    if (step > 0) headingRef.current?.focus();
    return () => window.speechSynthesis?.cancel();
  }, [step]);

  function hearIntroduction() {
    if (!window.speechSynthesis) {
      setNotice("Spoken introductions aren’t available in this browser. You can read everything here.");
      return;
    }
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(introduction);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  function next() {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setNotice("");
    if (step === 0) setAnswers(readPlantProfile() ?? {});
    if (step === 3) {
      const profile = parsePlantProfile(effectiveAnswers);
      if (!profile) return;
      if (!savePlantProfile(profile)) {
        setNotice("Your browser couldn’t save these preferences. They’ll apply while you stay in the app, but may be lost on refresh.");
      }
    }
    goToStep(step + 1);
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={`brand ${styles.brand}`} aria-label="Anthea home">Anthea</Link>
        <div className={styles.progressArea}>
          <progress className={styles.progress} max={3} value={Math.min(Math.max(step - 1, 0), 3)} aria-label="Setup questions completed" />
          <span>{step === 0 ? savedProfile ? "Your preferences are ready" : "A minute to make it yours" : step === 4 ? "Ready to grow" : `Question ${step} of 3`}</span>
        </div>
        <Link href="/dashboard" className={styles.skip}>Skip for now</Link>
      </header>

      <main className={styles.main}>
        <div className={`${styles.content} ${question ? styles.questionContent : styles.introContent}`}>
          <div className={styles.mascot}><Cactea state={speaking ? "speaking" : "idle"} size={question ? "md" : "lg"} interactive /></div>
          <div className={styles.message}>
            <p className={styles.eyebrow}>{step === 0 ? "Your new growing companion" : step === 4 ? "A great place to start" : "Let’s get to know you"}</p>
            <h1 ref={headingRef} tabIndex={-1} id="welcome-heading">
              {question?.title ?? (step === 0 ? savedProfile ? "Welcome back, plant friend!" : "Hi, I’m Cactea!" : "You’re ready to grow!")}
            </h1>
            {step === 0 && <>
              <p>I’m Anthea’s <strong>AI voice assistant</strong>. Talk to me or type a question about your plants—from yellow leaves to watering advice.</p>
              <p>{savedProfile ? "Your preferences are saved. Head straight into the dashboard, or update your answers below." : "Have a minute? Three quick questions will help me make my guidance more useful for you."}</p>
              <button className={styles.audioButton} type="button" onClick={hearIntroduction} aria-pressed={speaking}>{speaking ? "Stop introduction" : "Hear Cactea’s introduction"}</button>
              {savedProfile && <div>
                <p>Your saved answers will be preselected. Continue to update them.</p>
                <button className={styles.audioButton} type="button" onClick={() => {
                  const cleared = savePlantProfile(null);
                  setAnswers({});
                  setNotice(cleared ? "Saved preferences cleared." : "Preferences cleared for this visit. Browser storage is unavailable; remove this site’s stored data in your browser settings to clear any older saved copy.");
                }}>Clear saved preferences</button>
              </div>}
            </>}
            {question && <p>{question.hint}</p>}
            {step === 4 && <>
              <p>Your preferences are ready. Tell me about your first plant, or ask me a question. We’ll take it one leaf at a time.</p>
              <dl className={styles.summary}>
                {profileQuestions.map((item) => <div key={item.key}><dt>{item.key === "experience" ? "Experience" : item.key === "space" ? "Growing space" : "First goal"}</dt><dd>{item.options.find((option) => option.value === effectiveAnswers[item.key])?.label}</dd></div>)}
              </dl>
              <p className={styles.privacy}>You can edit or clear your preferences from the dashboard.</p>
            </>}
          </div>
          {question && <fieldset className={styles.options}>
            <legend className={styles.srOnly}>{question.title}</legend>
            {question.options.map((option) => <label key={option.value} className={styles.option}>
              <input type="radio" name={question.key} value={option.value} checked={effectiveAnswers[question.key] === option.value} onChange={() => setAnswers({ ...answers, [question.key]: option.value })} />
              <span className={styles.optionNumber} aria-hidden="true">{option.icon}</span>
              <span className={styles.optionCopy}><strong>{option.label}</strong><span>{option.detail}</span></span>
              <span className={styles.check} aria-hidden="true">{effectiveAnswers[question.key] === option.value ? "✓" : ""}</span>
            </label>)}
          </fieldset>}
          {question && <p className={styles.acknowledgment} role="status">{acknowledgments[effectiveAnswers[question.key] ?? ""] ?? "Choose the answer that feels right for you."}</p>}
          {step === 0 && <p className={styles.privacy}>No account needed. Completing setup saves your answers in this browser. They’re sent with your questions to personalize AI replies. You can edit or clear them later.</p>}
          <p className={styles.notice} role="status">{notice}</p>
        </div>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          {step > 0 ? <button type="button" className={styles.back} onClick={() => { setNotice(""); goToStep(step - 1); }}>Back</button> : <Link href="/" className={styles.back}>Back to home</Link>}
          <div className={styles.footerActions}>
            {step === 0 && savedProfile && <button type="button" className={styles.back} onClick={next}>Update my preferences</button>}
            {step === 4 || (step === 0 && savedProfile) ? <Link href="/dashboard" className={styles.continue}>{step === 4 ? "Start chatting with Cactea" : "Continue to dashboard"} <span aria-hidden="true">→</span></Link> : <button type="button" className={styles.continue} disabled={!!question && !effectiveAnswers[question.key]} onClick={next}>{step === 0 ? "Let’s get started" : "Continue"}<span aria-hidden="true">→</span></button>}
          </div>
        </div>
      </footer>
    </div>
  );
}
