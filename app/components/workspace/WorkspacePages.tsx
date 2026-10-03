"use client";
/* User photographs are browser-local data URLs, already resized before storage. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useWorkspace } from "./WorkspaceProvider";
import Icon from "./Icon";
import Cactea from "../cactea/Cactea";
import VoiceSettings from "../VoiceSettings";
import VoiceCalibration from "../VoiceCalibration";
import PlantSpeciesFields from "./PlantSpeciesFields";
import useHomeMascotFollow from "./useHomeMascotFollow";
import { applyDraftPhoto, localDate, type Plant } from "@/lib/workspace-data";
import { preparePhoto } from "@/lib/prepare-photo";
import { profileQuestions, type PlantProfile } from "@/lib/plant-profile";
import {
  savePlantProfile,
  saveReadAloud,
  usePlantProfile,
  useReadAloud,
} from "@/lib/plant-profile-store";

function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="ws-page-heading">
      <div>
        <p className="ws-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}
function Empty({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ws-empty">
      <span className="ws-empty-icon">
        <Icon name={icon} size={32} />
      </span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function PlantArt({ kind = "monstera" }: { kind?: string }) {
  return (
    <div className={`ws-plant-art ws-art-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 200 180">
        <path
          d="M100 142V55M100 108 65 73M100 91l35-43"
          fill="none"
          stroke="#3c6944"
          strokeWidth="4"
        />
        <path d="M100 99C51 101 43 55 54 36c38 3 50 30 46 63Z" fill="#47774e" />
        <path d="M102 79c-9-47 19-61 47-61 9 41-13 64-47 61Z" fill="#719450" />
        <path d="M98 113c-41 23-63-2-64-25 30-14 51-4 64 25Z" fill="#88a95f" />
        <path d="M103 113c36-36 66-17 65 11-29 16-51 9-65-11Z" fill="#315e41" />
        <path d="m75 137 9 37h34l9-37Z" fill="#d0ae8d" />
        <path d="M72 135h58v8H72Z" fill="#dfc3a3" />
      </svg>
    </div>
  );
}
export function HomePage() {
  const { data, newChat, setActiveChatId } = useWorkspace();
  const router = useRouter();
  const heroRef = useHomeMascotFollow();
  return (
    <main className="ws-page">
      <Heading
        eyebrow=""
        title="Welcome to your green space"
        description="A calmer home for your plants, questions, and growing routines"
      />
      <section className="ws-home-hero" ref={heroRef}>
        <div>
          <h2>Happy plants start with a conversation</h2>
          <p>
            Noticed a yellow leaf? Found a new plant? I’m Cactea, and I’m here
            to help you figure it out
          </p>
          <br />
          <button
            className="ws-primary"
            onClick={() => {
              newChat();
              router.push("/dashboard");
            }}
          >
            Let’s talk plants <span aria-hidden="true">↗</span>
          </button>
        </div>
        <Cactea state="idle" size="hero" className="ws-home-mascot" lively />
      </section>
      <div className="ws-stats">
        <Link href="/plants">
          <Icon name="plants" />
          <strong>{data.plants.length}</strong>
          <span>plants in your care</span>
        </Link>
        <Link href="/dashboard">
          <Icon name="chat" />
          <strong>{data.chats.length}</strong>
          <span>saved conversations</span>
        </Link>
      </div>
      <div className="ws-section-heading">
        <h2>Your plants</h2>
        <Link href="/plants">View garden →</Link>
      </div>
      {data.plants.length ? (
        <div className="ws-card-grid">
          {data.plants.slice(0, 3).map((p) => (
            <Link href={`/plants#${p.id}`} className="ws-plant-card" key={p.id}>
              {p.photo ? <img src={p.photo} alt={p.name} /> : <PlantArt />}
              <div>
                <h3>{p.name}</h3>
                <p>{p.location || "A growing part of your home"}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Empty icon="plants" title="Every garden starts with one plant">
          <p>Add your first plant to keep its notes and photos together.</p>
          <Link className="ws-secondary" href="/plants">
            Add your first plant
          </Link>
        </Empty>
      )}
      <div className="ws-home-columns">
        <section className="ws-panel">
          <div className="ws-section-heading">
            <h2>Pick up a conversation</h2>
            <Link href="/dashboard">Chat →</Link>
          </div>
          {[...data.chats]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 3)
            .map((c) => (
              <button
                className="ws-list-row"
                key={c.id}
                onClick={() => {
                  setActiveChatId(c.id);
                  router.push("/dashboard");
                }}
              >
                <Icon name="chat" />
                <span>
                  {c.title}
                  <small>{c.messages.length} messages</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          {!data.chats.length && (
            <p className="ws-muted">
              Your first plant question is a good place to start.
            </p>
          )}
        </section>
        <section className="ws-panel ws-tip">
          <Icon name="leaf" size={30} />
          <h2>A small check goes a long way</h2>
          <br />
          <p>
            Look, feel, and observe before changing your plant’s care. Its
            conditions matter more than a fixed watering schedule.
          </p>
        </section>
      </div>
    </main>
  );
}

export function PlantsPage() {
  const { data, save, remove, newChat, setActiveChatId } = useWorkspace();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Plant | null>(null);
  const [detail, setDetail] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.location.hash.slice(1),
  );
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = data.plants.find((p) => p.id === detail);
  const open = (plant?: Plant) => {
    setEditing(
      plant ?? {
        id: crypto.randomUUID(),
        name: "",
        species: "",
        location: "",
        notes: "",
        updatedAt: Date.now(),
      },
    );
    setError("");
    dialog.current?.showModal();
  };
  const matches = data.plants.filter((p) =>
    `${p.name} ${p.species} ${p.location}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <main className="ws-page">
      <Heading
        eyebrow="Your living collection"
        title="My Plants"
        description="A little space for every plant you’re helping grow."
      >
        <button className="ws-primary" onClick={() => open()}>
          ＋ Add a plant
        </button>
      </Heading>
      <label className="ws-search">
        <Icon name="plants" />
        <input
          aria-label="Search your plants"
          placeholder="Find a plant, species, or room…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {matches.length ? (
        <div className="ws-card-grid">
          {matches.map((p) => (
            <button
              className={`ws-plant-card ${detail === p.id ? "is-selected" : ""}`}
              key={p.id}
              onClick={() => setDetail(p.id)}
            >
              {p.photo ? <img src={p.photo} alt={p.name} /> : <PlantArt />}
              <div>
                <h2>{p.name}</h2>
                <p>{p.species || "Species not recorded"}</p>
                <span className="ws-chip">
                  {p.location || "Add a location"}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Empty
          icon="plants"
          title={query ? "No plants found" : "Meet your first green companion"}
        >
          <p>
            {query
              ? "Try another name or room."
              : "Add a name, a photo, and the little details that make its care personal."}
          </p>
          {!query && (
            <button className="ws-secondary" onClick={() => open()}>
              Add a plant
            </button>
          )}
        </Empty>
      )}
      {selected && (
        <section
          className="ws-panel ws-plant-detail"
          aria-label={`${selected.name} details`}
        >
          <div className="ws-section-heading">
            <div>
              <p className="ws-eyebrow">Plant journal</p>
              <h2>{selected.name}</h2>
            </div>
            <button
              className="ws-text-button"
              onClick={() => setDetail(null)}
              aria-label="Close plant details"
            >
              ×
            </button>
          </div>
          <p>
            {selected.species || "Species not recorded"} ·{" "}
            {selected.location || "Location not recorded"}
          </p>
          <h3>Care notes</h3>
          <p className="ws-preserve">
            {selected.notes ||
              "No notes yet. Record changes, observations, and what works for this plant."}
          </p>
          <div className="ws-actions">
            <button
              className="ws-primary"
              onClick={() => {
                newChat(selected.id);
                router.push("/dashboard");
              }}
            >
              Ask Cactea
            </button>
            <button className="ws-secondary" onClick={() => open(selected)}>
              Edit plant
            </button>
            <button
              className="ws-danger"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete ${selected.name}? Linked chats will be kept without a plant link.`,
                  )
                ) {
                  remove("plants", selected.id);
                  setDetail(null);
                }
              }}
            >
              Delete
            </button>
          </div>
          <h3>Linked conversations</h3>
          {data.chats
            .filter((c) => c.plantId === selected.id)
            .map((c) => (
              <button
                className="ws-list-row"
                key={c.id}
                onClick={() => {
                  setActiveChatId(c.id);
                  router.push("/dashboard");
                }}
              >
                <Icon name="chat" />
                {c.title}
                <span>↗</span>
              </button>
            ))}
          {!data.chats.some((c) => c.plantId === selected.id) && (
            <p className="ws-muted">
              Start a conversation to keep its guidance here.
            </p>
          )}
        </section>
      )}
      <dialog
        className="ws-modal"
        ref={dialog}
        aria-labelledby="plant-form-title"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing.name.trim() || photoBusy) return;
              save("plants", {
                ...editing,
                name: editing.name.trim(),
                updatedAt: Date.now(),
              });
              setDetail(editing.id);
              dialog.current?.close();
            }}
          >
            <div className="ws-section-heading">
              <h2 id="plant-form-title">
                {data.plants.some((p) => p.id === editing.id)
                  ? "Edit your plant"
                  : "A new leaf in your garden"}
              </h2>
              <button
                type="button"
                className="ws-text-button"
                onClick={() => dialog.current?.close()}
                aria-label="Close plant form"
              >
                ×
              </button>
            </div>
            <PlantSpeciesFields
              key={editing.id}
              plant={editing}
              onChange={(changes) =>
                setEditing((previous) =>
                  previous?.id === editing.id
                    ? { ...previous, ...changes }
                    : previous,
                )
              }
            >
              <label>
                Location
                <input
                  maxLength={160}
                  value={editing.location}
                  placeholder="Near the east window"
                  onChange={(e) =>
                    setEditing({ ...editing, location: e.target.value })
                  }
                />
              </label>
            </PlantSpeciesFields>
            <label>
              Care notes
              <textarea
                rows={4}
                maxLength={10000}
                value={editing.notes}
                placeholder="Light, watering, changes you’ve noticed…"
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </label>
            <label>
              Plant photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={photoBusy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPhotoBusy(true);
                  setError("");
                  try {
                    const photo = await preparePhoto(file);
                    setEditing((previous) =>
                      applyDraftPhoto(previous, editing.id, photo),
                    );
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setPhotoBusy(false);
                  }
                }}
              />
            </label>
            {editing.photo && (
              <div className="ws-photo-preview">
                <img src={editing.photo} alt="Plant preview" />
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, photo: undefined })}
                >
                  Remove photo
                </button>
              </div>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="ws-actions">
              <button
                type="button"
                className="ws-secondary"
                onClick={() => dialog.current?.close()}
              >
                Cancel
              </button>
              <button className="ws-primary" disabled={photoBusy}>
                {photoBusy ? "Preparing photo…" : "Save plant"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </main>
  );
}

export function SettingsPage() {
  const { data, importData, storageError } = useWorkspace();
  const profile = usePlantProfile();
  const readAloud = useReadAloud();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `anthea-backup-${localDate()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(
      "Backup downloaded. It contains your chats, plant photos, notes, and older saved data.",
    );
  };
  return (
    <main className="ws-page ws-settings">
      <Heading
        eyebrow="Make yourself at home"
        title="Settings"
        description="Your preferences, your plants, your space."
      />
      <section className="ws-panel">
        <h2>Conversation & voice</h2>
        <label className="ws-setting-row">
          <span>
            <strong>Read replies aloud</strong>
            <small>
              Use this browser’s available voice for Cactea’s replies.
            </small>
          </span>
          <input
            type="checkbox"
            checked={readAloud}
            onChange={(e) => {
              saveReadAloud(e.target.checked);
              if (!e.target.checked) window.speechSynthesis?.cancel();
            }}
          />
        </label>
      </section>
      <VoiceSettings />
      <VoiceCalibration />
      <section className="ws-panel">
        <h2>Your care preferences</h2>
        {profileQuestions.map((q) => (
          <label key={q.key}>
            {q.title}
            <select
              value={profile?.[q.key] ?? ""}
              onChange={(e) => {
                const next: PlantProfile = {
                  ...(profile ?? {
                    experience: "beginner",
                    space: "indoors",
                    goal: "symptoms",
                  }),
                  [q.key]: e.target.value,
                };
                const saved = savePlantProfile(next);
                setNotice(
                  saved
                    ? "Preferences saved."
                    : "Preferences apply for this visit; browser storage is unavailable.",
                );
              }}
            >
              <option value="" disabled>
                Choose a preference
              </option>
              {q.options.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          className="ws-text-button"
          onClick={() => {
            savePlantProfile(null);
            setNotice("Care preferences cleared.");
          }}
        >
          Clear care preferences
        </button>
      </section>
      <section className="ws-panel">
        <h2>Your data stays in this browser</h2>
        <p>
          No account is needed. Chats, plants, and photos are stored on this
          device and do not sync to other browsers. Clearing browser data
          removes them.
        </p>
        <p>
          When you ask Cactea a question, the text, recent conversation context,
          and attached photo are sent to the AI service to answer it.
        </p>
        {storageError && <p role="alert">{storageError}</p>}
        <div className="ws-data-counts">
          <span>{data.chats.length} chats</span>
          <span>{data.plants.length} plants</span>
        </div>
        <div className="ws-actions">
          <button className="ws-primary" onClick={exportData}>
            Export backup
          </button>
          <button
            className="ws-secondary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? "Restoring…" : "Import backup"}
          </button>
          <input
            className="sr-only"
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 100 * 1024 * 1024) {
                setNotice("Choose a backup smaller than 100 MB.");
                return;
              }
              setBusy(true);
              try {
                const value: unknown = JSON.parse(await file.text());
                const { parseBackup } = await import("@/lib/workspace-data");
                parseBackup(value);
                if (
                  !window.confirm(
                    "Replace all local Anthea data in this browser with this backup? Export your current data first if you want to keep it.",
                  )
                )
                  return;
                await importData(value);
                setNotice("Backup restored successfully.");
              } catch (err) {
                setNotice(
                  err instanceof Error
                    ? err.message
                    : "Could not restore the backup.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
        <p className="ws-muted">
          Backups include plant photos and conversations. Voice and care
          preferences are set separately in each browser.
        </p>
      </section>
      <p role="status" className="ws-notice">
        {notice}
      </p>
    </main>
  );
}
