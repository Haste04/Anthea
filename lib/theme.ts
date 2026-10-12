export type Theme = 'light' | 'dark';

const KEY = 'anthea.theme.v1';
const EVENT = 'anthea-theme-change';
const normalizeTheme = (value: unknown): Theme => value === 'dark' ? 'dark' : 'light';

// Runs in the document head before React or page content can paint.
export const THEME_INIT_SCRIPT = `(()=>{let theme='light';try{if(window.localStorage.getItem('${KEY}')==='dark')theme='dark'}catch{}document.documentElement.dataset.theme=theme})()`;

export function readTheme(): Theme {
  return normalizeTheme(document.documentElement.dataset.theme);
}

export function saveTheme(theme: Theme): boolean {
  document.documentElement.dataset.theme = theme;
  let saved = true;
  try { window.localStorage.setItem(KEY, theme); }
  catch { saved = false; }
  window.dispatchEvent(new Event(EVENT));
  return saved;
}

export function subscribeTheme(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    document.documentElement.dataset.theme = normalizeTheme(event.newValue);
    callback();
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
