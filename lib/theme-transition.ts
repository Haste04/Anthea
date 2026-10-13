let activeTransition: ViewTransition | undefined;
let latestRequest = 0;

/** Animate only explicit theme selections; loading and cross-tab sync stay instant. */
export async function runThemeTransition(update: () => void, origin: HTMLElement): Promise<void> {
  const request = ++latestRequest;
  const previous = activeTransition;
  if (previous) {
    previous.skipTransition();
    await previous.updateCallbackDone.catch(() => {});
    if (request !== latestRequest) return;
  }

  const root = document.documentElement;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!document.startViewTransition || !root.animate || motion.matches || document.visibilityState === 'hidden') {
    delete root.dataset.themeTransition;
    activeTransition = undefined;
    update();
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  let updated = false;
  let transition: ViewTransition | undefined;
  const apply = () => {
    if (updated || request !== latestRequest) return;
    updated = true;
    update();
  };
  const stopForReducedMotion = () => { if (motion.matches) transition?.skipTransition(); };
  root.dataset.themeTransition = 'true';

  try {
    transition = document.startViewTransition(apply);
    activeTransition = transition;
    // Observe completion even if a skipped snapshot rejects `ready` first.
    const finished = transition.finished.catch(() => {});
    motion.addEventListener('change', stopForReducedMotion);
    await transition.ready;
    if (request !== latestRequest) return;
    root.animate({
      clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
    }, {
      duration: 450,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      pseudoElement: '::view-transition-new(root)',
    });
    await finished;
  } catch {
    // Snapshot failures or partial API support must never block the selection.
    transition?.skipTransition();
    apply();
  } finally {
    motion.removeEventListener('change', stopForReducedMotion);
    if (request === latestRequest) {
      delete root.dataset.themeTransition;
      activeTransition = undefined;
    }
  }
}
