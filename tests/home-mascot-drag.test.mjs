import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name, context) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../app/home/${name}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, ...context });
  return exports;
}

function harness({ reduced = false, supported = true, artwork = false, transforms = false } = {}) {
  let now = 0;
  let nextFrame = 0;
  let open = false;
  let artworkGrowth = 0;
  const frames = new Map();
  const timers = new Map();
  const captures = new Set();
  const media = Object.assign(new EventTarget(), { matches: reduced });
  const document = Object.assign(new EventTarget(), { hidden: false });
  const window = Object.assign(new EventTarget(), {
    innerWidth: 1440, innerHeight: 1000, matchMedia: () => media,
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => { timers.set(++nextFrame, { callback, at: now + delay }); return nextFrame; },
    clearTimeout: id => timers.delete(id),
  });
  const home = { left: 800, top: 150, width: 500, height: 500 };
  const style = () => ({ removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())]; } });
  const anchor = { style: style(), offsetWidth: 500, offsetHeight: 500, getBoundingClientRect: () => ({ ...home }) };
  const button = Object.assign(new EventTarget(), {
    querySelectorAll: () => artwork ? [{ getBoundingClientRect: () => {
      const rect = actor.getBoundingClientRect();
      if (transforms) {
        const scale = actor.style.transform?.match(/scale\(([^,]+), ([^)]+)\)/);
        const angle = parseFloat(actor.style.transform?.match(/rotate\(([^)]+)deg\)/)?.[1] || '0') * Math.PI / 180;
        const sx = scale ? Number(scale[1]) : 1, sy = scale ? Number(scale[2]) : 1;
        const points = [-rect.width / 2, rect.width / 2].flatMap(x => [-rect.height / 2, rect.height / 2 + artworkGrowth].map(y => ({
          x: rect.left + rect.width / 2 + x * sx * Math.cos(angle) - y * sy * Math.sin(angle),
          y: rect.top + rect.height / 2 + x * sx * Math.sin(angle) + y * sy * Math.cos(angle),
        })));
        const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
        const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y));
        return { left, right, top, bottom, width: right - left, height: bottom - top };
      }
      return { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height + artworkGrowth, height: rect.height + artworkGrowth };
    } }] : [],
    contains: () => true,
    hasPointerCapture: id => captures.has(id),
    setPointerCapture: id => captures.add(id),
    releasePointerCapture: id => captures.delete(id),
  });
  const actor = Object.assign(new EventTarget(), {
    style: style(), dataset: {}, attributes: new Map(),
    querySelector: () => button,
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); },
    showPopover: supported ? () => { open = true; } : undefined,
    hidePopover: () => { open = false; },
    getBoundingClientRect: () => open ? { ...home, left: parseFloat(actor.style.left), top: parseFloat(actor.style.top) } : { ...home },
  });
  const physics = load('homeMascotPhysics', {});
  const attach = load('attachHomeMascotDrag', { window, document, Event, performance: { now: () => now }, require: () => physics }).default;
  const cleanup = attach(anchor, actor);
  const event = (target, type, values = {}) => {
    const e = new Event(type, { cancelable: true });
    Object.entries(values).forEach(([name, value]) => Object.defineProperty(e, name, { value }));
    target.dispatchEvent(e);
    return e;
  };
  const pointer = (type, x, y, props = {}) => event(actor, type, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, timeStamp: now, ...props });
  const advance = (milliseconds = 16) => {
    now += milliseconds;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(callback => callback(now));
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  };
  const drag = () => {
    pointer('pointerdown', 1050, 400);
    advance(); pointer('pointermove', 700, 350);
    advance(); pointer('pointermove', 760, 350);
  };
  const until = state => { for (let i = 0; i < 1000 && actor.dataset.homeMascotMotion !== state; i++) advance(); assert.equal(actor.dataset.homeMascotMotion, state); };
  return { actor, anchor, home, window, document, media, captures, frames, timers, pointer, advance, drag, cleanup, until,
    open: () => open, click: (detail = 1) => event(actor, 'click', { detail }),
    event, position: () => actor.getBoundingClientRect(),
    growArtwork: pixels => { artworkGrowth = pixels; },
  };
}

test('ordinary clicks keep the mascot in place and remain available to its existing handler', () => {
  const h = harness();
  h.pointer('pointerdown', 1000, 400);
  h.pointer('pointermove', 1003, 401);
  h.pointer('pointerup', 1003, 401);
  assert.equal(h.open(), false);
  assert.equal(h.click().defaultPrevented, false);
  assert.equal(h.captures.size, 0);
  h.cleanup();
});

test('drag reserves layout, throws with velocity, suppresses only the pointer click, and returns', () => {
  const h = harness(); h.drag();
  assert.equal(h.open(), true);
  assert.equal(h.anchor.style.aspectRatio, '500 / 500');
  const releaseX = h.position().left;
  h.pointer('pointerup', 760, 350);
  assert.equal(h.captures.size, 0);
  assert.equal(h.actor.dataset.homeMascotMotion, 'thrown');
  assert.equal(h.click(0).defaultPrevented, false, 'keyboard clicks must remain available');
  assert.equal(h.click().defaultPrevented, true);
  // The latest samples include a fast rightward move; the spring still returns home.
  h.advance();
  assert.ok(Number.isFinite(h.position().left));
  assert.notEqual(h.position().left, releaseX);
  for (let i = 0; i < 1000; i++) h.advance();
  assert.equal(h.open(), false);
  assert.equal(h.frames.size, 0);
  assert.equal(h.anchor.style.aspectRatio, undefined);
  assert.equal(h.actor.attributes.has('popover'), false);
  h.cleanup();
});

test('return follows the current hero anchor after scrolling or resizing', () => {
  const h = harness(); h.drag(); h.pointer('pointerup', 760, 350);
  h.home.top = -700; h.home.left = 600; h.home.width = 400;
  for (let i = 0; i < 1000; i++) h.advance();
  assert.equal(h.open(), false);
  assert.equal(h.position().top, -700);
  assert.equal(h.actor.style.width, undefined);
  h.cleanup();
});

test('a returning mascot can be grabbed again without changing position', () => {
  const h = harness(); h.drag(); h.pointer('pointerup', 760, 350); h.advance();
  h.until('returning');
  const before = h.position();
  h.pointer('pointerdown', before.left + 250, before.top + 250);
  h.advance(100);
  assert.equal(h.position().left, before.left);
  assert.equal(h.actor.dataset.homeMascotMotion, 'dragging');
  h.pointer('pointermove', 10, 10, { pointerId: 2 });
  assert.equal(h.position().left, before.left, 'other fingers must be ignored');
  h.pointer('pointercancel', 0, 0);
  for (let i = 0; i < 400; i++) h.advance();
  assert.equal(h.open(), false);
  h.cleanup();
});

test('reduced motion allows dragging and a one-second rest without free flight or elastic motion', () => {
  const h = harness({ reduced: true }); h.drag();
  assert.equal(h.open(), true);
  h.pointer('pointerup', 760, 350);
  assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(999); assert.equal(h.open(), true);
  h.advance(1);
  assert.equal(h.open(), false);
  assert.equal(h.frames.size, 0);
  h.cleanup();
});

test('cancellation, lost capture, Escape and blur return without stranding an overlay', () => {
  for (const interruption of ['pointercancel', 'lostpointercapture', 'Escape', 'blur']) {
    const h = harness(); h.drag();
    if (interruption === 'Escape') h.event(h.window, 'keydown', { key: 'Escape' });
    else if (interruption === 'blur') h.event(h.window, 'blur');
    else h.pointer(interruption, 760, 350);
    for (let i = 0; i < 400; i++) h.advance();
    assert.equal(h.open(), false, interruption);
    assert.equal(h.captures.size, 0);
    h.cleanup();
  }
});

test('hidden tabs, preference changes, and unmount restore all styles and remove callbacks', () => {
  for (const interruption of ['hidden', 'reduced', 'unmount']) {
    const h = harness(); h.drag(); h.pointer('pointerup', 760, 350);
    const late = [...h.frames.values()][0];
    if (interruption === 'hidden') { h.document.hidden = true; h.event(h.document, 'visibilitychange'); }
    else if (interruption === 'reduced') { h.media.matches = true; h.event(h.media, 'change'); }
    else h.cleanup();
    late(100);
    assert.equal(h.open(), false, interruption);
    assert.equal(h.frames.size, 0);
    assert.equal(h.anchor.style.aspectRatio, undefined);
    h.cleanup();
    h.pointer('pointerdown', 1000, 400); h.pointer('pointermove', 400, 400);
    assert.equal(h.open(), false, 'cleanup must remove pointer handlers');
  }
});

test('unsupported browsers retain all original click interactions', () => {
  const h = harness({ supported: false }); h.drag();
  assert.equal(h.actor.dataset.homeMascotDraggable, undefined);
  assert.equal(h.click().defaultPrevented, false);
  h.cleanup();
});

test('resizing while held resizes Cactea and keeps it inside the new viewport', () => {
  const h = harness();
  h.pointer('pointerdown', 1050, 400); h.pointer('pointermove', 1080, 400);
  h.window.innerWidth = 390; h.window.innerHeight = 500;
  h.home.width = 340; h.home.height = 340;
  h.event(h.window, 'resize');
  const position = h.position();
  assert.ok(position.left >= 0 && position.left + position.width <= 390);
  assert.ok(position.top >= 0 && position.top + position.height <= 500);
  assert.equal(h.actor.style.width, '340px');
  assert.equal(h.actor.dataset.homeMascotMotion, 'dragging');
  h.cleanup();
});

test('one-second countdown starts only after settling, with stationary physics while waiting', () => {
  const h = harness(); h.drag(); h.pointer('pointerup', 760, 350);
  assert.equal(h.actor.dataset.homeMascotMotion, 'thrown');
  assert.equal(h.timers.size, 0);
  h.advance(1000);
  assert.equal(h.timers.size, 0, 'elapsed time since release must not start the timer');
  h.until('settled');
  const position = h.position();
  assert.equal(h.frames.size, 1, 'one loop monitors live artwork without advancing flight');
  assert.equal(h.timers.size, 1);
  h.advance(999);
  assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  assert.equal(h.position().left, position.left);
  h.advance(1);
  assert.equal(h.actor.dataset.homeMascotMotion, 'returning');
  assert.equal(h.timers.size, 0);
  h.cleanup();
});

test('re-grabbing thrown, settled, or returning cancels all previous work without a position jump', () => {
  for (const state of ['thrown', 'settled', 'returning']) {
    const h = harness(); h.drag(); h.pointer('pointerup', 760, 350); h.until(state);
    const oldFrame = [...h.frames.values()][0];
    const oldTimer = [...h.timers.values()][0]?.callback;
    const before = h.position();
    h.pointer('pointerdown', before.left + 250, before.top + 250);
    assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
    oldFrame?.(99999); oldTimer?.();
    h.advance(1100);
    assert.equal(h.actor.dataset.homeMascotMotion, 'dragging');
    assert.equal(h.position().left, before.left);
    assert.equal(h.position().top, before.top);
    h.pointer('pointermove', 400, 300); h.pointer('pointerup', 400, 300);
    assert.equal(h.actor.dataset.homeMascotMotion, 'thrown');
    assert.equal(h.frames.size, 1);
    h.cleanup();
    assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
  }
});

test('cleanup and hiding a settled mascot cancel its pending return and stale timer', () => {
  for (const action of ['cleanup', 'hidden', 'reduced']) {
    const h = harness(); h.drag(); h.pointer('pointerup', 760, 350); h.until('settled');
    const late = [...h.timers.values()][0].callback;
    if (action === 'cleanup') h.cleanup();
    if (action === 'hidden') { h.document.hidden = true; h.event(h.document, 'visibilitychange'); }
    if (action === 'reduced') { h.media.matches = true; h.event(h.media, 'change'); }
    late();
    assert.equal(h.open(), false); assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 0);
    h.cleanup();
  }
});

test('resizing during flight contains the mascot; moving the floor after settling restarts physics and the delay', () => {
  const h = harness(); h.drag(); h.pointer('pointerup', 760, 350); h.advance();
  h.window.innerWidth = 390; h.window.innerHeight = 500;
  h.home.width = 340; h.home.height = 340;
  h.event(h.window, 'resize');
  assert.ok(h.position().left >= 8 && h.position().left + h.position().width <= 382);
  assert.ok(h.position().top >= 8 && h.position().top + h.position().height <= 492);
  h.until('settled');
  const late = [...h.timers.values()][0].callback;
  h.window.innerHeight = 900; h.event(h.window, 'resize');
  assert.equal(h.actor.dataset.homeMascotMotion, 'thrown');
  assert.equal(h.timers.size, 0);
  late(); assert.equal(h.actor.dataset.homeMascotMotion, 'thrown');
  h.until('settled');
  assert.equal(h.frames.size, 1); assert.equal(h.timers.size, 1);
  h.advance(999); assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(1); assert.equal(h.actor.dataset.homeMascotMotion, 'returning');
  h.cleanup();
});

test('settled artwork stays in bounds as existing animations change its visible dimensions', () => {
  const h = harness({ artwork: true }); h.drag(); h.pointer('pointerup', 760, 350); h.until('settled');
  h.growArtwork(30); h.advance();
  assert.ok(h.position().top + h.position().height + 30 <= 992);
  assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(983); assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(1); assert.equal(h.actor.dataset.homeMascotMotion, 'returning');
  h.cleanup();
});

test('an unchanged resize preserves the settled inactivity deadline', () => {
  const h = harness(); h.drag(); h.pointer('pointerup', 760, 350); h.until('settled');
  h.advance(999); h.event(h.window, 'resize');
  assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(1); assert.equal(h.actor.dataset.homeMascotMotion, 'returning');
  h.cleanup();
});

test('temporary artwork expansion restores its resting position and keeps the deadline on an unchanged resize', () => {
  const h = harness({ artwork: true }); h.drag(); h.pointer('pointerup', 760, 350); h.until('settled');
  const resting = h.position();
  h.growArtwork(30); h.advance();
  assert.ok(h.position().top < resting.top);
  h.growArtwork(0); h.advance();
  assert.ok(Math.abs(h.position().top - resting.top) < .001, 'temporary animation containment must not accumulate a permanent offset');
  h.advance(967); h.event(h.window, 'resize');
  assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(1); assert.equal(h.actor.dataset.homeMascotMotion, 'returning');
  h.cleanup();
});

test('a keyboard jump counts as new interaction and renews the inactivity delay', () => {
  const h = harness(); h.drag(); h.pointer('pointerup', 760, 350); h.click(); h.until('settled');
  h.advance(999); assert.equal(h.click(0).defaultPrevented, false);
  h.advance(999); assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
  h.advance(1); assert.equal(h.actor.dataset.homeMascotMotion, 'returning');
  h.cleanup();
});

test('keyboard renewal and supported resize never make an animation correction the new resting baseline', () => {
  for (const action of ['keyboard', 'resize']) {
    const h = harness({ artwork: true }); h.drag(); h.pointer('pointerup', 760, 350); h.click(); h.until('settled');
    const resting = h.position();
    h.growArtwork(30); h.advance();
    if (action === 'keyboard') h.click(0);
    else { h.window.innerWidth -= 10; h.event(h.window, 'resize'); }
    h.growArtwork(0); h.advance();
    assert.equal(h.actor.dataset.homeMascotMotion, 'settled');
    assert.ok(Math.abs(h.position().top - resting.top) < .001, action);
    h.cleanup();
  }
});

test('resting bounds retain their own scale through artwork fitting and repeated viewport changes', () => {
  const h = harness({ artwork: true, transforms: true });
  h.window.innerWidth = 740; h.window.innerHeight = 360;
  h.drag(); h.pointer('pointerup', 760, 350); h.until('settled');
  h.growArtwork(30); h.advance(); h.growArtwork(0); h.advance();
  h.window.innerWidth = 730; h.event(h.window, 'resize'); h.advance();
  h.window.innerHeight = 380; h.event(h.window, 'resize'); h.advance();
  const rect = h.actor.querySelector('button').querySelectorAll()[0].getBoundingClientRect();
  assert.ok(h.actor.dataset.homeMascotMotion !== 'settled' || 372 - rect.bottom <= 6,
    'a settled mascot must not float above the changed floor because its saved collision box used the wrong fit');
  h.cleanup();
});
