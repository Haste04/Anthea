"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Cactea from "@/app/components/cactea/Cactea";
import Icon from "@/app/components/workspace/Icon";
import BotanicalSprig from "@/app/components/landing/BotanicalSprig";
import BotanicalLeaf from "@/app/components/landing/BotanicalLeaf";
import useLandingMotion from "@/app/components/landing/useLandingMotion";
import { useMascotEyeFollow } from "@/app/components/workspace/useHomeMascotFollow";
import { useWorkspace } from "@/app/components/workspace/WorkspaceProvider";
import { landingPrompts } from "@/lib/landing-prompts";
import styles from "./Landing.module.css";
import antheaLogo from "../public/images/Anthea Logo.png";

const topics = [
  { id: "leaves", title: "A leaf looking different?", text: "Talk through yellowing, dry edges, and the changes you notice.", image: "plant-10922365.jpg", position: "50% 55%", style: "leavesStory" },
  { id: "drooping", title: "Lost a little of its lift?", text: "Explore drooping stems, light, and your plant’s surroundings.", image: "plant-3909482.jpg", position: "50% 75%", style: "droopingStory" },
  { id: "watering", title: "Time for a drink?", text: "Learn what to check before reaching for the watering can.", image: "plant-9730468.jpg", position: "50% 50%", style: "wateringStory" },
] as const;

const conversation = [
  { title: "Ask", text: "Ask your plant question by voice or text." },
  { title: "Speak", text: "Speak naturally, then pause to send your question." },
  { title: "Hear", text: "Hear a short answer and keep the care details in chat." },
] as const;

function VoiceWave({ className = "" }: { className?: string }) {
  return <span className={`${styles.wave} ${className}`} aria-hidden="true">{Array.from({ length: 17 }, (_, index) => <i key={index} />)}</span>;
}

export default function VoiceFirstHome() {
  const pageRef = useLandingMotion();
  const heroRef = useMascotEyeFollow("[data-landing-mascot]", 5, "%");
  const router = useRouter();
  const { data, ready, newChat, setActiveChatId } = useWorkspace();
  const recentChat = [...data.chats].filter(chat => chat.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0];

  const startConversation = (voice: boolean, prompt?: keyof typeof landingPrompts) => {
    newChat();
    router.push(voice ? "/dashboard?startVoice=1" : prompt ? `/dashboard?starter=${prompt}` : "/dashboard");
  };

  const resumeConversation = () => {
    if (!recentChat) return;
    setActiveChatId(recentChat.id);
    router.push("/dashboard");
  };

  const talkButton = (closing = false) => (
    <button className={`${styles.talkButton} ${closing ? styles.closingTalk : ""}`} type="button" onClick={() => startConversation(true)} disabled={!ready}>
      <span className={styles.micIcon}><Icon name="microphone" size={22} /></span>
      <span>Talk to Cactea</span><span className={styles.buttonArrow} aria-hidden="true">↗</span>
    </button>
  );

  return (
    <div ref={pageRef} className={`anthea-landing ${styles.page}`}>
      <a className="skip-link" href="#landing-content">Skip to content</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Anthea home">
          <Image src={antheaLogo} alt="" width={38} height={38} sizes="38px" />Anthea<span className={styles.brandDot} aria-hidden="true">.</span>
        </Link>
        <nav aria-label="Main navigation"><a href="#how-it-works" className={styles.textLink}>How it works <span aria-hidden="true">↗</span></a></nav>
      </header>

      <main id="landing-content">
        <section ref={heroRef} className={styles.hero} data-scroll-section="hero" aria-labelledby="landing-title">
          <div className={`${styles.layer} ${styles.heroMist}`} data-parallax-y="260" data-parallax-x="-100" aria-hidden="true" />
          <div className={`${styles.layer} ${styles.heroBackgroundLeaf}`} data-parallax-y="180" data-parallax-rotate="-15" aria-hidden="true"><BotanicalLeaf /></div>
          <p className={`${styles.eyebrow} ${styles.heroEyebrow}`}>Your plant-care companion</p>
          <h1 id="landing-title" className={styles.heroTitle}><span>What’s going on </span><span>with your <em>plant?</em></span></h1>

          <figure className={`${styles.layer} ${styles.heroPhoto}`} data-parallax-y="160" data-parallax-x="-100" data-parallax-rotate="-7">
            <div className={`${styles.layer} ${styles.photoFill}`} data-parallax-y="-110" data-parallax-scale="0.12">
              <Image src="/images/plant-10922365.jpg" alt="A potted Monstera beside a softly lit window" fill sizes="(max-width: 700px) 75vw, 50vw" preload />
            </div>
          </figure>
          <div className={`${styles.layer} ${styles.heroForegroundLeaf}`} data-parallax-y="-220" data-parallax-x="90" data-parallax-rotate="20" aria-hidden="true"><BotanicalLeaf /></div>
          <div className={`${styles.layer} ${styles.heroMascot}`} data-landing-mascot data-parallax-y="-155" data-parallax-x="75" data-parallax-rotate="9">
            <div className={styles.mascotOrbit} aria-hidden="true" />
            <Cactea state="idle" size="hero" interactive lively />
          </div>
          <div className={`${styles.layer} ${styles.heroVoiceSignal}`} data-parallax-y="-250" data-parallax-x="-80" aria-hidden="true"><Icon name="microphone" size={22} /><VoiceWave /></div>

          <div className={styles.heroCopy}>
            <p className={styles.intro}>Ask Cactea out loud. Describe what you see, and work out one helpful next step together.</p>
            <div className={styles.actions}>
              {talkButton()}
              <button className={styles.typeButton} type="button" onClick={() => startConversation(false)} disabled={!ready}>I’d rather type <span aria-hidden="true">→</span></button>
            </div>
            <p className={styles.instruction}>Your microphone starts after you choose Talk. Pause when finished and your question sends automatically.</p>
          </div>
          <p className={styles.heroGreeting}><strong>Hi, I’m Cactea.</strong><span>Tell me what you’re noticing.</span></p>
          <div className={styles.heroFootnote}>
            {ready && recentChat ? <button className={styles.returnButton} type="button" onClick={resumeConversation} title={recentChat.title} aria-label={`Continue last chat: ${recentChat.title}`}><Icon name="chat" size={18} /><span>Continue last chat</span><span aria-hidden="true">↗</span></button> : <p><Icon name="leaf" size={18} /><span>One question. A little more confidence.</span></p>}
            <a href="#topics-title" className={styles.scrollHint} aria-label="Explore plant questions"><span aria-hidden="true">↓</span></a>
          </div>
        </section>

        <section className={styles.questions} aria-labelledby="topics-title">
          <div className={styles.questionsIntro} data-scroll-section="questions-intro">
            <div className={`${styles.layer} ${styles.introSprig}`} data-parallax-y="-180" data-parallax-x="80" data-parallax-rotate="20" aria-hidden="true"><BotanicalSprig /></div>
            <p className={styles.eyebrow} data-reveal>Start with what you see</p>
            <h2 id="topics-title" data-reveal>Small changes.<br /><em>Good questions.</em></h2>
            <p className={styles.questionsNote} data-reveal>You don’t need to know the plant language.<br />Just tell Cactea what’s different.</p>
          </div>

          {topics.map((topic, index) => (
            <article key={topic.id} className={`${styles.plantStory} ${styles[topic.style]}`} data-scroll-section={`topic-${topic.id}`} aria-labelledby={`question-${topic.id}`}>
              <span className={`${styles.layer} ${styles.storyNumber}`} data-parallax-y="-180" aria-hidden="true">0{index + 1}</span>
              <figure className={`${styles.layer} ${styles.storyPhoto}`} data-parallax-y={index === 1 ? -140 : 140} data-parallax-x={index === 1 ? 110 : -60} data-parallax-rotate={index === 2 ? 0 : index === 1 ? 5 : -5}>
                <div className={`${styles.layer} ${styles.photoFill}`} data-parallax-y="-90" data-parallax-scale="0.1"><Image src={`/images/${topic.image}`} alt="" fill sizes="(max-width: 700px) 100vw, (max-width: 1000px) 60vw, 65vw" style={{ objectPosition: topic.position }} /></div>
              </figure>
              <div className={`${styles.layer} ${styles.storyLeaf}`} data-parallax-y="-260" data-parallax-x={index === 1 ? -100 : 100} data-parallax-rotate="-22" aria-hidden="true"><BotanicalLeaf /></div>
              <div className={styles.storyCopy} data-reveal data-reveal-direction={index === 1 ? "left" : "right"}>
                <p className={styles.storyIndex}>0{index + 1} <span aria-hidden="true">/</span> Good questions</p>
                <h3 id={`question-${topic.id}`}>{topic.title}</h3>
                <p>{topic.text}</p>
                <button type="button" className={styles.askButton} disabled={!ready} onClick={() => startConversation(false, topic.id)} aria-label={`Ask Cactea: ${topic.title}`}><span>Ask Cactea</span><span aria-hidden="true">↗</span></button>
              </div>
              <blockquote className={`${styles.layer} ${styles.floatingQuestion}`} data-parallax-y="-160" data-parallax-x={index === 1 ? 60 : -50} data-parallax-rotate="-4"><Icon name="chat" size={20} /><p>{landingPrompts[topic.id]}</p></blockquote>
              {index === 0 && <div className={`${styles.layer} ${styles.leafDetail}`} data-parallax-y="-200" data-parallax-rotate="15" aria-hidden="true"><BotanicalLeaf /></div>}
            </article>
          ))}
        </section>

        <section id="how-it-works" className={styles.conversation} data-scroll-section="conversation" data-sticky-story aria-labelledby="how-title">
          <div className={styles.conversationViewport} data-story-viewport>
            <header className={styles.conversationHeading} data-story-heading>
              <div><p className={styles.eyebrow}>A simple conversation</p><h2 id="how-title">Care starts with what you notice.</h2></div>
              <div className={styles.storyMeter} aria-hidden="true"><span>01 — 02 — 03</span><div><i /></div></div>
            </header>
            <ol className={styles.conversationSteps}>
              {conversation.map((step, index) => (
                <li key={step.title} className={`${styles.conversationStep} ${styles[`step${step.title}`]}`} data-story-step={index}>
                  <div className={styles.stepCopy} data-story-copy><span className={styles.stepIndex}>0{index + 1}</span><h3>{step.title}<span aria-hidden="true">.</span></h3><p>{step.text}</p></div>
                  <div className={styles.stepVisual} aria-hidden="true">
                    <div className={styles.signalOrbit} /><div className={styles.signalOrbitInner} />
                    {index === 0 ? <><div className={styles.askIllustration}><Icon name="chat" size={90} /></div><p className={styles.demoQuestion}>{landingPrompts.leaves}</p><div className={styles.askLeaf}><BotanicalLeaf /></div></> : index === 1 ? <><div className={styles.microphoneIllustration}><Icon name="microphone" size={90} /></div><VoiceWave className={styles.speakWave} /></> : <><div className={styles.replyMascot}><Cactea state="speaking" size="hero" /></div><VoiceWave className={styles.hearWave} /><div className={styles.hearLeaf}><BotanicalSprig /></div></>}
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.conversationAside} data-story-aside>One question. A little more confidence.</p>
          </div>
        </section>

        <section className={styles.closing} data-scroll-section="closing" aria-labelledby="closing-title">
          <div className={`${styles.layer} ${styles.closingGarden}`} data-parallax-y="160" data-parallax-scale="0.14" aria-hidden="true"><Image src="/images/welcome-garden.webp" alt="" fill sizes="100vw" /></div>
          <div className={`${styles.layer} ${styles.closingLeaf}`} data-parallax-y="-200" data-parallax-x="100" data-parallax-rotate="20" aria-hidden="true"><BotanicalLeaf /></div>
          <div className={styles.closingCopy} data-reveal><p className={styles.eyebrow}>Your plant-care companion</p><h2 id="closing-title">One question.<br /><em>A little more confidence.</em></h2><div className={styles.closingActions}>{talkButton(true)}<Link href="/home" className={styles.gardenLink}>Open my garden <span aria-hidden="true">↗</span></Link></div></div>
        </section>
      </main>
      <footer className={styles.footer}><Link href="/" className={styles.footerBrand}>Anthea<span aria-hidden="true">.</span></Link><span>Your plant-care companion</span><a href="#landing-content" className={styles.textLink}>Back to the plants <span aria-hidden="true">↑</span></a></footer>
    </div>
  );
}
