"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Cactea from "@/app/components/cactea/Cactea";
import Icon from "@/app/components/workspace/Icon";
import { useWorkspace } from "@/app/components/workspace/WorkspaceProvider";
import { type Chat, type Message as ChatMessage } from "@/lib/workspace-data";
import { preparePhoto } from "@/lib/prepare-photo";
import { microphoneProblem, voiceHeading } from "@/lib/voice-feedback";
import CompanionPanel from "./CompanionPanel";
import styles from "./Dashboard.module.css";
import { resolveCacteaState, type AgentMode, type CacteaFeedback } from "@/lib/cactea-state";
import { blobToWav } from "@/lib/wav";
import { starterQuestions } from "@/lib/plant-profile";
import { readPlantProfile, readReadAloud, savePlantProfile, saveReadAloud, usePlantProfile, useReadAloud } from "@/lib/plant-profile-store";
import { AssistantRequestError, readApiResponse, requestErrorMessage } from "@/lib/assistant-request";
import useSpeechPlayback from "./useSpeechPlayback";
import { buildConversationHistory } from "@/lib/conversation";
import { briefSpeech } from '@/lib/care-dialogue';
import { parseReminderCommand, validReminderDraft } from '@/lib/reminder-intent';
import ReminderProposalCard from './ReminderProposalCard';
import AssistantAnswer from './AssistantAnswer';
import Link from 'next/link';

const BENIGN_STT_ERRORS = new Set(["aborted", "no-speech"]);

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

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

const SILENCE_MS = 1200;
const RMS_THRESHOLD = 0.02;
const NO_SPEECH_TIMEOUT_MS = 15000;
const REQUEST_TIMEOUT_MS = 65000;

function microphoneAvailable() {
  return !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}
const subscribeBrowserCapabilities = () => () => {};

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

export default function ChatDashboard({ chat }: { chat: Chat }) {
  const { data: workspace, save, remove, newChat, interruptChat } = useWorkspace();
  const chatRef = useRef(chat);
  useEffect(() => { chatRef.current = chat; }, [chat]);
  const photoInputRef = useRef<HTMLInputElement>(null);
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
    save('chats', { ...currentChat, messages, updatedAt: Date.now(), title: currentChat.title === 'New conversation' ? (messages.find(m => m.role === 'user')?.text.slice(0,65) || currentChat.title) : currentChat.title });
  }, [messages, save]);
  const [liveCaption, setLiveCaption] = useState("");
  const micSupported = useSyncExternalStore(subscribeBrowserCapabilities, microphoneAvailable, () => false);
  const [typedInput, setTypedInput] = useState("");
  const [statusHint, setStatusHint] = useState("");
  const [mascotFeedback, setMascotFeedback] = useState<CacteaFeedback>(null);
  const [recordingReady, setRecordingReady] = useState(false);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [reviewTranscript, setReviewTranscript] = useState<string | null>(null);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [micIssue, setMicIssue] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [canRetryTranscription, setCanRetryTranscription] = useState(false);
  const retainedRecordingRef = useRef<Blob | null>(null);
  const previousReviewRef = useRef<string | null>(null);
  const confirmedReminderIdsRef = useRef(new Set<string>());
  const conversationNumber = workspace.chats.findIndex(c => c.id === chat.id) + 1;

  // Meter samples are consumed by the canvas; they do not render chat content.
  const amplitudeRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef("");
  const preferCloudSttRef = useRef(false);
  const rafAmpRef = useRef<number>(0);
  const silenceStartedRef = useRef<number | null>(null);
  const lastHeardSpeechRef = useRef(false);
  const transcriptRef = useRef("");
  const submittedRef = useRef(false);
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<AgentMode>("idle");
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingSessionRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);
  const transcriptionRef = useRef<AbortController | null>(null);
  const requestBusyRef = useRef(false);
  const followConversationRef = useRef(true);
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>(chat.messages);
  const transcriptReviewRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptCardRef = useRef<HTMLElement | null>(null);
  const newPlantDialogRef = useRef<HTMLDialogElement | null>(null);
  const reviewingTranscript = reviewTranscript !== null;

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => {
    if (reviewingTranscript) {
      if (editingTranscript) transcriptReviewRef.current?.focus();
      else transcriptCardRef.current?.focus();
    }
  }, [reviewingTranscript, editingTranscript]);

  const changeMode = useCallback((mode: AgentMode) => {
    modeRef.current = mode;
    setMode(mode);
  }, []);

  useEffect(() => {
    if (!followConversationRef.current) return;
    // Instant positioning avoids treating intermediate smooth-scroll frames
    // as the user leaving the bottom while a response is arriving.
    scrollEndRef.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [messages, liveCaption]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const borderHeight = textarea.offsetHeight - textarea.clientHeight;
    const contentHeight = textarea.scrollHeight + borderHeight;
    textarea.style.height = `${Math.min(contentHeight, 120)}px`;
    textarea.style.overflowY = contentHeight > 120 ? "auto" : "hidden";
  }, [typedInput, reviewingTranscript]);

  const showMascotFeedback = useCallback((feedback: Exclude<CacteaFeedback, null>) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setMascotFeedback(feedback);
    feedbackTimerRef.current = setTimeout(() => {
      setMascotFeedback(null);
      feedbackTimerRef.current = null;
    }, feedback === "success" ? 720 : 900);
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const stopRecognition = useCallback(() => {
    try {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
      }
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
  }, []);

  const stopMediaRecorder = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      const capturedChunks = recordedChunksRef.current;
      if (!recorder || recorder.state === "inactive") {
        const chunks = recordedChunksRef.current;
        mediaRecorderRef.current = null;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(
          new Blob(chunks, { type: recorderMimeRef.current || "audio/webm" }),
        );
        return;
      }
      recorder.onstop = () => {
        const chunks = capturedChunks;
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        if (chunks.length === 0) {
          resolve(null);
          return;
        }
        resolve(
          new Blob(chunks, { type: recorderMimeRef.current || "audio/webm" }),
        );
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
  }, []);

  const stopAudioMeter = useCallback(() => {
    if (rafAmpRef.current) cancelAnimationFrame(rafAmpRef.current);
    rafAmpRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    amplitudeRef.current = 0;
  }, []);

  const cleanupListening = useCallback(() => {
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
    stopRecognition();
    stopAudioMeter();
    silenceStartedRef.current = null;
    lastHeardSpeechRef.current = false;
  }, [stopAudioMeter, stopRecognition]);

  const onSpeechStart = useCallback(() => { setMascotFeedback(null); changeMode("speaking"); }, [changeMode]);
  const onSpeechFinish = useCallback(() => {
    if (modeRef.current === "speaking") changeMode("idle");
  }, [changeMode]);
  const onSpeechError = useCallback(() => {
    setStatusHint("The spoken reply could not play. Choose Hear brief answer to retry, and check your device volume. The answer is saved below.");
  }, []);
  const { speak: speakText, stop: stopSpeech, speakingMessageId, playbackPending } = useSpeechPlayback(onSpeechStart, onSpeechFinish, onSpeechError);

  const submitTranscript = useCallback(
    async (text: string, retryId?: string) => {
      const trimmed = text.trim();
      if (requestBusyRef.current || modeRef.current === "listening") return;
      if (!trimmed) {
        changeMode("idle");
        setStatusHint("I didn’t hear any words. Try recording again, or type your question.");
        return;
      }
      stopSpeech();
      const reminderDraft = !retryId ? parseReminderCommand(trimmed) : null;
      if (reminderDraft) {
        const assistantId = newId();
        const answer = reminderDraft.due ? 'I’ve prepared your reminder. Review the date and confirm below to save it.' : 'I’ve prepared your reminder. Choose a due date and confirm below to save it.';
        setMessages(previous => [...previous,
          { id: newId(), role: 'user', text: trimmed, photo, createdAt: Date.now() },
          { id: assistantId, role: 'assistant', text: answer, spokenText: answer, createdAt: Date.now(), reminderProposal: { ...reminderDraft, id: newId(), status: 'pending' } },
        ]);
        setPhoto(undefined);
        changeMode('idle');
        setStatusHint('Reminder proposal ready. Nothing has been saved yet.');
        if (readReadAloud()) speakText(answer, assistantId);
        return;
      }
      requestBusyRef.current = true;
      const controller = new AbortController();
      requestRef.current = controller;

      const userId = newId();
      const assistantId = retryId ?? newId();
      const history = buildConversationHistory(messagesRef.current, retryId);
      const retryIndex = retryId ? messagesRef.current.findIndex(m => m.id === retryId) : -1;
      const attachedPhoto = retryId ? messagesRef.current[retryIndex - 1]?.photo : photo;
      const contextPhoto = attachedPhoto ?? [...messagesRef.current.slice(0, retryId ? retryIndex : undefined)].reverse().find(m => m.role === 'user' && m.photo)?.photo;
      const linkedPlant = workspace.plants.find(p => p.id === chatRef.current.plantId);
      const plantContext = linkedPlant ? `Saved plant: ${linkedPlant.name}; species as recorded by user: ${linkedPlant.species || 'unknown'}; location: ${linkedPlant.location || 'unknown'}. Care notes: ${linkedPlant.notes.slice(0, 2000)}` : undefined;
      setMessages((prev) => retryId ? prev.map((m) => m.id === retryId ? { ...m, text: "", pending: true, error: false, meta: null } : m) : [
        ...prev,
        { id: userId, role: "user", text: trimmed, photo: attachedPhoto, createdAt: Date.now() },
        { id: assistantId, role: "assistant", text: "", pending: true, createdAt: Date.now() },
      ]);
      if (!retryId) setPhoto(undefined);
      changeMode("processing");
      setStatusHint("Thinking…");
      setLiveCaption("");

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: trimmed, profile: readPlantProfile(), history, photo: contextPhoto, photoContext: !attachedPhoto && !!contextPhoto, plantContext }),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
        });
        const data = await readApiResponse<AssistantResponse>(res);
        if (controller.signal.aborted) return;
        if (!data || typeof data.response_text !== "string" || !data.response_text.trim()) {
          throw new AssistantRequestError("Anthea returned an empty answer. Please try again.");
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
        showMascotFeedback("success");
        if (readReadAloud()) speakText(spoken, assistantId);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("assistant fetch failed", err);
        const msg = requestErrorMessage(err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: msg, pending: false, error: true, retryText: trimmed, meta: null } : m,
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
    [changeMode, showMascotFeedback, speakText, stopSpeech, photo, workspace.plants],
  );

  const transcribeWithGemini = useCallback(
    async (blob: Blob, signal: AbortSignal): Promise<string> => {
      setStatusHint("Transcribing…");
      let wav: Blob;
      try {
        wav = await blobToWav(blob);
      } catch {
        wav = blob;
      }
      const form = new FormData();
      form.append("audio", wav, "speech.wav");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
        signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      const data = await readApiResponse<{
        transcript?: string;
      }>(res);
      return data && typeof data.transcript === "string" ? data.transcript.trim() : "";
    },
    [],
  );

  const finishRecording = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const session = recordingSessionRef.current;
    setTranscribing(true);
    setCanRetryTranscription(false);
    changeMode("processing");
    setRecordingReady(false);
    setStatusHint("Finishing recording…");

    const recorded = await stopMediaRecorder() || retainedRecordingRef.current;
    retainedRecordingRef.current = recorded;
    if (session !== recordingSessionRef.current) return;
    stopRecognition();
    const browserText = transcriptRef.current.trim();
    if (noSpeechTimerRef.current) {
      clearTimeout(noSpeechTimerRef.current);
      noSpeechTimerRef.current = null;
    }
    stopAudioMeter();
    silenceStartedRef.current = null;

    if (session !== recordingSessionRef.current) return;
    const controller = new AbortController();
    transcriptionRef.current = controller;

    try {
      let text = browserText;
      if (
        (!text || preferCloudSttRef.current) &&
        recorded &&
        recorded.size > 0
      ) {
        text = await transcribeWithGemini(recorded, controller.signal);
        if (session !== recordingSessionRef.current || controller.signal.aborted) return;
        if (text) {
          setLiveCaption(text);
          transcriptRef.current = text;
        }
      }

      changeMode("idle");
      setLiveCaption("");
      if (text.trim()) {
        setReviewTranscript(text.trim());
        previousReviewRef.current = null;
        retainedRecordingRef.current = null;
        setStatusHint("Review your transcript before sending. You can edit anything I misheard.");
      } else {
        setReviewTranscript(previousReviewRef.current);
        setMicIssue("No words were detected. Move closer to your microphone, check its input level, and retry or type your question.");
        setStatusHint("I didn’t hear any words. Try recording again, or type your question.");
      }
    } catch (err) {
      if (session !== recordingSessionRef.current || controller.signal.aborted) return;
      console.error("submit/transcribe failed", err);
      changeMode("idle");
      setReviewTranscript(previousReviewRef.current || browserText || null);
      setCanRetryTranscription(Boolean(recorded?.size));
      setStatusHint(requestErrorMessage(err, "transcription"));
      showMascotFeedback("error");
    } finally {
      if (session === recordingSessionRef.current) setTranscribing(false);
      if (transcriptionRef.current === controller) transcriptionRef.current = null;
    }
  }, [
    changeMode,
    stopAudioMeter,
    stopMediaRecorder,
    stopRecognition,
    showMascotFeedback,
    transcribeWithGemini,
  ]);

  const startAmplitudeLoop = useCallback((onSilence: () => void) => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (modeRef.current !== "listening") return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      amplitudeRef.current = Math.min(1, rms * 4);

      if (rms >= RMS_THRESHOLD) {
        silenceStartedRef.current = null;
        lastHeardSpeechRef.current = true;
      } else if (lastHeardSpeechRef.current) {
        if (silenceStartedRef.current == null) {
          silenceStartedRef.current = performance.now();
        } else if (
          performance.now() - silenceStartedRef.current >=
          SILENCE_MS
        ) {
          onSilence();
          return;
        }
      }

      rafAmpRef.current = requestAnimationFrame(tick);
    };

    rafAmpRef.current = requestAnimationFrame(tick);
  }, []);

  const startMicStream = useCallback(async (session: number) => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (recordingSessionRef.current !== session) {
      stream.getTracks().forEach((track) => track.stop());
      return false;
    }
    streamRef.current = stream;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;

    const chunks: Blob[] = [];
    recordedChunksRef.current = chunks;
    const mime = pickRecorderMime();
    recorderMimeRef.current = mime;
    const recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime })
      : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(250);
    if (ctx.state === "suspended") await ctx.resume();
    return true;
  }, []);

  const beginListening = useCallback(
    async (opts: { autoSilenceSubmit: boolean }) => {
      const session = ++recordingSessionRef.current;
      setMicIssue(null);
      setCanRetryTranscription(false);
      retainedRecordingRef.current = null;
      submittedRef.current = false;
      preferCloudSttRef.current = false;
      silenceStartedRef.current = null;
      lastHeardSpeechRef.current = false;
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
      setMascotFeedback(null);
      setLiveCaption("");
      transcriptRef.current = "";
      changeMode("listening");
      setRecordingReady(false);
      setStatusHint("Waiting for microphone access…");

      try {
        if (!await startMicStream(session)) return;
        if (session !== recordingSessionRef.current) return;
      } catch (err) {
        if (session !== recordingSessionRef.current) return;
        console.error("getUserMedia failed", err);
        cleanupListening();
        changeMode("idle");
        setStatusHint("");
        setMicIssue(microphoneProblem(err));
        setReviewTranscript(previousReviewRef.current);
        showMascotFeedback("error");
        return;
      }

      setRecordingReady(true);
      setStatusHint(opts.autoSilenceSubmit ? "Speak now. Pause for about a second when finished, or choose Review recording. Nothing is sent until you approve the transcript." : "Hold and speak…");
      streamRef.current?.getAudioTracks().forEach(track => {
        track.onended = () => {
          if (session !== recordingSessionRef.current || submittedRef.current) return;
          setMicIssue("The microphone disconnected. Review any words captured, then reconnect and retry or type the rest.");
          void finishRecording();
        };
      });
      if (mediaRecorderRef.current) mediaRecorderRef.current.onerror = () => {
        if (session !== recordingSessionRef.current || submittedRef.current) return;
        setMicIssue("Recording stopped unexpectedly. Review any captured words, or retry your microphone. Your typed draft is still here.");
        void finishRecording();
      };
      const Ctor = getSpeechRecognitionCtor();
      if (Ctor) {
        const recognition = new Ctor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          if (preferCloudSttRef.current || session !== recordingSessionRef.current) return;
          let interim = "";
          let finalText = "";
          for (let i = 0; i < event.results.length; i++) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalText += piece;
            else interim += piece;
          }
          const next = `${finalText} ${interim}`.trim();
          setLiveCaption(next);
          transcriptRef.current = next;
        };
        recognition.onerror = (event) => {
          const code = event.error;
          if (BENIGN_STT_ERRORS.has(code)) return;
          preferCloudSttRef.current = true;
          setStatusHint("Transcribing with cloud speech—keep talking, then pause to review.");
          try {
            recognition.stop();
          } catch {
            /* ignore */
          }
        };
        recognition.onend = () => {
          /* Silence or the review button finishes the recording. */
        };
        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          preferCloudSttRef.current = true;
          setStatusHint("Using cloud speech—keep talking, then pause to review.");
        }
      } else {
        preferCloudSttRef.current = true;
        setStatusHint("Using cloud speech—keep talking, then pause to review.");
      }

      if (opts.autoSilenceSubmit) {
        startAmplitudeLoop(() => {
          void finishRecording();
        });
        noSpeechTimerRef.current = setTimeout(() => {
          if (submittedRef.current) return;
          if (!lastHeardSpeechRef.current) {
            submittedRef.current = true;
            void stopMediaRecorder();
            cleanupListening();
            changeMode("idle");
            setRecordingReady(false);
            setReviewTranscript(transcriptRef.current.trim() || previousReviewRef.current);
            setMicIssue("No voice was detected. Check your microphone input, move closer, and retry or type. Your draft has been kept.");
            setStatusHint("I didn’t hear any words. Try recording again, or type your question.");
          } else {
            // Do not cut a sentence off at the initial no-speech deadline.
            noSpeechTimerRef.current = setTimeout(() => void finishRecording(), 45000);
          }
        }, NO_SPEECH_TIMEOUT_MS);
      } else {
        startAmplitudeLoop(() => {
          /* Push-to-talk finishes on release and opens transcript review. */
        });
      }
    },
    [
      cleanupListening,
      changeMode,
      showMascotFeedback,
      startAmplitudeLoop,
      startMicStream,
      stopMediaRecorder,
      finishRecording,
    ],
  );

  const onStartListen = useCallback(() => {
    if (modeRef.current !== "idle" && modeRef.current !== "speaking") return;
    stopSpeech();
    void beginListening({ autoSilenceSubmit: true });
  }, [beginListening, stopSpeech]);

  const cancelRecording = useCallback(() => {
    recordingSessionRef.current += 1;
    submittedRef.current = true;
    void stopMediaRecorder();
    cleanupListening();
    setRecordingReady(false);
    setLiveCaption("");
    transcriptRef.current = "";
    changeMode("idle");
    setReviewTranscript(previousReviewRef.current);
    setStatusHint("Recording cancelled. Nothing was sent.");
  }, [changeMode, cleanupListening, stopMediaRecorder]);

  useEffect(() => {
    return () => {
      recordingSessionRef.current += 1;
      requestRef.current?.abort();
      interruptChat(chat.id);
      transcriptionRef.current?.abort();
      void stopMediaRecorder();
      cleanupListening();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, [cleanupListening, stopMediaRecorder, interruptChat, chat.id]);


  const showWelcome = messages.length === 0;
  const visibleMode = mode === "listening" && !recordingReady ? "idle" : mode;
  const cacteaState = resolveCacteaState(visibleMode, mascotFeedback);
  const latestPlantSummary = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index];
      if (message.role === "assistant" && !message.pending && !message.error && message.meta) return message.meta;
    }
    return null;
  }, [messages]);

  const composerDisabled = mode === "processing" || mode === "listening" || reviewingTranscript || photoBusy;
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
    const text = typedInput.trim() || (photo ? 'What can you tell me about this plant photo?' : '');
    if (!text || composerDisabled || requestBusyRef.current) return;
    followConversationRef.current = true;
    setHasNewMessages(false);
    setTypedInput("");
    setMicIssue(null);
    previousReviewRef.current = null;
    retainedRecordingRef.current = null;
    setCanRetryTranscription(false);
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

  const sendReviewedTranscript = () => {
    const text = reviewTranscript?.trim();
    if (!text || text.length > 4000 || requestBusyRef.current) return;
    setReviewTranscript(null); setEditingTranscript(false);
    previousReviewRef.current = null;
    retainedRecordingRef.current = null;
    setCanRetryTranscription(false);
    setMicIssue(null);
    setStatusHint("");
    followConversationRef.current = true;
    setHasNewMessages(false);
    void submitTranscript(text);
  };

  const confirmReminder = (message: ChatMessage, draft: { title: string; due: string }, plantId?: string) => {
    const proposal = message.reminderProposal;
    if (!proposal || proposal.status !== 'pending' || composerDisabled || !validReminderDraft(draft) || confirmedReminderIdsRef.current.has(proposal.id) || workspace.reminders.some(r => r.id === proposal.id)) return;
    confirmedReminderIdsRef.current.add(proposal.id);
    save('reminders', { id: proposal.id, title: draft.title, due: draft.due, repeat: 0, completed: false, ...(plantId && workspace.plants.some(p => p.id === plantId) ? { plantId } : {}) });
    const answer = `Your reminder is saved for ${new Date(`${draft.due}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}. You can find it in Reminders.`;
    setMessages(previous => previous.map(m => m.id === message.id ? { ...m, text: answer, spokenText: answer, reminderProposal: { ...proposal, ...draft, status: 'saved' } } : m));
    setStatusHint('Reminder saved. You can find it in Reminders.');
    if (readReadAloud()) speakText(answer, message.id);
  };
  const cancelReminder = (message: ChatMessage) => {
    const proposal = message.reminderProposal;
    if (!proposal || composerDisabled || confirmedReminderIdsRef.current.has(proposal.id) || workspace.reminders.some(r => r.id === proposal.id)) return;
    stopSpeech();
    const answer = 'Reminder cancelled. Nothing was saved.';
    setMessages(previous => previous.map(m => m.id === message.id ? { ...m, text: answer, spokenText: answer, reminderProposal: { ...proposal, status: 'cancelled' } } : m));
    setStatusHint(answer);
    if (readReadAloud()) speakText(answer, message.id);
  };
  return (
    <div className={`app-shell ${styles.shell}`}>
      <main className={styles.workspace}>
      <section className={styles.chatArea} aria-labelledby="chat-title">
        <div className="ws-greeting"><Icon name="leaf" size={34}/><div><h1 id="chat-title">Hi, I’m Cactea!</h1><p>Ask me anything about your plants. Let’s help them grow.</p></div><Cactea state={cacteaState} size="sm" className={styles.mobileMascot}/></div>
        <div className="ws-chat-toolbar">
          <select aria-label="Link conversation to a plant" value={chat.plantId ?? ''} disabled={mode !== 'idle'} onChange={e => save('chats',{...chat,plantId:e.target.value || undefined})}><option value="">General plant conversation</option>{workspace.plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <details className={styles.voiceSettings}><summary>Voice settings</summary><div><label><input type="checkbox" checked={readAloud} onChange={e => {saveReadAloud(e.target.checked); if (!e.target.checked) stopSpeech();}}/>Read replies aloud</label><Link className={styles.voicePreferencesLink} href="/settings#voice-settings-title">Choose or preview a voice →</Link></div></details>
          <details className={styles.chatMenu}><summary aria-label="Conversation options">•••</summary><div><button onClick={() => {const title = window.prompt('Conversation name',chat.title); if (title?.trim()) save('chats',{...chat,title:title.trim().slice(0,120)});}}>Rename chat</button><button onClick={() => { if (messages.length || typedInput.trim() || photo || reviewingTranscript || mode !== 'idle') newPlantDialogRef.current?.showModal(); else startNewPlantConversation(); }}>New chat</button><button onClick={() => {if (window.confirm('Delete this saved conversation?')) remove('chats',chat.id);}}>Delete chat</button></div></details>
        </div>
      <section className={`chat-scroll ${styles.scroll}`} aria-label="Chat messages" ref={chatScrollRef} onScroll={() => {
        const element = chatScrollRef.current;
        if (!element) return;
        const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        followConversationRef.current = nearBottom;
        if (nearBottom) setHasNewMessages(false);
      }}>
        {showWelcome && (
          <section className={`dashboard-welcome ${styles.welcome}`} aria-labelledby="welcome-title">
            <div className={`welcome-copy ${styles.welcomeCopy}`}>
              <p className="welcome-eyebrow">Your voice plant-care companion</p>
              <h2 id="welcome-title" className={styles.questionTitle}>What&apos;s happening with your plant?</h2>
              <p className={`welcome-description ${styles.description}`}>
                Tell me what you&apos;ve noticed. I&apos;ll listen, then help you figure out what your plant needs.
              </p>
              <details className={styles.demoGuide}><summary>Try the voice demo</summary><ol><li>Enable Read replies aloud in Voice settings and allow microphone access.</li><li>Say: “My monstera’s lower leaves are yellow. What should I check?” Pause for about a second.</li><li>Review or edit the transcript, then choose Send question.</li><li>Listen to the answer. Choose Talk to Cactea again and ask: “How do I check if the soil is too wet?”</li></ol><p>Stay in this conversation. Add a plant or reminder only if it helps carry out the advice.</p></details>
              <div className={`dashboard-preferences ${styles.starters}`}>
                <p className="starter-heading">{profile ? "Or choose a starting prompt" : "Need a prompt to get started?"}</p>
                {starterGoals.map((goal, index) => <button type="button" key={goal} disabled={composerDisabled} className={`dashboard-starter ${index === 0 ? "dashboard-starter--primary" : ""}`} onClick={() => chooseStarter(starterQuestions[goal])}><span>{index === 0 && profile && <span className={styles.starterLabel}>For you</span>}{starterQuestions[goal]}</span><span aria-hidden="true">↗</span></button>)}
                {profile && <button type="button" className="dashboard-clear" onClick={() => {
                  const cleared = savePlantProfile(null);
                  setStatusHint(cleared ? "Saved preferences cleared." : "Preferences cleared for this visit. Browser storage is unavailable.");
                }}>Clear saved preferences</button>}
              </div>
            </div>
          </section>
        )}

        <div className="conversation-log" role="log" aria-label="Conversation with Anthea" aria-live="polite" aria-relevant="additions text">
        {messages.map((m) => (
          <div key={m.id} className={`msg-row msg-row--${m.role}`}>
            {m.role === "assistant" && (
              <div className="ws-chat-avatar"><Cactea state="idle" size="sm"/></div>
            )}
            <div className="msg-col">
              <span className="sr-only">{m.role === "assistant" ? "Anthea" : "You"}:</span>
              {!m.reminderProposal && <div className={`msg-bubble msg-bubble--${m.role} ${m.error ? "msg-bubble--error" : ""}`}>
                {m.photo && <img className="ws-chat-photo" src={m.photo} alt="Plant photo shared in this conversation"/>}
                {m.pending ? (
                  <span className="typing-dots" aria-label="Thinking">
                    <span />
                    <span />
                    <span />
                  </span>
                ) : (
                  m.role === "assistant" && !m.error ? <AssistantAnswer text={m.text} brief={m.spokenText || briefSpeech(m.text)} nextStep={m.meta?.next_check} speaking={speakingMessageId === m.id} disabled={composerDisabled} onBrief={() => speakText(m.spokenText || briefSpeech(m.text), m.id)} onMore={() => speakText(m.text, m.id)} onStop={stopSpeech}/> : m.text
                )}
              </div>}
              {m.createdAt && <time className="ws-time" dateTime={new Date(m.createdAt).toISOString()}>{new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time>}
              {m.role === "assistant" && !m.pending && m.retryText && <div className="message-actions"><button type="button" disabled={composerDisabled} onClick={() => void submitTranscript(m.retryText!, m.id)}>Retry question</button></div>}
              {m.reminderProposal && <ReminderProposalCard proposal={m.reminderProposal} savedReminder={workspace.reminders.find(r => r.id === m.reminderProposal?.id)} plants={workspace.plants} initialPlantId={chat.plantId} disabled={composerDisabled} onConfirm={(draft, plantId) => confirmReminder(m, draft, plantId)} onCancel={() => cancelReminder(m)} />}
              {m.meta && !m.pending && (
                <span className={styles.messageSource}>{m.meta.is_estimate ? "Estimated guidance" : "AI plant-care guidance"}</span>
              )}
            </div>
          </div>
        ))}
        </div>

        <div ref={scrollEndRef} />
      </section>

      <div className={styles.inputDock}>
      {hasNewMessages && <button type="button" className="new-response" onClick={scrollToLatest}>New response ↓</button>}
      <section className={styles.voiceDock} aria-label="Voice conversation">
        <div className={styles.voiceStatus} role="status"><strong>{mode === "listening" && recordingReady ? "Listening — pause when finished" : voiceHeading(mode, recordingReady, reviewingTranscript, transcribing, playbackPending)}</strong><span>{mode === "listening" ? recordingReady ? "Your microphone is on." : "Allow Microphone in the browser prompt." : mode === "speaking" ? "Stop audio or talk again to ask a follow-up." : reviewingTranscript ? "Check your words before sending." : mode === "processing" || playbackPending ? "Your question stays in this conversation." : !micSupported ? "Microphone unavailable. Type your question below." : micIssue ? "Your draft is kept. Choose a recovery option below." : statusHint || (readAloud ? "Ask a plant question aloud." : "Enable spoken replies in Voice settings.")}</span></div>
        {micSupported && !reviewingTranscript && <button type="button" className={styles.voiceStart} disabled={mode === "processing" || photoBusy || (mode === "listening" && !recordingReady)} onClick={() => mode === "listening" ? void finishRecording() : onStartListen()}>
          <span className={styles.voiceIcon}><Icon name="microphone" size={24}/></span><span className={styles.voiceCopy}><strong>{mode === "listening" ? recordingReady ? "Review recording" : "Allow microphone…" : mode === "processing" ? "Please wait…" : messages.length ? "Talk to Cactea again" : "Talk to Cactea"}</strong></span>
        </button>}
        {(mode === "listening" || speakingMessageId) && <div className={styles.voiceSecondary}>
          {mode === "listening" && <button type="button" onClick={cancelRecording}>Cancel recording</button>}
          {speakingMessageId && <button type="button" onClick={stopSpeech}>Stop audio</button>}
        </div>}
        {mode === "listening" && recordingReady && liveCaption && <p className={styles.liveCaption}><span>Hearing</span>{liveCaption}</p>}
      </section>
      {(micIssue || canRetryTranscription) && <section className={styles.micRecovery} aria-label="Voice recovery"><p role="alert">{micIssue || "Your recording has been kept for another transcription attempt. Any captured words are available to edit."}</p><div>
        {canRetryTranscription && <button type="button" disabled={mode !== "idle"} onClick={() => { previousReviewRef.current = reviewTranscript; submittedRef.current = false; void finishRecording(); }}>Retry transcription</button>}
        {micSupported && <button type="button" disabled={mode !== "idle"} onClick={() => { previousReviewRef.current = reviewTranscript; setReviewTranscript(null); setEditingTranscript(false); onStartListen(); }}>Retry microphone</button>}
        <button type="button" disabled={mode !== "idle"} onClick={() => { setMicIssue(null); setEditingTranscript(true); setStatusHint("Type or edit your question below. Your draft has been kept."); requestAnimationFrame(() => reviewingTranscript ? transcriptReviewRef.current?.focus() : textareaRef.current?.focus()); }}>Type instead</button>
      </div></section>}

      {reviewingTranscript ? <section ref={transcriptCardRef} tabIndex={-1} className={styles.transcriptReview} aria-labelledby="transcript-review-title">
        <div className={styles.reviewHeading}><h2 id="transcript-review-title">What I heard</h2>{editingTranscript && <span>{reviewTranscript.length.toLocaleString()} / 4,000</span>}</div>
        {editingTranscript ? <><label className="sr-only" htmlFor="transcript-review">Edit your recorded question</label>
        <textarea id="transcript-review" ref={transcriptReviewRef} value={reviewTranscript} disabled={mode !== "idle"} onChange={(event) => setReviewTranscript(event.target.value)} maxLength={4000} rows={2} /></> : <p className={styles.heardTranscript}>{reviewTranscript || "No words captured. Edit your question or record again."}</p>}
        {reviewTranscript.length > 4000 && <p className={styles.reviewLimit}>Please shorten your question to 4,000 characters before sending.</p>}
        <div className={styles.reviewActions}>
          <button type="button" aria-expanded={editingTranscript} disabled={mode !== "idle"} onClick={() => setEditingTranscript(value => !value)}>{editingTranscript ? "Done editing" : "Edit"}</button>
          <button type="button" disabled={mode !== "idle"} onClick={() => { previousReviewRef.current = null; retainedRecordingRef.current = null; setCanRetryTranscription(false); setMicIssue(null); setReviewTranscript(null); setEditingTranscript(false); setLiveCaption(""); transcriptRef.current = ""; setStatusHint("Transcript discarded. Nothing was sent."); requestAnimationFrame(() => textareaRef.current?.focus()); }}>Discard</button>
          <button type="button" disabled={mode !== "idle"} onClick={() => { previousReviewRef.current = reviewTranscript; setReviewTranscript(null); setEditingTranscript(false); onStartListen(); }}>Record again</button>
          <button type="button" className={styles.sendTranscript} disabled={mode !== "idle" || !reviewTranscript.trim() || reviewTranscript.length > 4000} onClick={sendReviewedTranscript}>Send question →</button>
        </div>
      </section> : <>

      {photo && <div className="ws-attachment"><img src={photo} alt="Photo ready to send"/><span>Photo attached · sent with your question</span><button type="button" onClick={() => setPhoto(undefined)} aria-label="Remove attached photo">×</button></div>}
      <form
        className={`composer ${styles.composer}`}
        onSubmit={(e) => {
          e.preventDefault();
          sendTypedQuestion();
        }}
      >
        <button type="button" className="ws-attach" aria-label="Attach a plant photo" disabled={composerDisabled} onClick={() => photoInputRef.current?.click()}><Icon name="photo"/></button>
        <input className="sr-only" ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={async e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setPhotoBusy(true); setStatusHint('Preparing photo…'); try {setPhoto(await preparePhoto(file)); setStatusHint('Photo ready. Add a question or send it as it is.');} catch (error) {setStatusHint((error as Error).message);} finally {setPhotoBusy(false);} }}/>
        <textarea
          ref={textareaRef}
          className="composer-input"
          aria-label="Your plant question"
          rows={1}
          maxLength={4000}
          value={typedInput}
          onChange={(e) => setTypedInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              sendTypedQuestion();
            }
          }}
          placeholder="Describe your plant, or use the microphone…"
          disabled={mode === "listening"}
        />
        <button
          type="submit"
          className="composer-send"
          disabled={(!typedInput.trim() && !photo) || composerDisabled}
          aria-label="Send"
        >
          →
        </button>
      </form>
      <p className={styles.composerHelp}>{typedInput.length >= 3500 ? `${typedInput.length.toLocaleString()} / 4,000 characters · ` : ""}Enter to send · Shift + Enter for a new line</p>
      </>}
      </div>
      </section>
      <CompanionPanel mode={visibleMode} state={cacteaState} transcribing={transcribing} summary={latestPlantSummary} conversationNumber={conversationNumber} onAskNext={() => chooseStarter("What should I check next for this plant?")} actionsDisabled={composerDisabled} />
      </main>
      <dialog ref={newPlantDialogRef} className={styles.resetDialog} aria-labelledby="new-plant-title" aria-describedby="new-plant-description">
        <h2 id="new-plant-title">Start a new plant conversation?</h2>
        <p id="new-plant-description">This conversation will stay in Recent chats. Any unsent draft or recording will be discarded.</p>
        <div className={styles.dialogActions}><form method="dialog"><button type="submit">Keep this conversation</button></form><button type="button" className={styles.sendTranscript} onClick={startNewPlantConversation}>Start fresh</button></div>
      </dialog>
    </div>
  );
}
