"use client";

import { useSyncExternalStore } from "react";

const KEY = "anthea.sidebar-visible.v1";
const EVENT = "anthea-sidebar-change";
let temporaryVisible = true;
let storageUnavailable = false;

function snapshot(): boolean {
  if (storageUnavailable) return temporaryVisible;
  try { return window.localStorage.getItem(KEY) !== "false"; }
  catch { return temporaryVisible; }
}

function subscribe(onChange: () => void) {
  function storageChanged(event: StorageEvent) {
    if (event.key === KEY || event.key === null) onChange();
  }
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", storageChanged);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", storageChanged);
  };
}

function toggleSidebar() {
  temporaryVisible = !snapshot();
  try {
    window.localStorage.setItem(KEY, String(temporaryVisible));
    storageUnavailable = false;
  } catch { storageUnavailable = true; }
  window.dispatchEvent(new Event(EVENT));
}

export default function useSidebarVisibility() {
  const sidebarVisible = useSyncExternalStore(subscribe, snapshot, () => true);
  return { sidebarVisible, toggleSidebar };
}
