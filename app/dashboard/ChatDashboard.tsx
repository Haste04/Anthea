"use client";
/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Cactea from "@/app/components/cactea/Cactea";
import AudioWaveformCanvas from "@/app/components/workspace/AudioWaveformCanvas";
import Icon from "@/app/components/workspace/Icon";
import { useWorkspace } from "@/app/components/workspace/WorkspaceProvider";
import { type Chat, type Message as ChatMessage } from "@/lib/workspace-data";
import { preparePhoto } from "@/lib/prepare-photo";
import { captureCaptionPresentation, voiceHeading } from "@/lib/voice-feedback";
import CompanionPanel from "./CompanionPanel";
import PlantSummaryCard from "./PlantSummaryCard";
import styles from "./Dashboard.module.css";
import {
  resolveCacteaState,
  type AgentMode,
  type CacteaFeedback,
} from "@/lib/cactea-state";
import { starterQuestions } from "@/lib/plant-profile";
import {
  readPlantProfile,
  readReadAloud,
  savePlantProfile,
  saveReadAloud,
  usePlantProfile,
  useReadAloud,
} from "@/lib/plant-profile-store";
import {
  AssistantRequestError,
  readApiResponse,
  requestErrorMessage,
} from "@/lib/assistant-request";
import useSpeechPlayback from "./useSpeechPlayback";
import { buildConversationHistory } from "@/lib/conversation";
import { briefSpeech } from "@/lib/care-dialogue";
import AssistantAnswer from "./AssistantAnswer";
import { buildPlantMemory, resolveConversationPlant } from "@/lib/plant-memory";
import useVoiceInput from "./useVoiceInput";
import { buildPlantVocabulary } from "@/lib/voice-vocabulary";
import { heardSixSeven } from "@/lib/six-seven";
import Link from "next/link";
import { landingPrompts } from "@/lib/landing-prompts";

const starterTitles: Record<keyof typeof starterQuestions, string> = {
  identify: "Identify a plant",
  symptoms: "Something looks wrong",
  care: "Plan everyday care",
  explore: "Learn the basics",
};
const starterDescriptions: Record<keyof typeof starterQuestions, string> = {
  identify: "Start with what you can see.",
  symptoms: "Find the first thing to check.",
  care: "Make a routine that fits.",
  explore: "Ask anything about plant care.",
};

type AssistantResponse = {
  response_text: string;
  spoken_text?: string;
  next_check: string | null;
  species_candidate: string | null;
  watering_days: number | null;
  is_estimate: boolean;
  diagnosis_confidence: string;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const REQUEST_TIMEOUT_MS = 65000;

function microphoneAvailable() {
  return (
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}
const subscribeBrowserCapabilities = () => () => {};

export default function ChatDashboard({ chat }: { chat: Chat }) {
  const {
    data: workspace,
    save,
    remove,
    newChat,
    interruptChat,
  } = useWorkspace();
  const chatRef = useRef(chat);
  useEffect(() => {
    chatRef.current = chat;
  }, [chat]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const plantSelectorRef = useRef<HTMLSelectElement>(null);
  const [photo, setPhoto] = useState<string | undefined>();
  const [photoBusy, setPhotoBusy] = useState(false);
  const profile = usePlantProfile();
  const readAloud = useReadAloud();
  const [mode, setMode] = useState<AgentMode>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(chat.messages);
  const savedMessagesRef = useRef(messages);
  useEffect(() => {
    if (savedMessagesRef.current === messages) return;
    savedMessagesRef.current = messages;
    const currentChat = chatRef.current;
    save("chats", {
      ...currentChat,
      messages,
      updatedAt: Date.now(),
      title:
        currentChat.title === "New conversation"
          ? messages.find((m) => m.role === "user")?.text.slice(0, 65) ||
            currentChat.title
          : currentChat.title,
    });
  }, [messages, save]);
  const micSupported = useSyncExternalStore(
    subscribeBrowserCapabilities,
    microphoneAvailable,
    () => false,
  );
  const [typedInput, setTypedInput] = useState("");
  const [voiceOptionsOpen, setVoiceOptionsOpen] = useState(false);
  const voiceOptionsId = useId();
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const [statusHint, setStatusHint] = useState("");
  const [mascotFeedback, setMascotFeedback] = useState<CacteaFeedback>(null);
  const [sixSevenActive, setSixSevenActive] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const conversationNumber =
    workspace.chats.findIndex((c) => c.id === chat.id) + 1 ||
    workspace.chats.length + 1;

  const modeRef = useRef<AgentMode>("idle");
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sixSevenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sixSevenPlayedRef = useRef(false);
  const landingVoiceStartedRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const requestBusyRef = useRef(false);
  const followConversationRef = useRef(true);
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>(chat.messages);
  const newPlantDialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const linkCurrentChat = useCallback(
    (plantId?: string) => {
      const currentChat = chatRef.current;
      const previousPlantId = currentChat.plantId ?? null;
      const taggedMessages = messagesRef.current.map((message) =>
        message.plantId === undefined
          ? { ...message, plantId: previousPlantId }
          : message,
      );
      const updated = {
        ...currentChat,
        plantId,
        messages: taggedMessages,
        updatedAt: Date.now(),
      };
      chatRef.current = updated;
      messagesRef.current = taggedMessages;
      savedMessagesRef.current = taggedMessages;
      setMessages(taggedMessages);
      save("chats", updated);
    },
    [save],
  );
  const changeMode = useCallback((mode: AgentMode) => {
    modeRef.current = mode;
    setMode(mode);
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;
    const contentHeight = textarea.scrollHeight + borderHeight;
    textarea.style.height = `${Math.min(contentHeight, 120)}px`;
    textarea.style.overflowY = contentHeight > 120 ? "auto" : "hidden";
  }, [typedInput]);

  const showMascotFeedback = useCallback(
    (feedback: Exclude<CacteaFeedback, null>) => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      setMascotFeedback(feedback);
      feedbackTimerRef.current = setTimeout(
        () => {
          setMascotFeedback(null);
          feedbackTimerRef.current = null;
        },
        feedback === "success" ? 720 : 900,
      );
    },
    [],
  );

  const triggerSixSeven = useCallback((transcript: string) => {
    if (sixSevenPlayedRef.current || !heardSixSeven(transcript)) return;
    sixSevenPlayedRef.current = true;
    if (sixSevenTimerRef.current) clearTimeout(sixSevenTimerRef.current);
    setSixSevenActive(true);
    sixSevenTimerRef.current = setTimeout(() => {
      setSixSevenActive(false);
      sixSevenTimerRef.current = null;
    }, 1400);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (sixSevenTimerRef.current) clearTimeout(sixSevenTimerRef.current);
    };
  }, []);

  const onSpeechStart = useCallback(() => {
    changeMode("speaking");
  }, [changeMode]);
  const onSpeechFinish = useCallback(() => {
    if (modeRef.current === "speaking") changeMode("idle");
  }, [changeMode]);
  const onSpeechError = useCallback(() => {
    setStatusHint(
      "The spoken reply could not play. Choose Hear brief answer to retry, and check your device volume. The answer is saved below.",
    );
  }, []);
  const {
    speak: speakText,
    stop: stopSpeech,
    speakingMessageId,
    playbackPending,
  } = useSpeechPlayback(onSpeechStart, onSpeechFinish, onSpeechError);

  const submitTranscript = useCallback(
    async (text: string, retryId?: string) => {
      const trimmed = text.trim();
      if (requestBusyRef.current || modeRef.current === "listening") return;
      if (!trimmed) {
        changeMode("idle");
        setStatusHint(
          "I didn’t hear any words. Try recording again, or type your question.",
        );
        return;
      }
      stopSpeech();
      const retryMessage = retryId
        ? messagesRef.current.find((message) => message.id === retryId)
        : undefined;
      const retryPlantId = retryMessage?.plantId;
      const plantResolution =
        retryPlantId === null
          ? {
              kind: "none" as const,
              plant: null,
              ambiguousNames: [] as string[],
            }
          : resolveConversationPlant(
              workspace.plants,
              retryPlantId !== undefined
                ? retryPlantId
                : chatRef.current.plantId,
              trimmed,
            );
      if (plantResolution.kind === "ambiguous") {
        setTypedInput(trimmed);
        changeMode("idle");
        setStatusHint(
          `Which plant do you mean: ${plantResolution.ambiguousNames.join(", ")}? Choose it in the plant selector, then send your question again.`,
        );
        requestAnimationFrame(() => plantSelectorRef.current?.focus());
        return;
      }
      const linkedPlant = plantResolution.plant;
      const switchedPlant =
        plantResolution.kind === "named" &&
        linkedPlant?.id !== chatRef.current.plantId;
      if (switchedPlant && linkedPlant) {
        linkCurrentChat(linkedPlant.id);
        setStatusHint(`Following ${linkedPlant.name} in this conversation.`);
      }
      requestBusyRef.current = true;
      const controller = new AbortController();
      requestRef.current = controller;

      const userId = newId();
      const assistantId = retryId ?? newId();
      const history = buildConversationHistory(messagesRef.current, retryId);
      const retryIndex = retryId
        ? messagesRef.current.findIndex((m) => m.id === retryId)
        : -1;
      const retryPhoto = retryId
        ? messagesRef.current[retryIndex - 1]
        : undefined;
      const attachedPhoto =
        retryId &&
        (retryPhoto?.plantId === undefined
          ? (chatRef.current.plantId ?? null)
          : retryPhoto.plantId) === (linkedPlant?.id ?? null)
          ? retryPhoto?.photo
          : retryId
            ? undefined
            : photo;
      const targetPlantId = linkedPlant?.id ?? null;
      const priorPhoto = [
        ...messagesRef.current.slice(0, retryId ? retryIndex : undefined),
      ]
        .reverse()
        .find(
          (message) =>
            message.role === "user" &&
            message.photo &&
            (message.plantId === undefined
              ? (chatRef.current.plantId ?? null)
              : message.plantId) === targetPlantId,
        )?.photo;
      const contextPhoto = attachedPhoto ?? priorPhoto;
      const plantContext = linkedPlant
        ? buildPlantMemory(linkedPlant, workspace.chats, chatRef.current.id)
        : undefined;
      setMessages((prev) =>
        retryId
          ? prev.map((m) =>
              m.id === retryId
                ? { ...m, text: "", pending: true, error: false, meta: null }
                : m,
            )
          : [
              ...prev,
              {
                id: userId,
                role: "user",
                text: trimmed,
                photo: attachedPhoto,
                createdAt: Date.now(),
                plantId: targetPlantId,
              },
              {
                id: assistantId,
                role: "assistant",
                text: "",
                pending: true,
                createdAt: Date.now(),
                plantId: targetPlantId,
              },
            ],
      );
      if (!retryId) setPhoto(undefined);
      changeMode("processing");
      setStatusHint("Thinking…");

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: trimmed,
            profile: readPlantProfile(),
            history,
            photo: contextPhoto,
            photoContext: !attachedPhoto && !!contextPhoto,
            plantContext,
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          ]),
        });
        const data = await readApiResponse<AssistantResponse>(res);
        if (controller.signal.aborted) return;
        if (
          !data ||
          typeof data.response_text !== "string" ||
          !data.response_text.trim()
        ) {
          throw new AssistantRequestError(
            "Anthea returned an empty answer. Please try again.",
          );
        }
        const fullAnswer = data.response_text;
        const spoken = briefSpeech(data.spoken_text || fullAnswer);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: fullAnswer,
                  spokenText: spoken,
                  pending: false,
                  error: false,
                  retryText: undefined,
                  meta: {
                    next_check: data.next_check ?? null,
                    species_candidate: data.species_candidate,
                    watering_days: data.watering_days,
                    is_estimate: data.is_estimate,
                    diagnosis_confidence: data.diagnosis_confidence,
                  },
                }
              : m,
          ),
        );
        if (!followConversationRef.current) setHasNewMessages(true);
        changeMode("idle");
        setStatusHint("");
        if (readReadAloud()) speakText(spoken, assistantId);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("assistant fetch failed", err);
        const msg = requestErrorMessage(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  text: msg,
                  pending: false,
                  error: true,
                  retryText: trimmed,
                  meta: null,
                }
              : m,
          ),
        );
        showMascotFeedback("error");
        if (!followConversationRef.current) setHasNewMessages(true);
        changeMode("idle");
        setStatusHint("");
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          requestBusyRef.current = false;
        }
      }
    },
    [
      changeMode,
      linkCurrentChat,
      showMascotFeedback,
      speakText,
      stopSpeech,
      photo,
      workspace.plants,
      workspace.chats,
    ],
  );

  const holdingRef = useRef(false);
  const voiceReviewDraftRef = useRef<string | null>(null);
  const voiceVocabulary = useMemo(
    () => buildPlantVocabulary(workspace.plants, chat.plantId, 5000),
    [workspace.plants, chat.plantId],
  );
  const voice = useVoiceInput({
    vocabulary: voiceVocabulary,
    onPhase: (phase) => {
      if (phase !== "listening") holdingRef.current = false;
      changeMode(phase);
    },
    onDraft: (text) => setTypedInput((previous) => previous || text),
    onReview: (review) => {
      voiceReviewDraftRef.current = review.transcript;
      setTypedInput(review.transcript);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onTranscript: (text) => {
      if (text.length > 4000) {
        setTypedInput(text);
        setStatusHint(
          "Your recording is longer than 4,000 characters. Shorten it below before sending.",
        );
        return;
      }
      triggerSixSeven(text);
      const reviewedDraft = voiceReviewDraftRef.current;
      setTypedInput((current) => (current === reviewedDraft ? "" : current));
      voiceReviewDraftRef.current = null;
      followConversationRef.current = true;
      setHasNewMessages(false);
      setStatusHint("");
      void submitTranscript(text);
    },
  });
  const {
    ready: recordingReady,
    transcribing,
    caption: liveCaption,
    liveAvailable,
    issue: micIssue,
    canRetry: canRetryTranscription,
    analyserRef,
    amplitudeRef,
    start: startCapture,
  } = voice;
  const resetVoiceFeedback = useCallback(() => {
    voiceReviewDraftRef.current = null;
    sixSevenPlayedRef.current = false;
    if (sixSevenTimerRef.current) clearTimeout(sixSevenTimerRef.current);
    setSixSevenActive(false);
    setStatusHint("");
  }, []);
  const onStartListen = useCallback(() => {
    if (
      (modeRef.current !== "idle" && modeRef.current !== "speaking") ||
      requestBusyRef.current ||
      photoBusy
    )
      return;
    setVoiceOptionsOpen(false);
    stopSpeech();
    resetVoiceFeedback();
    void startCapture(true);
  }, [stopSpeech, resetVoiceFeedback, startCapture, photoBusy]);
  const startPushToTalk = () => {
    if (
      holdingRef.current ||
      (modeRef.current !== "idle" && modeRef.current !== "speaking") ||
      requestBusyRef.current ||
      photoBusy
    )
      return;
    holdingRef.current = true;
    setVoiceOptionsOpen(false);
    stopSpeech();
    resetVoiceFeedback();
    void startCapture(false);
  };
  const releasePushToTalk = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    void voice.finish();
  };
  const cancelRecording = () => {
    holdingRef.current = false;
    voice.cancel();
    setStatusHint("Recording cancelled. Nothing was sent.");
  };
  const voiceTrayVisible =
    voiceOptionsOpen || mode === "listening" || transcribing;
  const dismissVoiceOptions = () => {
    if (mode === "listening" || transcribing) cancelRecording();
    setVoiceOptionsOpen(false);
    micButtonRef.current?.focus();
  };
  useEffect(() => {
    if (!followConversationRef.current) return;
    scrollEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [messages, liveCaption]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const starter = url.searchParams.get("starter");
    if (messages.length || !starter || !Object.hasOwn(landingPrompts, starter))
      return;
    const timer = window.setTimeout(() => {
      setTypedInput(landingPrompts[starter as keyof typeof landingPrompts]);
      url.searchParams.delete("starter");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
      textareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    if (
      landingVoiceStartedRef.current ||
      messages.length > 0 ||
      new URLSearchParams(window.location.search).get("startVoice") !== "1"
    )
      return;
    // Defer until the chat is mounted; cancelling the timer also handles Strict Mode's effect replay.
    const timer = window.setTimeout(() => {
      landingVoiceStartedRef.current = true;
      const url = new URL(window.location.href);
      url.searchParams.delete("startVoice");
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
      onStartListen();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [messages.length, onStartListen]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      interruptChat(chat.id);
      window.speechSynthesis?.cancel();
    },
    [interruptChat, chat.id],
  );

  const showWelcome = messages.length === 0;
  const visibleMode = mode === "listening" && !recordingReady ? "idle" : mode;
  const captionPresentation = captureCaptionPresentation(
    liveAvailable,
    liveCaption,
  );
  const cacteaState = sixSevenActive
    ? "sixSeven"
    : resolveCacteaState(visibleMode, mascotFeedback);
  const latestPlantSummary = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (
        message.role === "assistant" &&
        !message.pending &&
        !message.error &&
        message.meta
      )
        return message.meta;
    }
    return null;
  }, [messages]);

  const composerDisabled =
    mode === "processing" || mode === "listening" || photoBusy;
  const starterGoals = useMemo(() => {
    const all = ["identify", "symptoms", "care", "explore"] as const;
    const first = profile?.goal ?? "symptoms";
    return [first, ...all.filter((goal) => goal !== first)].slice(0, 3);
  }, [profile?.goal]);

  const chooseStarter = (text: string) => {
    setTypedInput(text);
    textareaRef.current?.focus();
  };

  const sendTypedQuestion = () => {
    const text =
      typedInput.trim() ||
      (photo ? "What can you tell me about this plant photo?" : "");
    if (
      !text ||
      text.length > 4000 ||
      composerDisabled ||
      requestBusyRef.current
    )
      return;
    followConversationRef.current = true;
    setHasNewMessages(false);
    setTypedInput("");
    voiceReviewDraftRef.current = null;
    voice.cancel();
    void submitTranscript(text);
  };

  const scrollToLatest = () => {
    followConversationRef.current = true;
    setHasNewMessages(false);
    scrollEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  };

  const startNewPlantConversation = () => {
    newPlantDialogRef.current?.close();
    newChat();
  };

  return (
    <div className={`app-shell ${styles.shell}`}>
      <main className={styles.workspace}>
        <section className={styles.chatArea} aria-labelledby="chat-title">
          <PlantSummaryCard
            summary={latestPlantSummary}
            mode={mode}
            conversationNumber={conversationNumber}
            onAskNext={() =>
              chooseStarter("What should I check next for this plant?")
            }
            actionsDisabled={composerDisabled}
            toolbar={
              <div className={styles.toolbar}>
                <div className={styles.toolbarInner}>
                  <div className={styles.toolbarControls}>
                    <label className={styles.plantContext}>
                      <Icon name="leaf" size={17} />
                      <span className={styles.plantContextLabel}>Plant</span>
                      <select
                        ref={plantSelectorRef}
                        aria-label="Link conversation to a plant"
                        value={chat.plantId ?? ""}
                        disabled={mode !== "idle"}
                        onChange={(e) =>
                          linkCurrentChat(e.target.value || undefined)
                        }
                      >
                        <option value="">General care</option>
                        {workspace.plants.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <details className={styles.voiceSettings}>
                      <summary aria-label="Voice settings">
                        <Icon name="microphone" size={17} />
                        <span>Voice settings</span>
                      </summary>
                      <div>
                        <label>
                          <input
                            type="checkbox"
                            checked={readAloud}
                            onChange={(e) => {
                              saveReadAloud(e.target.checked);
                              if (!e.target.checked) stopSpeech();
                            }}
                          />
                          Read replies aloud
                        </label>
                        <Link
                          className={styles.voicePreferencesLink}
                          href="/settings#voice-settings-title"
                        >
                          Choose or preview a voice →
                        </Link>
                      </div>
                    </details>
                    <details className={styles.chatMenu}>
                      <summary aria-label="Conversation actions">⋯</summary>
                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            const title = window.prompt(
                              "Conversation name",
                              chat.title,
                            );
                            if (title?.trim())
                              save("chats", {
                                ...chat,
                                title: title.trim().slice(0, 120),
                              });
                          }}
                        >
                          Rename chat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              messages.length ||
                              typedInput.trim() ||
                              photo ||
                              mode !== "idle"
                            )
                              newPlantDialogRef.current?.showModal();
                            else startNewPlantConversation();
                          }}
                        >
                          New chat
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm("Delete this saved conversation?")
                            )
                              remove("chats", chat.id);
                          }}
                        >
                          Delete chat
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            }
          />
          <section
            className={`chat-scroll ${styles.scroll}`}
            aria-label="Chat messages"
            ref={chatScrollRef}
            onScroll={() => {
              const element = chatScrollRef.current;
              if (!element) return;
              const nearBottom =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                100;
              followConversationRef.current = nearBottom;
              if (nearBottom) setHasNewMessages(false);
            }}
          >
            {showWelcome && (
              <section
                className={`dashboard-welcome ${styles.welcome}`}
                aria-labelledby="welcome-title"
              >
                <div className={styles.welcomeGrid}>
                  <div className={`welcome-copy ${styles.welcomeCopy}`}>
                    <h2 id="welcome-title" className={styles.questionTitle}>
                      Let&apos;s look at
                      <br />
                      your plant
                    </h2>
                    <p className={`welcome-description ${styles.description}`}>
                      Tell Cactea what you see. Together, you&apos;ll find one
                      useful advice
                    </p>
                    <div className={styles.welcomeActions}>
                      {micSupported && (
                        <button
                          type="button"
                          className={styles.welcomeTalk}
                          disabled={composerDisabled}
                          onClick={onStartListen}
                        >
                          <Icon name="microphone" size={20} />
                          <span>Talk to Cactea</span>
                          <span aria-hidden="true">→</span>
                        </button>
                      )}
                    </div>
                    {micSupported && (
                      <p className={styles.welcomeReassurance}>
                        <br />
                        Your question sends automatically when you pause
                      </p>
                    )}
                    <details className={styles.demoGuide}>
                      <summary>How voice questions work</summary>
                      <ol>
                        <li>
                          Allow microphone access, then describe what you see.
                        </li>
                        <li>
                          Pause when you&apos;re done. Your question sends
                          automatically.
                        </li>
                        <li>Edit it if needed, then send your question.</li>
                      </ol>
                    </details>
                  </div>
                  <div className={`dashboard-preferences ${styles.starters}`}>
                    <div className={styles.starterHeader}>
                      <div>
                        <span>Need a place to begin?</span>
                        <h3>Try one of these</h3>
                        <span className={styles.starterNote}>
                          Choose one to edit it in the chat box
                        </span>
                      </div>
                      {profile && (
                        <button
                          type="button"
                          className={styles.resetSuggestions}
                          onClick={() => {
                            const cleared = savePlantProfile(null);
                            setStatusHint(
                              cleared
                                ? "Saved preferences cleared."
                                : "Preferences cleared for this visit. Browser storage is unavailable.",
                            );
                          }}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div className={styles.starterList}>
                      {starterGoals.map((goal, index) => (
                        <button
                          type="button"
                          key={goal}
                          disabled={composerDisabled}
                          className={styles.starterChoice}
                          onClick={() => chooseStarter(starterQuestions[goal])}
                        >
                          <span className={styles.starterNumber}>
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className={styles.starterText}>
                            <strong>{starterTitles[goal]}</strong>
                            <small>{starterDescriptions[goal]}</small>
                          </span>
                          <span
                            className={styles.starterArrow}
                            aria-hidden="true"
                          >
                            ↗
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div
              className="conversation-log"
              role="log"
              aria-label="Conversation with Anthea"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {messages.map((m) => (
                <div key={m.id} className={`msg-row msg-row--${m.role}`}>
                  {m.role === "assistant" && (
                    <div className="ws-chat-avatar">
                      <Cactea state="idle" size="sm" />
                    </div>
                  )}
                  <div className="msg-col">
                    <span className="sr-only">
                      {m.role === "assistant" ? "Anthea" : "You"}:
                    </span>
                    <div
                      className={`msg-bubble msg-bubble--${m.role} ${m.error ? "msg-bubble--error" : ""}`}
                    >
                      {m.photo && (
                        <img
                          className="ws-chat-photo"
                          src={m.photo}
                          alt="Plant photo shared in this conversation"
                        />
                      )}
                      {m.pending ? (
                        <span className="typing-dots" aria-label="Thinking">
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : m.reminderProposal?.status === "pending" ? (
                        "This older reminder draft can no longer be completed."
                      ) : m.role === "assistant" && !m.error ? (
                        <AssistantAnswer
                          text={m.text}
                          brief={m.spokenText || briefSpeech(m.text)}
                          nextStep={m.meta?.next_check}
                          speaking={speakingMessageId === m.id}
                          disabled={composerDisabled}
                          onBrief={() =>
                            speakText(m.spokenText || briefSpeech(m.text), m.id)
                          }
                          onMore={() => speakText(m.text, m.id)}
                          onStop={stopSpeech}
                        />
                      ) : (
                        m.text
                      )}
                    </div>
                    {m.createdAt && (
                      <time
                        className="ws-time"
                        dateTime={new Date(m.createdAt).toISOString()}
                      >
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    )}
                    {m.role === "assistant" && !m.pending && m.retryText && (
                      <div className="message-actions">
                        <button
                          type="button"
                          disabled={composerDisabled}
                          onClick={() =>
                            void submitTranscript(m.retryText!, m.id)
                          }
                        >
                          Retry question
                        </button>
                      </div>
                    )}
                    {m.meta && !m.pending && (
                      <span className={styles.messageSource}>
                        {m.meta.is_estimate
                          ? "Estimated guidance"
                          : "AI plant-care guidance"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div ref={scrollEndRef} />
          </section>

          <div className={styles.inputDock}>
            {hasNewMessages && (
              <button
                type="button"
                className="new-response"
                onClick={scrollToLatest}
              >
                New response ↓
              </button>
            )}
            <div
              className={styles.composerBox}
              data-voice-open={voiceTrayVisible}
              onKeyDown={(event) => {
                if (event.key === "Escape" && voiceTrayVisible) {
                  event.preventDefault();
                  dismissVoiceOptions();
                }
              }}
            >
              {voiceTrayVisible && (
                <section
                  id={voiceOptionsId}
                  className={styles.voiceDock}
                  data-listening={mode === "listening" && recordingReady}
                  aria-label="Voice conversation"
                >
                  <div
                    className={styles.voiceStatus}
                    role="status"
                    data-has-hint={
                      mode !== "idle" ||
                      Boolean(micIssue || statusHint) ||
                      !micSupported ||
                      playbackPending
                    }
                  >
                    <strong>
                      {mode === "listening" && recordingReady
                        ? "Cactea is listening"
                        : mode === "idle"
                          ? "Voice options"
                          : voiceHeading(
                              mode,
                              recordingReady,
                              transcribing,
                              playbackPending,
                            )}
                    </strong>
                    <span>
                      {mode === "listening"
                        ? recordingReady
                          ? "Pause when finished. Your question sends automatically."
                          : "Allow Microphone in the browser prompt."
                        : mode === "speaking"
                          ? "Stop audio or talk again to ask a follow-up."
                          : mode === "processing" || playbackPending
                            ? "Your question stays in this conversation."
                            : !micSupported
                              ? "Microphone unavailable. Type your question below."
                              : micIssue
                                ? "Your draft is kept. Choose a recovery option below."
                                : statusHint ||
                                  (readAloud
                                    ? "Ask a plant question aloud."
                                    : "Enable spoken replies in Voice settings.")}
                    </span>
                  </div>
                  {(micSupported || speakingMessageId) && (
                    <div className={styles.voiceActions}>
                      {micSupported && (
                        <>
                          {mode === "listening" && (
                            <button
                              type="button"
                              className={styles.cancelRecording}
                              aria-label="Cancel recording"
                              onClick={cancelRecording}
                            >
                              <span aria-hidden="true">×</span> Cancel
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.voiceStart}
                            data-listening={mode === "listening"}
                            disabled={
                              mode === "processing" ||
                              photoBusy ||
                              (mode === "listening" && !recordingReady)
                            }
                            onClick={() =>
                              mode === "listening"
                                ? void voice.finish()
                                : onStartListen()
                            }
                          >
                            <span className={styles.voiceIcon}>
                              <Icon name="microphone" size={16} />
                            </span>
                            <span className={styles.voiceCopy}>
                              <strong>
                                {mode === "listening"
                                  ? recordingReady
                                    ? "Send now"
                                    : "Allow microphone…"
                                  : mode === "processing"
                                    ? "Please wait…"
                                    : messages.length
                                      ? "Talk to Cactea again"
                                      : "Talk to Cactea"}
                              </strong>
                            </span>
                          </button>
                          <button
                            type="button"
                            className={styles.pushToTalk}
                            disabled={mode === "processing" || photoBusy}
                            aria-label="Hold to talk; release to send"
                            onPointerDown={(event) => {
                              if (event.button !== 0) return;
                              event.preventDefault();
                              event.currentTarget.setPointerCapture(
                                event.pointerId,
                              );
                              startPushToTalk();
                            }}
                            onPointerUp={releasePushToTalk}
                            onPointerCancel={() => {
                              if (holdingRef.current) cancelRecording();
                            }}
                            onLostPointerCapture={() => {
                              if (holdingRef.current) cancelRecording();
                            }}
                            onKeyDown={(event) => {
                              if (
                                (event.key === " " || event.key === "Enter") &&
                                !event.repeat
                              ) {
                                event.preventDefault();
                                startPushToTalk();
                              }
                              if (event.key === "Escape" && holdingRef.current)
                                cancelRecording();
                            }}
                            onKeyUp={(event) => {
                              if (event.key === " " || event.key === "Enter") {
                                event.preventDefault();
                                releasePushToTalk();
                              }
                            }}
                            onBlur={() => {
                              if (holdingRef.current) cancelRecording();
                            }}
                            onContextMenu={(event) => event.preventDefault()}
                          >
                            Hold to talk
                          </button>
                        </>
                      )}
                      {speakingMessageId && (
                        <button
                          type="button"
                          className={styles.stopAudio}
                          onClick={stopSpeech}
                        >
                          Stop audio
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.dismissVoice}
                        aria-label="Close voice options"
                        onClick={dismissVoiceOptions}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                  )}
                  {mode === "listening" && recordingReady && (
                    <div className={styles.liveCaption}>
                      <span className={styles.waveformFrame}>
                        <AudioWaveformCanvas
                          analyserRef={analyserRef}
                          isListening={true}
                          width={96}
                          height={28}
                        />
                      </span>
                      <div className={styles.liveCaptionCopy}>
                        <span role="status">{captionPresentation.label}</span>
                        <p>{captionPresentation.text}</p>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {voice.review && (
                <section
                  className={styles.micRecovery}
                  aria-label="Confirm plant name"
                >
                  <p role="status">
                    {voice.review.suggestions.length === 1
                      ? `I heard “${voice.review.heard}”. Did you mean “${voice.review.suggestions[0]}”?`
                      : voice.review.suggestions.length
                        ? `I heard “${voice.review.heard}”. Which plant did you mean?`
                        : `I heard “${voice.review.heard}”. Please check the plant name before sending.`}
                  </p>
                  <p>Your question is ready to edit below.</p>
                  <div>
                    {voice.review.suggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        disabled={composerDisabled}
                        onClick={() => {
                          voice.confirmName(name);
                        }}
                      >
                        Use {name}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={composerDisabled}
                      onClick={sendTypedQuestion}
                    >
                      Send as heard
                    </button>
                    <button
                      type="button"
                      disabled={composerDisabled}
                      onClick={() => {
                        voiceReviewDraftRef.current = null;
                        voice.cancel();
                        requestAnimationFrame(() =>
                          textareaRef.current?.focus(),
                        );
                      }}
                    >
                      Edit question
                    </button>
                    {canRetryTranscription && (
                      <button
                        type="button"
                        disabled={composerDisabled}
                        onClick={() => {
                          void voice.retry();
                        }}
                      >
                        Retry transcription
                      </button>
                    )}
                  </div>
                </section>
              )}
              {(micIssue || (canRetryTranscription && !voice.review)) && (
                <section
                  className={styles.micRecovery}
                  aria-label="Voice recovery"
                >
                  <p role="alert">
                    {micIssue ||
                      "Your recording has been kept for another transcription attempt. Any captured words are available to edit."}
                  </p>
                  <div>
                    {canRetryTranscription && (
                      <button
                        type="button"
                        disabled={mode !== "idle"}
                        onClick={() => {
                          void voice.retry();
                        }}
                      >
                        Retry transcription
                      </button>
                    )}
                    {micSupported && (
                      <button
                        type="button"
                        disabled={mode !== "idle"}
                        onClick={() => {
                          onStartListen();
                        }}
                      >
                        Retry microphone
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={mode !== "idle"}
                      onClick={() => {
                        voice.cancel();
                        setStatusHint(
                          "Type or edit your question below. Your draft has been kept.",
                        );
                        requestAnimationFrame(() =>
                          textareaRef.current?.focus(),
                        );
                      }}
                    >
                      Type instead
                    </button>
                  </div>
                </section>
              )}

              <>
                {photo && (
                  <div className="ws-attachment">
                    <img src={photo} alt="Photo ready to send" />
                    <span>Photo attached · sent with your question</span>
                    <button
                      type="button"
                      onClick={() => setPhoto(undefined)}
                      aria-label="Remove attached photo"
                    >
                      ×
                    </button>
                  </div>
                )}
                <form
                  className={`composer ${styles.composer}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendTypedQuestion();
                  }}
                >
                  <button
                    type="button"
                    className="ws-attach"
                    aria-label="Attach a plant photo"
                    disabled={composerDisabled}
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Icon name="photo" />
                  </button>
                  <input
                    className="sr-only"
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setPhotoBusy(true);
                      setStatusHint("Preparing photo…");
                      try {
                        setPhoto(await preparePhoto(file));
                        setStatusHint(
                          "Photo ready. Add a question or send it as it is.",
                        );
                      } catch (error) {
                        setStatusHint((error as Error).message);
                      } finally {
                        setPhotoBusy(false);
                      }
                    }}
                  />
                  <textarea
                    ref={textareaRef}
                    className="composer-input"
                    aria-label="Your plant question"
                    rows={1}
                    maxLength={4000}
                    value={typedInput}
                    onChange={(e) => {
                      voiceReviewDraftRef.current = null;
                      if (voice.review) voice.cancel();
                      setTypedInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        sendTypedQuestion();
                      }
                    }}
                    placeholder="Describe your plant, or use the microphone…"
                    disabled={mode === "listening"}
                  />
                  <button
                    ref={micButtonRef}
                    type="button"
                    className={styles.composerMic}
                    aria-label={
                      voiceTrayVisible
                        ? "Close voice options"
                        : "Open voice options"
                    }
                    aria-expanded={voiceTrayVisible}
                    aria-controls={voiceOptionsId}
                    disabled={!micSupported && !speakingMessageId}
                    title={
                      micSupported
                        ? "Voice options"
                        : "Microphone unavailable in this browser"
                    }
                    onClick={() => {
                      if (voiceTrayVisible) dismissVoiceOptions();
                      else setVoiceOptionsOpen(true);
                    }}
                  >
                    <Icon name="microphone" size={20} />
                  </button>
                  <button
                    type="submit"
                    className="composer-send"
                    disabled={
                      (!typedInput.trim() && !photo) ||
                      typedInput.length > 4000 ||
                      composerDisabled
                    }
                    aria-label="Send"
                  >
                    →
                  </button>
                </form>
              </>
            </div>
            <p className={styles.composerHelp}>
              {typedInput.length >= 3500
                ? `${typedInput.length.toLocaleString()} / 4,000 characters · `
                : ""}
              Enter to send · Shift + Enter for a new line
            </p>
          </div>
        </section>
        <CompanionPanel
          mode={visibleMode}
          state={cacteaState}
          transcribing={transcribing}
          onChooseSuggestion={chooseStarter}
          actionsDisabled={composerDisabled}
          volumeRef={amplitudeRef}
        >
          <div
            className={`ws-greeting ${styles.chatGreeting} ${styles.sidebarGreeting}`}
          >
            <div className={styles.greetingIntro}>
              <div className={styles.greetingCopy}>
                <h1 id="cactea-greeting-title">Hi, I’m Cactea!</h1>
                <p>Ask me anything about your plants</p>
              </div>
            </div>
          </div>
        </CompanionPanel>
      </main>
      <dialog
        ref={newPlantDialogRef}
        className={styles.resetDialog}
        aria-labelledby="new-plant-title"
        aria-describedby="new-plant-description"
      >
        <h2 id="new-plant-title">Start a new plant conversation?</h2>
        <p id="new-plant-description">
          This conversation will stay in Recent chats. Any unsent draft or
          recording will be discarded.
        </p>
        <div className={styles.dialogActions}>
          <form method="dialog">
            <button type="submit">Keep this conversation</button>
          </form>
          <button
            type="button"
            className={styles.sendTranscript}
            onClick={startNewPlantConversation}
          >
            Start fresh
          </button>
        </div>
      </dialog>
    </div>
  );
}
