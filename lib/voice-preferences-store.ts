'use client';
import { useSyncExternalStore } from 'react';

const KEY = 'anthea.voice-choice.v1';
const EVENT = 'anthea-voice-choice-change';
let temporaryVoice = '';
let storageUnavailable = false;

export function readVoiceChoice(): string {
  if (storageUnavailable) return temporaryVoice;
  try { return window.localStorage.getItem(KEY) || ''; }
  catch { return temporaryVoice; }
}
export function saveVoiceChoice(voiceURI: string): boolean {
  temporaryVoice = voiceURI;
  try { window.localStorage.setItem(KEY, voiceURI); storageUnavailable = false; }
  catch { storageUnavailable = true; }
  window.dispatchEvent(new Event(EVENT));
  return !storageUnavailable;
}
function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
}
export function useVoiceChoice() { return useSyncExternalStore(subscribe, readVoiceChoice, () => ''); }

type DeviceVoice = { voiceURI: string; name: string; lang: string; default: boolean };
function voicesSnapshot(): string {
  return JSON.stringify(window.speechSynthesis?.getVoices().map(v => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, default: v.default })) ?? []);
}
function subscribeVoices(callback: () => void) {
  window.speechSynthesis?.addEventListener('voiceschanged', callback);
  return () => window.speechSynthesis?.removeEventListener('voiceschanged', callback);
}
export function useDeviceVoices(): DeviceVoice[] {
  return JSON.parse(useSyncExternalStore(subscribeVoices, voicesSnapshot, () => '[]'));
}
