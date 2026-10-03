"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Cactea from "@/app/components/cactea/Cactea";
import Icon from "@/app/components/workspace/Icon";
import { useWorkspace } from "@/app/components/workspace/WorkspaceProvider";
import { landingPrompts } from "@/lib/landing-prompts";
import styles from "./Landing.module.css";

const topics = [
  { id: "leaves", title: "A leaf looking different?", text: "Talk through yellowing, dry edges, and the changes you notice.", image: "plant-10922365.jpg", position: "50% 55%" },
  { id: "drooping", title: "Lost a little of its lift?", text: "Explore drooping stems, light, and your plant’s surroundings.", image: "plant-3909482.jpg", position: "50% 75%" },
  { id: "watering", title: "Time for a drink?", text: "Learn what to check before reaching for the watering can.", image: "plant-9730468.jpg", position: "50% 50%" },
] as const;

export default function VoiceFirstHome() {
  const router = useRouter();
  const { data, ready, newChat, setActiveChatId } = useWorkspace();
  const recentChat = [...data.chats]
    .filter((chat) => chat.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const startConversation = (voice: boolean, prompt?: keyof typeof landingPrompts) => {
    newChat();
    router.push(voice ? "/dashboard?startVoice=1" : prompt ? `/dashboard?starter=${prompt}` : "/dashboard");
  };

  const resumeConversation = () => {
    if (!recentChat) return;
    setActiveChatId(recentChat.id);
    router.push("/dashboard");
  };

  return (
    <div className={`landing-page voice-home ${styles.page}`}>
      <a className="skip-link" href="#landing-content">Skip to content</a>
      <header className="landing-header">
        <Link href="/" className="brand landing-brand" aria-label="Anthea home">Anthea</Link>
        <nav aria-label="Main navigation" className="landing-nav">
          <a href="#how-it-works">How it works</a>
          <Link href="/home">My garden</Link>
        </nav>
      </header>

      <main id="landing-content">
        <section className="landing-hero voice-home-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="welcome-eyebrow">Your plant-care companion</p>
            <h1 id="landing-title">What’s going on with your plant?</h1>
            <p className="landing-intro">Ask Cactea out loud. Describe what you see, and work out one helpful next step together.</p>
            <div className="voice-home-actions">
              <button className="welcome-cta voice-home-talk" type="button" onClick={() => startConversation(true)} disabled={!ready}>
                <Icon name="microphone" size={23} /> Talk to Cactea
              </button>
              <button className="voice-home-type" type="button" onClick={() => startConversation(false)} disabled={!ready}>I’d rather type <span aria-hidden="true">→</span></button>
            </div>
            <p className="voice-home-instruction">Your microphone starts after you choose Talk. Pause when finished and your question sends automatically.</p>
            {ready && recentChat ? <div className={styles.quickReturn} aria-label="Your recent plant care">
              {recentChat && <button type="button" onClick={resumeConversation} title={recentChat.title} aria-label={`Continue last chat: ${recentChat.title}`}><Icon name="chat" size={17}/><span>Continue last chat</span><span aria-hidden="true">→</span></button>}
            </div> : <div className={styles.promise}><Icon name="leaf" size={18}/><span>One question. A little more confidence.</span></div>}
          </div>
          <div className={styles.heroScene}>
            <figure className={styles.heroPhoto}>
              <Image src="/images/plant-10922365.jpg" alt="A potted Monstera beside a softly lit window" fill sizes="(max-width: 700px) 90vw, 46vw" preload />
              <figcaption><span>EVERY LEAF HAS A STORY</span><strong>Let’s understand yours.</strong></figcaption>
            </figure>
            <div className={styles.companion}><Cactea state="idle" size="md" interactive/><p><strong>Hi, I’m Cactea.</strong>Tell me what you’re noticing.</p></div>
            <span className={styles.sceneTag}><Icon name="leaf" size={16}/> A little care goes a long way</span>
          </div>
        </section>

        <section className={styles.topics} aria-labelledby="topics-title">
          <div className={styles.sectionHeading}><div><p className="welcome-eyebrow">Start with what you see</p><h2 id="topics-title">Small changes. Good questions.</h2></div><p>You don’t need to know the plant language.<br/>Just tell Cactea what’s different.</p></div>
          <div className={styles.topicGrid}>{topics.map((topic, index) => <button key={topic.id} type="button" className={styles.topic} disabled={!ready} onClick={() => startConversation(false, topic.id)}>
            <span className={styles.topicPhoto}><Image src={`/images/${topic.image}`} alt="" fill sizes="(max-width: 700px) 90vw, 30vw" style={{objectPosition:topic.position}}/><span className={styles.topicNumber}>0{index + 1}</span></span>
            <span className={styles.topicCopy}><strong>{topic.title}</strong><span>{topic.text}</span><span className={styles.topicAction}>Ask Cactea <span aria-hidden="true">↗</span></span></span>
          </button>)}</div>
        </section>

        <section id="how-it-works" className={`voice-home-how ${styles.how}`} aria-labelledby="how-title">
          <div><p className="welcome-eyebrow">A simple conversation</p><h2 id="how-title">Care starts with what you notice.</h2></div>
          <div className="voice-home-steps">
            <p><span>01</span> Ask your plant question by voice or text.</p>
            <p><span>02</span> Speak naturally, then pause to send your question.</p>
            <p><span>03</span> Hear a short answer and keep the care details in chat.</p>
          </div>
        </section>
      </main>
      <footer className="landing-footer"><span className="brand">Anthea</span><p>A little care goes a long way.</p><Link href="/home">Open my garden →</Link><small className={styles.credits}>Plant photography via <a href="https://www.pexels.com/photo/a-potted-swiss-cheese-plant-by-the-window-10922365/">Pexels</a></small></footer>
    </div>
  );
}
