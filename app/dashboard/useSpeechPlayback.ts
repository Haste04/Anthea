"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function useSpeechPlayback(onStart: () => void, onFinish: () => void, onError: () => void) {
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const stop = useCallback(() => {
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
    utteranceRef.current = utterance;
    const finish = () => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      setSpeakingMessageId(null);
      onFinish();
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      finish();
      if (event.error !== "canceled" && event.error !== "interrupted") onError();
    };
    setSpeakingMessageId(id);
    onStart();
    try { window.speechSynthesis.speak(utterance); }
    catch { finish(); onError(); }
  }, [onError, onFinish, onStart, stop]);

  useEffect(() => () => {
    if (utteranceRef.current) {
      utteranceRef.current.onstart = null;
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
      window.speechSynthesis?.cancel();
    }
  }, []);

  return { speak, stop, speakingMessageId };
}
