"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readVoiceChoice } from '@/lib/voice-preferences-store';
import { configureSpeechVoice } from '@/lib/speech-voice';

export default function useSpeechPlayback(onStart: () => void, onFinish: () => void, onError: () => void) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbackPending, setPlaybackPending] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    setPlaybackPending(false);
    const utterance = utteranceRef.current;
    if (utterance) {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
    }
    utteranceRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeakingMessageId(null);
    onFinish();
  }, [onFinish]);

  const speak = useCallback((text: string, id: string) => {
    stop();
    if (!window.speechSynthesis) { onError(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    configureSpeechVoice(utterance, window.speechSynthesis.getVoices(), readVoiceChoice());
    utteranceRef.current = utterance;
    const finish = () => {
      if (utteranceRef.current !== utterance) return;
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      setPlaybackPending(false);
      utteranceRef.current = null;
      setSpeakingMessageId(null);
      onFinish();
    };
    utterance.onstart = () => {
      if (utteranceRef.current !== utterance) return;
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      setPlaybackPending(false);
      onStart();
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      finish();
      if (event.error !== "canceled" && event.error !== "interrupted") onError();
    };
    setSpeakingMessageId(id);
    setPlaybackPending(true);
    startTimerRef.current = setTimeout(() => {
      if (utteranceRef.current !== utterance) return;
      stop();
      onError();
    }, 10000);
    try { window.speechSynthesis.speak(utterance); }
    catch { finish(); onError(); }
  }, [onError, onFinish, onStart, stop]);

  useEffect(() => () => {
    if (startTimerRef.current) clearTimeout(startTimerRef.current);
    if (utteranceRef.current) {
      utteranceRef.current.onstart = null;
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
      window.speechSynthesis?.cancel();
    }
  }, []);

  return { speak, stop, speakingMessageId, playbackPending };
}
