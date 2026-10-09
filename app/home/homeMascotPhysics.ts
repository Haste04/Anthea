export type Point = { x: number; y: number };
export type Sample = Point & { time: number };
export type SpringBody = Point & { vx: number; vy: number };
type Size = { width: number; height: number };
export type Viewport = Size & { left: number; top: number };
export type CollisionBox = { left: number; top: number; right: number; bottom: number };
export type CollisionGeometry = Size & { fit: number };
export type FlightBody = SpringBody & { angle: number; impactX: number; impactY: number };

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function releaseVelocity(samples: Sample[], now: number): Point {
  const recent = samples.filter(sample => now - sample.time <= 100);
  // Use the final motion segment so changing direction just before release feels natural.
  const first = recent.at(-2);
  const last = recent.at(-1);
  if (!first || !last || now - last.time > 60 || last.time <= first.time) return { x: 0, y: 0 };
  const seconds = (last.time - first.time) / 1000;
  return { x: clamp((last.x - first.x) / seconds, -2400, 2400), y: clamp((last.y - first.y) / seconds, -2400, 2400) };
}

/** Integrate in small steps so pointer velocity stays stable at different frame rates. */
export function stepSpring(body: SpringBody, target: Point, seconds: number): SpringBody {
  const result = { ...body };
  let remaining = Math.min(Math.max(seconds, 0), 1 / 30);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 240);
    result.vx += ((target.x - result.x) * 110 - result.vx * 14) * dt;
    result.vy += ((target.y - result.y) * 110 - result.vy * 14) * dt;
    result.x += result.vx * dt;
    result.y += result.vy * dt;
    remaining -= dt;
  }
  return result;
}

/** Oversized mascots may overhang either edge, but can never disappear offscreen. */
export function boundPosition(point: Point, size: Size, viewport: Viewport): Point {
  const right = viewport.left + viewport.width - size.width;
  const bottom = viewport.top + viewport.height - size.height;
  return {
    x: clamp(point.x, Math.min(viewport.left, right), Math.max(viewport.left, right)),
    y: clamp(point.y, Math.min(viewport.top, bottom), Math.max(viewport.top, bottom)),
  };
}

export function boundBoxPosition(point: Point, box: CollisionBox, viewport: Viewport): Point {
  const minX = viewport.left - box.left;
  const maxX = viewport.left + viewport.width - box.right;
  const minY = viewport.top - box.top;
  const maxY = viewport.top + viewport.height - box.bottom;
  return { x: clamp(point.x, Math.min(minX, maxX), Math.max(minX, maxX)), y: clamp(point.y, Math.min(minY, maxY), Math.max(minY, maxY)) };
}

/** The source dimensions and fit must be the ones captured with this saved box. */
export function resizeCollisionBox(box: CollisionBox, source: CollisionGeometry, next: CollisionGeometry): CollisionBox {
  const ratioX = next.width / Math.max(1, source.width) * next.fit / source.fit;
  const ratioY = next.height / Math.max(1, source.height) * next.fit / source.fit;
  return {
    left: next.width / 2 + (box.left - source.width / 2) * ratioX,
    right: next.width / 2 + (box.right - source.width / 2) * ratioX,
    top: next.height / 2 + (box.top - source.height / 2) * ratioY,
    bottom: next.height / 2 + (box.bottom - source.height / 2) * ratioY,
  };
}

/** Free flight has no home target. Small substeps prevent tunnelling at high speed. */
export function stepFlight(initial: FlightBody, box: CollisionBox, view: Viewport, seconds: number) {
  const body = { ...initial };
  const minX = view.left - box.left;
  const maxX = Math.max(minX, view.left + view.width - box.right);
  const minY = view.top - box.top;
  const maxY = Math.max(minY, view.top + view.height - box.bottom);
  body.x = clamp(body.x, minX, maxX);
  body.y = clamp(body.y, minY, maxY);
  let remaining = Math.min(Math.max(seconds, 0), .05);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 240);
    body.impactX *= Math.exp(-14 * dt);
    body.impactY *= Math.exp(-14 * dt);
    body.vx *= Math.exp(-.32 * dt);
    body.vy = body.vy * Math.exp(-.16 * dt) + 1700 * dt;
    body.x += body.vx * dt;
    body.y += body.vy * dt;
    if ((body.x <= minX && body.vx < 0) || (body.x >= maxX && body.vx > 0)) {
      body.x = clamp(body.x, minX, maxX);
      body.impactX = Math.max(body.impactX, Math.min(.1, Math.abs(body.vx) / 16000));
      body.vx *= -.68;
    }
    if (body.y <= minY && body.vy < 0) {
      body.y = minY;
      body.impactY = Math.max(body.impactY, Math.min(.1, Math.abs(body.vy) / 16000));
      body.vy *= -.64;
    }
    if (body.y >= maxY && body.vy >= 0) {
      body.y = maxY;
      if (body.vy > 90) {
        body.impactY = Math.max(body.impactY, Math.min(.1, body.vy / 16000));
        body.vy *= -.62;
        body.vx *= .86;
      } else { body.vy = 0; body.vx *= Math.exp(-9 * dt); }
    }
    const lean = clamp(body.vx * .004, -6, 6);
    body.angle += (lean - body.angle) * (1 - Math.exp(-5 * dt));
    remaining -= dt;
  }
  const settled = body.y >= maxY - .5 && Math.abs(body.vx) < 10 && body.vy === 0 && Math.abs(body.angle) < .15 && Math.max(body.impactX, body.impactY) < .004;
  if (settled) { body.vx = 0; body.vy = 0; body.angle = 0; body.impactX = 0; body.impactY = 0; }
  return { body, settled };
}
