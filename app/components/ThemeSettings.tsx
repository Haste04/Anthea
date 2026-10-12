'use client';

import { useState, useSyncExternalStore } from 'react';
import { readTheme, saveTheme, subscribeTheme, type Theme } from '@/lib/theme';

const serverTheme = () => 'light' as const;
function useTheme() {
  return useSyncExternalStore(subscribeTheme, readTheme, serverTheme);
}

// Keep open pages in sync when the preference changes in another tab.
export function ThemeSync() {
  useTheme();
  return null;
}

export default function ThemeSettings() {
  const theme = useTheme();
  const [notice, setNotice] = useState('');
  function choose(next: Theme) {
    const saved = saveTheme(next);
    setNotice(saved ? `${next === 'dark' ? 'Dark' : 'Light'} mode saved.` : 'Theme applies for this visit; browser storage is unavailable.');
  }
  return (
    <section className="ws-panel ws-appearance" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Appearance</h2>
      <p>Choose a look that feels comfortable for you.</p>
      <div className="ws-theme-options" role="group" aria-label="Color theme">
        <button type="button" aria-pressed={theme === 'light'} onClick={() => choose('light')}>
          <span aria-hidden="true">☀</span> Light
        </button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => choose('dark')}>
          <span aria-hidden="true">☾</span> Dark
        </button>
      </div>
      <p className="ws-theme-notice" role="status">{notice}</p>
    </section>
  );
}
