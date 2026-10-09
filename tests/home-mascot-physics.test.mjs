import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = new URL('../app/home/homeMascotPhysics.ts', import.meta.url);
const exports = {};
if (fs.existsSync(file)) vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports, Math });

test('release keeps recent pointer velocity but discards a paused gesture', () => {
  assert.equal(typeof exports.releaseVelocity, 'function');
  const samples = [{ x: 0, y: 0, time: 0 }, { x: 40, y: -20, time: 40 }, { x: 80, y: -40, time: 80 }];
  const velocity = exports.releaseVelocity(samples, 90);
  assert.equal(velocity.x, 1000);
  assert.equal(velocity.y, -500);
  assert.equal(exports.releaseVelocity(samples, 250).x, 0);
  assert.ok(Math.abs(exports.releaseVelocity([{ x: 0, y: 0, time: 0 }, { x: 9999, y: 0, time: 1 }], 1).x) <= 2400);
});

test('a toss first carries forward, then settles at the hero anchor', () => {
  assert.equal(typeof exports.stepSpring, 'function');
  let body = { x: 300, y: 200, vx: 1800, vy: -200 };
  const target = { x: 100, y: 100 };
  const first = exports.stepSpring(body, target, 1 / 120);
  assert.ok(first.x > body.x, 'release velocity must visibly carry the mascot forward');
  body = first;
  for (let i = 0; i < 720; i++) body = exports.stepSpring(body, target, 1 / 120);
  assert.ok(Math.hypot(body.x - target.x, body.y - target.y) < 0.1);
  assert.ok(Math.hypot(body.vx, body.vy) < 0.1);
});

test('a quick direction reversal throws in the direction of the final flick', () => {
  const velocity = exports.releaseVelocity([
    { x: 400, y: 0, time: 0 },
    { x: 0, y: 0, time: 40 },
    { x: 60, y: 0, time: 60 },
    { x: 120, y: 0, time: 80 },
  ], 80);
  assert.ok(velocity.x > 0, 'the initial drag must not reverse the final throw');
});

test('spring follows a changed home position and remains stable after a delayed frame', () => {
  assert.equal(typeof exports.stepSpring, 'function');
  let body = { x: 300, y: 200, vx: 2400, vy: -2400 };
  body = exports.stepSpring(body, { x: 100, y: 100 }, 10);
  assert.ok(Object.values(body).every(Number.isFinite));
  for (let i = 0; i < 720; i++) body = exports.stepSpring(body, { x: 450, y: -200 }, 1 / 120);
  assert.ok(Math.hypot(body.x - 450, body.y + 200) < 0.1);
});

test('viewport bounds contain dragging even when the mascot is larger than the screen', () => {
  assert.equal(typeof exports.boundPosition, 'function');
  const bounded = exports.boundPosition({ x: -400, y: 900 }, { width: 400, height: 500 }, { left: 0, top: 0, width: 1440, height: 900 });
  assert.equal(bounded.x, 0);
  assert.equal(bounded.y, 400);
  const large = exports.boundPosition({ x: -999, y: 999 }, { width: 500, height: 1000 }, { left: 0, top: 0, width: 390, height: 844 });
  assert.equal(large.x, -110);
  assert.equal(large.y, 0);
});

const flight = (overrides = {}) => ({ x: 400, y: 200, vx: 1000, vy: -300, angle: 0, impactX: 0, impactY: 0, ...overrides });
const box = { left: 0, top: 50, right: 300, bottom: 350 };
const viewport = { left: 0, top: 0, width: 1200, height: 800 };

test('flight carries throw momentum and gravity acts without attraction toward home', () => {
  assert.equal(typeof exports.stepFlight, 'function');
  const next = exports.stepFlight(flight(), box, viewport, 1 / 60).body;
  assert.ok(next.x > 400 && next.vx > 900);
  assert.ok(next.vy > -300, 'gravity should pull down');
  assert.notEqual(next.angle, 0, 'flight has a small rotational response');
});

test('all four boundaries reverse velocity with energy loss and an impact response', () => {
  assert.equal(typeof exports.stepFlight, 'function');
  const cases = [
    [flight({ x: 1, vx: -1200 }), 'vx', 1, 'impactX'],
    [flight({ x: 899, vx: 1200 }), 'vx', -1, 'impactX'],
    [flight({ y: -49, vy: -1200 }), 'vy', 1, 'impactY'],
    [flight({ y: 449, vy: 1200 }), 'vy', -1, 'impactY'],
  ];
  for (const [initial, component, direction, impact] of cases) {
    const next = exports.stepFlight(initial, box, viewport, 1 / 60).body;
    assert.equal(Math.sign(next[component]), direction);
    assert.ok(Math.abs(next[component]) < 1200);
    assert.ok(next[impact] > 0);
    assert.ok(next.x >= 0 && next.x + box.right <= viewport.width);
    assert.ok(next.y + box.top >= 0 && next.y + box.bottom <= viewport.height);
  }
});

test('flight settles at the floor and behaves consistently at different refresh rates', () => {
  assert.equal(typeof exports.stepFlight, 'function');
  const ends = [];
  for (const hz of [30, 60, 144]) {
    let body = flight(); let settled = false; let time = 0;
    while (time < 12 && !settled) {
      ({ body, settled } = exports.stepFlight(body, box, viewport, 1 / hz));
      time += 1 / hz;
    }
    assert.ok(settled, `must settle at ${hz}Hz`);
    assert.equal(body.y + box.bottom, viewport.height);
    assert.equal(body.vx, 0); assert.equal(body.vy, 0);
    ends.push({ x: body.x, time });
  }
  assert.ok(Math.max(...ends.map(end => end.x)) - Math.min(...ends.map(end => end.x)) < 12);
  assert.ok(Math.max(...ends.map(end => end.time)) - Math.min(...ends.map(end => end.time)) < .15);
});

test('small and offset viewports contain every high-velocity flight step', () => {
  assert.equal(typeof exports.stepFlight, 'function');
  for (const view of [{ left: 0, top: 0, width: 390, height: 844 }, { left: 100, top: 200, width: 350, height: 400 }]) {
    let body = flight({ vx: 2400, vy: -2400 });
    for (let i = 0; i < 300; i++) {
      ({ body } = exports.stepFlight(body, box, view, 1 / 60));
      assert.ok(body.x >= view.left && body.x + box.right <= view.left + view.width);
      assert.ok(body.y + box.top >= view.top && body.y + box.bottom <= view.top + view.height);
    }
  }
});

test('resizing a saved collision box uses the scale captured with that box', () => {
  assert.equal(typeof exports.resizeCollisionBox, 'function');
  const resized = exports.resizeCollisionBox({ left: 125, top: 125, right: 375, bottom: 375 },
    { width: 500, height: 500, fit: .5 }, { width: 600, height: 600, fit: .8 });
  assert.equal(resized.left, 60); assert.equal(resized.top, 60);
  assert.equal(resized.right, 540); assert.equal(resized.bottom, 540);
});
