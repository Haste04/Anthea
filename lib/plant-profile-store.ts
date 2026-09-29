"use client";

import { useSyncExternalStore } from "react";
import { parsePlantProfile, type PlantProfile } from "./plant-profile";

const KEY = "anthea.plant-profile.v1";
const EVENT = "anthea-profile-change";
let temporaryProfile: string | null = null;
let storageUnavailable = false;

function snapshot(): string | null {
  if (storageUnavailable) return temporaryProfile;
  try { return window.localStorage.getItem(KEY); }
  catch { return temporaryProfile; }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function decode(raw: string | null): PlantProfile | null {
  try { return raw ? parsePlantProfile(JSON.parse(raw)) : null; }
  catch { return null; }
}

export function readPlantProfile() { return decode(snapshot()); }

export function savePlantProfile(profile: PlantProfile | null): boolean {
  temporaryProfile = profile ? JSON.stringify(profile) : null;
  try {
    if (temporaryProfile) window.localStorage.setItem(KEY, temporaryProfile);
    else window.localStorage.removeItem(KEY);
    storageUnavailable = false;
  } catch { storageUnavailable = true; }
  window.dispatchEvent(new Event(EVENT));
  return !storageUnavailable;
}

export function usePlantProfile() {
  return decode(useSyncExternalStore(subscribe, snapshot, () => null));
}

const VOICE_KEY = "anthea.read-aloud.v1";
let temporaryReadAloud = true;
let voiceStorageUnavailable = false;

export function readReadAloud(): boolean {
  if (voiceStorageUnavailable) return temporaryReadAloud;
  try { return window.localStorage.getItem(VOICE_KEY) !== "false"; }
  catch { return temporaryReadAloud; }
}

export function saveReadAloud(enabled: boolean) {
  temporaryReadAloud = enabled;
  try {
    window.localStorage.setItem(VOICE_KEY, String(enabled));
    voiceStorageUnavailable = false;
  } catch { voiceStorageUnavailable = true; }
  window.dispatchEvent(new Event(EVENT));
}

export function useReadAloud() {
  return useSyncExternalStore(subscribe, readReadAloud, () => true);
}
