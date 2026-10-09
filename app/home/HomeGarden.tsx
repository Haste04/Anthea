"use client";

/* Plant photographs are browser-local data URLs, resized before storage. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import Cactea from "../components/cactea/Cactea";
import Icon from "../components/workspace/Icon";
import { useWorkspace } from "../components/workspace/WorkspaceProvider";
import useHomeMascotFollow from "../components/workspace/useHomeMascotFollow";
import useHomeGardenMotion from "./useHomeGardenMotion";
import usePlantGallery from "./usePlantGallery";
import HomeMascotDrag from "./HomeMascotDrag";
import styles from "./HomeGarden.module.css";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"} /></svg>;
}

/** Original vector foliage; decorative layers never receive pointer events. */
function Foliage({ branch = false }: { branch?: boolean }) {
  return branch ? (
    <svg viewBox="0 0 220 320" fill="none" aria-hidden="true" focusable="false">
      <path d="M92 320C110 256 102 155 145 16" stroke="currentColor" strokeWidth="2" />
      <path d="M104 254C49 258 13 220 18 175c52 4 86 34 86 79Zm5-50c49-3 90-41 87-86-52 9-84 42-87 86Zm11-51c-45-4-76-36-69-77 46 10 69 36 69 77Zm14-54c38-8 69-39 62-74-44 12-65 40-62 74Zm11-51c-23-5-33-26-22-48 22 11 30 27 22 48Z" fill="currentColor" />
      <path d="m101 245-64-52m76 3 65-61m-59 9-54-52m69 1 48-51" stroke="#f6f1e5" strokeOpacity=".35" strokeWidth="1.2" />
    </svg>
  ) : (
    <svg viewBox="0 0 240 280" fill="none" aria-hidden="true" focusable="false">
      <path d="M122 238C51 226 13 173 24 106 34 41 93 22 121 65c35-48 87-24 99 28 18 75-25 130-98 145Z" fill="currentColor" />
      <path d="M119 279c8-51 7-122 6-189m-1 140-72-58m73 20 69-66m-70 31-74-57m74 22 56-54" stroke="#f6f1e5" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
      <path d="m37 97 54 40m-58 4 58 34m112-75-42 35m47 10-45 37" stroke="#f6f1e5" strokeWidth="12" strokeLinecap="round" />
    </svg>
  );
}

function PlantIllustration() {
  return <svg className={styles.plantIllustration} viewBox="0 0 200 200" aria-hidden="true">
    <path d="M100 146V52m0 61L61 76m39 13 35-42" fill="none" stroke="#426849" strokeWidth="3" />
    <path d="M100 103C52 98 39 55 54 36c39 3 51 31 46 67Z" fill="#47774e" />
    <path d="M102 79c-9-47 19-61 47-61 9 41-13 64-47 61Z" fill="#719450" />
    <path d="M98 117c-41 23-63-2-64-25 30-14 51-4 64 25Z" fill="#88a95f" />
    <path d="M103 119c36-36 66-17 65 11-29 16-51 9-65-11Z" fill="#315e41" />
    <path d="m75 142 9 37h34l9-37Z" fill="#d0ae8d" /><path d="M72 140h58v8H72Z" fill="#dfc3a3" />
  </svg>;
}

export default function HomeGarden() {
  const { data, newChat, setActiveChatId, storageError, draftChat } = useWorkspace();
  const router = useRouter();
  const pageRef = useHomeGardenMotion();
  const heroRef = useHomeMascotFollow();
  const { galleryRef, navigation, move } = usePlantGallery(data.plants.length);
  const recentChats = [...data.chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  // Preserve the provider's temporary workspace/draft when a reload would lose it.
  const PlantDestination = storageError || draftChat ? Link : "a";

  return (
    <main className={styles.page} ref={pageRef}>
      <div className={styles.inner}>
        <section className={styles.hero} ref={heroRef} data-garden-hero aria-labelledby="home-welcome">
          <div className={styles.heroCopy}>
            <h1 id="home-welcome">Welcome to your <em>green space</em></h1>
            <p className={styles.intro}>A calmer home for your plants, questions, and growing routines.</p>
            <h2>Happy plants start with a conversation.</h2>
            <p className={styles.description}>Noticed a yellow leaf? Found a new plant? I’m Cactea, and I’m here to help you figure it out.</p>
            <button className={styles.primary} onClick={() => { newChat(); router.push("/dashboard"); }}>
              <Icon name="microphone" size={19} /> Let’s talk plants <Arrow diagonal />
            </button>
          </div>

          <div className={styles.scene}>
            <div className={`${styles.depthLayer} ${styles.habitat}`} data-garden-depth="80" data-garden-pointer="-8" aria-hidden="true" />
            <div className={`${styles.depthLayer} ${styles.backBranch}`} data-garden-depth="105" data-garden-pointer="-12"><Foliage branch /></div>
            <div className={`${styles.depthLayer} ${styles.midLeaf}`} data-garden-depth="-55" data-garden-pointer="14"><Foliage /></div>
            <div className={`${styles.depthLayer} ${styles.sun}`} data-garden-depth="45" data-garden-pointer="-5" aria-hidden="true">
              <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="36" cy="36" r="12" /><path d="M36 5v10m0 42v10M5 36h10m42 0h10M14 14l7 7m30 30 7 7M14 58l7-7m30-30 7-7" /></svg>
            </div>
            <div className={styles.mascotStage} data-garden-stage>
              <div className={styles.mascotFloat}>
                <HomeMascotDrag>
                  <Cactea state="idle" size="hero" className={`ws-home-mascot ${styles.mascot}`} lively />
                </HomeMascotDrag>
              </div>
            </div>
            <div className={`${styles.depthLayer} ${styles.frontBranch}`} data-garden-depth="-150" data-garden-pointer="24"><Foliage branch /></div>
            <div className={`${styles.depthLayer} ${styles.frontLeaf}`} data-garden-depth="-110" data-garden-pointer="18"><Foliage /></div>
            <div className={styles.mascotCaption}><span className={styles.presenceDot} /> Meet Cactea <span>Your plant-care companion</span></div>
          </div>
        </section>

        <section id="home-plants" className={styles.gallerySection} aria-labelledby="home-plants-title">
          <header className={styles.sectionHeading} data-garden-reveal>
            <div><p className={styles.eyebrow}>Your living collection</p><div className={styles.galleryTitle}><h2 id="home-plants-title">Your plants</h2><Link href="/plants" className={styles.textLink}>View garden <Arrow /></Link></div><p className={styles.sectionDescription}>Small moments of care. Beautiful things growing.</p></div>
            <div className={styles.galleryActions}>
              {data.plants.length > 0 && <div className={styles.galleryControls} role="group" aria-label="Plant gallery navigation">
                <button type="button" className={styles.previousPlants} aria-label="Previous plants" aria-controls="home-plant-gallery" disabled={!navigation.previous} onClick={() => move(-1)}><Arrow /></button>
                <button type="button" aria-label="Next plants" aria-controls="home-plant-gallery" disabled={!navigation.next} onClick={() => move(1)}><Arrow /></button>
              </div>}
            </div>
          </header>
          {data.plants.length ? (
            <div id="home-plant-gallery" className={styles.gallery} ref={galleryRef} role="region" aria-label="Your plants gallery" tabIndex={0}>
              {data.plants.map((plant, index) => (
                <div key={plant.id} className={styles.plantReveal} data-garden-reveal style={{ "--reveal-delay": `${(index % 3) * 100}ms` } as CSSProperties}>
                  {/* The garden reads its initial hash; persisted visits can open it directly. */}
                  <PlantDestination href={`/plants#${plant.id}`} className={styles.plant}>
                    <div className={styles.plantPhoto}>
                      {plant.photo ? <img src={plant.photo} alt={plant.name} loading="lazy" decoding="async" /> : <PlantIllustration />}
                      <span className={styles.photoIndex} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                      <span className={styles.plantArrow} aria-hidden="true"><Arrow diagonal /></span>
                    </div>
                    <div className={styles.plantInfo}><h3>{plant.name}</h3><p>{plant.location || "A growing part of your home"}</p>{plant.species && <span>{plant.species}</span>}</div>
                  </PlantDestination>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyGarden} data-garden-reveal>
              <div className={styles.emptyArt}><PlantIllustration /></div>
              <div><p className={styles.eyebrow}>The beginning of something green</p><h3>Every garden starts with one plant.</h3><p>Add your first plant to keep its notes and photos together.</p><Link href="/plants" className={styles.textLink}>Add your first plant <Arrow /></Link></div>
            </div>
          )}
        </section>

        <section className={styles.overview} data-garden-reveal aria-labelledby="home-overview-title">
          <div><p className={styles.eyebrow}>Growing together</p><h2 id="home-overview-title">Garden overview</h2></div>
          <Link href="/plants" className={styles.stat}><span className={styles.statIcon}><Icon name="plants" size={25} /></span><div><strong>{data.plants.length}</strong><span>plants in your care</span></div><Arrow diagonal /></Link>
          <Link href="/dashboard" className={styles.stat}><span className={styles.statIcon}><Icon name="chat" size={23} /></span><div><strong>{data.chats.length}</strong><span>saved conversations</span></div><Arrow diagonal /></Link>
        </section>

        <div className={styles.supporting}>
          <section className={styles.conversations} data-garden-reveal aria-labelledby="home-conversations-title">
            <header className={styles.supportHeading}><div><p className={styles.eyebrow}>A conversation can keep growing</p><h2 id="home-conversations-title">Pick up a conversation</h2></div><Link href="/dashboard" className={styles.textLink}>Chat <Arrow /></Link></header>
            {recentChats.map(chat => (
              <button key={chat.id} className={styles.conversation} onClick={() => { setActiveChatId(chat.id); router.push("/dashboard"); }}>
                <span className={styles.conversationIcon}><Icon name="chat" size={20} /></span><span className={styles.conversationText}><strong>{chat.title}</strong><small>{chat.messages.length} messages</small></span><Arrow diagonal />
              </button>
            ))}
            {!data.chats.length && <p className={styles.emptyConversation}>Your first plant question is a good place to start.</p>}
          </section>

          <aside className={styles.tip} data-garden-reveal aria-labelledby="home-tip-title">
            <div className={styles.tipDecoration}><Foliage branch /></div>
            <p className={styles.eyebrow}><Icon name="leaf" size={18} /> A little care note</p>
            <h2 id="home-tip-title">A small check goes a long way</h2>
            <p>Look, feel, and observe before changing your plant’s care. Its conditions matter more than a fixed watering schedule.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
