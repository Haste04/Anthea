import Link from "next/link";
import Cactea from "@/app/components/cactea/Cactea";

const features = [
  { number: "01", title: "Get to know your plant", text: "Describe its leaves, shape, and growing habits to explore what it might be." },
  { number: "02", title: "Make sense of symptoms", text: "Talk through yellow leaves, dry edges, or drooping stems and find out what to check." },
  { number: "03", title: "Find your care routine", text: "Get watering guidance to help you care for your plant with more confidence." },
];

export default function LandingPage() {
  return (
    <div className="landing-page">
      <a className="skip-link" href="#landing-content">Skip to content</a>
      <header className="landing-header">
        <Link href="/" className="brand landing-brand" aria-label="Anthea home">Anthea</Link>
        <nav aria-label="Main navigation" className="landing-nav">
          <a href="#how-it-works">How it works</a>
          <Link href="/welcome" className="landing-nav-cta">Meet Cactea <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <main id="landing-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="welcome-eyebrow">A little guidance. A little more green.</p>
            <h1 id="landing-title">Happier plants.<br />One conversation away.</h1>
            <p className="landing-intro">Meet Anthea, your plant-care assistant. Tell us what’s growing, what’s changing, or what’s worrying you. We’ll help you figure out the next step.</p>
            <div className="landing-actions">
              <Link className="welcome-cta" href="/welcome">Meet Cactea <span aria-hidden="true">→</span></Link>
              <Link href="/dashboard" className="dashboard-back">Already set up? Go to dashboard</Link>
              <span className="landing-action-note">Type a question or use your voice.</span>
            </div>
          </div>
          <figure className="landing-mascot">
            <Cactea state="idle" size="hero" />
            <figcaption>Say hello to <strong>Cactea</strong>, your green companion.</figcaption>
          </figure>
        </section>

        <section className="landing-features" aria-labelledby="features-title">
          <div className="landing-section-heading">
            <p className="welcome-eyebrow">Room to grow</p>
            <h2 id="features-title">Every plant has a story.<br />Let’s understand yours.</h2>
          </div>
          <div className="landing-feature-grid">
            {features.map((feature) => (
              <article className="landing-feature" key={feature.number}>
                <span className="landing-feature-number" aria-hidden="true">{feature.number}</span>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-how" aria-labelledby="how-title">
          <div>
            <p className="welcome-eyebrow">Start with what you notice</p>
            <h2 id="how-title">You don’t need a green thumb.<br />Just a question.</h2>
            <p>Open the assistant, describe your plant, and get a response you can read or listen to. Details like light, soil, and recent watering help Anthea give more useful guidance.</p>
            <Link href="/welcome" className="welcome-cta">Get started with Cactea <span aria-hidden="true">→</span></Link>
          </div>
          <aside className="landing-example" aria-label="Example plant question">
            <span className="welcome-eyebrow">Try something like</span>
            <blockquote>“My monstera’s leaves are turning yellow. It sits near a window and I water it every few days. What should I check?”</blockquote>
            <p>A few details are a great place to start.</p>
          </aside>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="brand">Anthea</span>
        <p>A little care goes a long way.</p>
        <a href="#landing-title">Back to top ↑</a>
      </footer>
    </div>
  );
}
