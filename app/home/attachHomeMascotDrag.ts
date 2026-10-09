import { boundBoxPosition, releaseVelocity, resizeCollisionBox, stepFlight, stepSpring, type CollisionBox, type FlightBody, type Sample } from "./homeMascotPhysics";

type MascotMotion = "idle" | "dragging" | "thrown" | "settled" | "returning";

/** Owns only the homepage wrapper. The shared mascot and its animation layers stay mounted. */
export default function attachHomeMascotDrag(anchor: HTMLDivElement, actor: HTMLDivElement) {
  const button = actor.querySelector("button");
  if (!button || typeof actor.showPopover !== "function") return () => {};
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Body/arm/face layer bounds exclude the empty square canvas and ground shadow.
  const artwork = [...button.querySelectorAll<HTMLElement>(":scope > div > div > span")];
  let state: MascotMotion = "idle";
  let pointer: number | null = null;
  let start = { x: 0, y: 0 };
  let grab = { x: 0, y: 0 };
  let cursor = { x: 0, y: 0 };
  let samples: Sample[] = [];
  let body: FlightBody = { x: 0, y: 0, vx: 0, vy: 0, angle: 0, impactX: 0, impactY: 0 };
  let frame = 0;
  let timer = 0;
  let generation = 0;
  let lastFrame = 0;
  let lifted = false;
  let suppressClick = false;
  let disposed = false;
  let fit = 1;
  let landing = false;
  let restingPosition = { x: 0, y: 0 };
  let restingBox: CollisionBox = { left: 0, top: 0, right: 0, bottom: 0 };
  let restingGeometry = { width: 1, height: 1, fit: 1 };
  let lastGeometry = "";

  actor.dataset.homeMascotDraggable = "true";
  const setState = (next: MascotMotion) => {
    state = next;
    if (next === "idle") delete actor.dataset.homeMascotMotion;
    else actor.dataset.homeMascotMotion = next;
  };
  const viewport = () => {
    const view = window.visualViewport;
    // A small cushion leaves room for the mascot's existing breathing and waving.
    return { left: (view?.offsetLeft ?? 0) + 8, top: (view?.offsetTop ?? 0) + 8, width: Math.max(1, (view?.width ?? window.innerWidth) - 16), height: Math.max(1, (view?.height ?? window.innerHeight) - 16) };
  };
  const geometry = () => {
    const view = viewport();
    return [anchor.offsetWidth, anchor.offsetHeight, view.left, view.top, view.width, view.height].join(":");
  };
  const stop = () => {
    generation++;
    window.cancelAnimationFrame(frame); frame = 0;
    window.clearTimeout(timer); timer = 0;
  };
  const releaseCapture = () => {
    const id = pointer;
    pointer = null;
    if (id !== null && button.hasPointerCapture(id)) button.releasePointerCapture(id);
  };
  const paint = () => {
    actor.style.left = `${body.x}px`;
    actor.style.top = `${body.y}px`;
    actor.style.transform = `rotate(${body.angle}deg) scale(${fit * (1 - body.impactX + body.impactY * .6)}, ${fit * (1 - body.impactY + body.impactX * .6)})`;
    button.dispatchEvent(new Event("home-mascot-position"));
  };
  const visualBox = (): CollisionBox => {
    const rects = artwork.map(part => part.getBoundingClientRect()).filter(rect => rect.width && rect.height);
    if (!rects.length) {
      const rect = actor.getBoundingClientRect();
      return { left: rect.left - body.x, top: rect.top - body.y, right: rect.left + rect.width - body.x, bottom: rect.top + rect.height - body.y };
    }
    return {
      left: Math.min(...rects.map(rect => rect.left)) - body.x,
      top: Math.min(...rects.map(rect => rect.top)) - body.y,
      right: Math.max(...rects.map(rect => rect.right)) - body.x,
      bottom: Math.max(...rects.map(rect => rect.bottom)) - body.y,
    };
  };
  const contain = () => {
    let box = visualBox();
    const view = viewport();
    // On short/narrow screens, fit the lifted artwork instead of letting it clip.
    const adjustment = Math.min(1, view.width / Math.max(1, box.right - box.left), view.height / Math.max(1, box.bottom - box.top));
    if (adjustment < 1) { fit *= adjustment * .999; paint(); box = visualBox(); }
    const next = boundBoxPosition(body, box, view);
    if (next.x !== body.x || next.y !== body.y) { body.x = next.x; body.y = next.y; paint(); }
  };
  const restore = () => {
    stop();
    releaseCapture();
    if (lifted) actor.hidePopover();
    lifted = false;
    actor.removeAttribute("popover");
    setState("idle");
    for (const property of ["left", "top", "width", "height", "transform"]) actor.style.removeProperty(property);
    anchor.style.removeProperty("aspect-ratio");
    button.dispatchEvent(new Event("home-mascot-position"));
    samples = [];
    fit = 1;
  };
  const lift = () => {
    const rect = actor.getBoundingClientRect();
    anchor.style.aspectRatio = `${anchor.offsetWidth} / ${anchor.offsetHeight}`;
    actor.style.width = `${rect.width}px`;
    actor.style.height = `${rect.height}px`;
    body = { x: rect.left, y: rect.top, vx: 0, vy: 0, angle: 0, impactX: 0, impactY: 0 };
    setState("dragging");
    paint();
    actor.setAttribute("popover", "manual");
    actor.showPopover();
    lifted = true;
    lastGeometry = geometry();
  };
  const schedule = () => {
    const token = generation;
    frame = window.requestAnimationFrame(now => {
      if (disposed || token !== generation) return;
      tick(now);
    });
  };
  const returnHome = () => {
    stop();
    releaseCapture();
    if (!lifted) return;
    if (reduced.matches || document.hidden) { restore(); return; }
    body.vx = 0; body.vy = 0;
    landing = false;
    setState("returning");
    lastFrame = performance.now();
    schedule();
  };
  const settle = () => {
    if (state !== "settled") {
      restingPosition = { x: body.x, y: body.y };
      restingBox = visualBox();
      restingGeometry = { width: parseFloat(actor.style.width), height: parseFloat(actor.style.height), fit };
    }
    stop();
    setState("settled");
    const token = generation;
    timer = window.setTimeout(() => {
      if (disposed || token !== generation || state !== "settled") return;
      timer = 0;
      returnHome();
    }, 1000);
    // Keep live blinking/breathing/jump artwork contained without advancing flight.
    if (!reduced.matches) schedule();
  };
  const tick = (now: number) => {
    frame = 0;
    if (!lifted || pointer !== null) return;
    const dt = Math.min(.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (state === "thrown") {
      const next = stepFlight(body, visualBox(), viewport(), dt);
      body = next.body;
      paint(); contain();
      if (next.settled) { settle(); return; }
    } else if (state === "settled") {
      // Containment during a jump/breath is temporary, not a new resting position.
      if (body.x !== restingPosition.x || body.y !== restingPosition.y) {
        body.x = restingPosition.x; body.y = restingPosition.y;
        paint();
      }
      contain();
    } else if (state === "returning") {
      const home = anchor.getBoundingClientRect();
      actor.style.width = `${home.width}px`; actor.style.height = `${home.height}px`;
      body = { ...body, ...stepSpring(body, { x: home.left, y: home.top }, dt) };
      body.angle *= Math.exp(-9 * dt);
      body.impactX *= Math.exp(-14 * dt); body.impactY *= Math.exp(-14 * dt);
      fit += (1 - fit) * (1 - Math.exp(-8 * dt));
      const distance = Math.hypot(body.x - home.left, body.y - home.top);
      const speed = Math.hypot(body.vx, body.vy);
      if (!landing && distance < 5 && speed < 55) { landing = true; body.impactY = .025; }
      paint();
      if (landing && distance < .65 && speed < 12 && body.impactY < .002 && Math.abs(body.angle) < .1 && fit > .999) { restore(); return; }
    } else return;
    schedule();
  };
  const throwMascot = (velocity: { x: number; y: number }) => {
    releaseCapture();
    if (!lifted) return;
    stop();
    if (document.hidden) { restore(); return; }
    if (reduced.matches) { settle(); return; }
    body.vx = velocity.x; body.vy = velocity.y;
    setState("thrown");
    contain();
    lastFrame = performance.now();
    schedule();
  };
  const down = (event: PointerEvent) => {
    if (disposed || pointer !== null || !event.isPrimary || event.button !== 0 || !button.contains(event.target as Node)) return;
    stop();
    suppressClick = false;
    pointer = event.pointerId;
    start = { x: event.clientX, y: event.clientY }; cursor = start;
    const rect = actor.getBoundingClientRect();
    const position = lifted ? body : { x: rect.left, y: rect.top };
    grab = { x: event.clientX - position.x, y: event.clientY - position.y };
    samples = [{ x: position.x, y: position.y, time: event.timeStamp }];
    if (lifted) { setState("dragging"); suppressClick = true; }
    button.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    cursor = { x: event.clientX, y: event.clientY };
    if (!lifted && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) return;
    if (!lifted) lift();
    suppressClick = true;
    body.x = event.clientX - grab.x; body.y = event.clientY - grab.y;
    body.vx = 0; body.vy = 0;
    paint(); contain();
    samples.push({ x: body.x, y: body.y, time: event.timeStamp });
    samples = samples.filter(sample => event.timeStamp - sample.time <= 120);
    event.preventDefault();
  };
  const up = (event: PointerEvent) => { if (event.pointerId === pointer) throwMascot(releaseVelocity(samples, event.timeStamp)); };
  const cancel = (event: PointerEvent) => { if (event.pointerId === pointer) returnHome(); };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) {
      // A real activation still jumps and counts as activity; a suppressed drag click does not.
      if (state === "settled") settle();
      return;
    }
    suppressClick = false;
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const preventNativeDrag = (event: Event) => event.preventDefault();
  const escape = (event: KeyboardEvent) => { if (event.key === "Escape") returnHome(); };
  const blur = () => { if (pointer !== null || lifted) returnHome(); };
  const hidden = () => { if (document.hidden) restore(); };
  const preference = () => { if (reduced.matches) restore(); };
  const resize = () => {
    if (!lifted) return;
    const nextGeometry = geometry();
    if (nextGeometry === lastGeometry) return;
    lastGeometry = nextGeometry;
    const home = anchor.getBoundingClientRect();
    const previousWidth = parseFloat(actor.style.width) || home.width;
    const previousHeight = parseFloat(actor.style.height) || home.height;
    actor.style.width = `${home.width}px`; actor.style.height = `${home.height}px`;
    fit = 1;
    if (pointer !== null) {
      grab = { x: grab.x * home.width / Math.max(1, previousWidth), y: grab.y * home.height / Math.max(1, previousHeight) };
      body.x = cursor.x - grab.x; body.y = cursor.y - grab.y;
      samples = [];
    }
    if (state === "settled") { body.x = restingPosition.x; body.y = restingPosition.y; }
    paint();
    if (state !== "returning") contain();
    if (state === "settled") {
      const view = viewport();
      // Resize the stable collision box, not a transient jump/breath correction.
      const nextGeometry = { width: home.width, height: home.height, fit };
      restingBox = resizeCollisionBox(restingBox, restingGeometry, nextGeometry);
      restingGeometry = nextGeometry;
      restingPosition = boundBoxPosition(restingPosition, restingBox, view);
      const gap = view.top + view.height - (restingPosition.y + restingBox.bottom);
      if (gap > 6 && !reduced.matches) throwMascot({ x: 0, y: 0 });
      else { body.x = restingPosition.x; body.y = restingPosition.y; paint(); contain(); }
    }
  };
  const observer = window.ResizeObserver ? new window.ResizeObserver(resize) : null;
  observer?.observe(anchor);

  actor.addEventListener("pointerdown", down);
  actor.addEventListener("pointermove", move);
  actor.addEventListener("pointerup", up);
  actor.addEventListener("pointercancel", cancel);
  actor.addEventListener("lostpointercapture", cancel);
  actor.addEventListener("click", click, true);
  actor.addEventListener("dragstart", preventNativeDrag);
  window.addEventListener("blur", blur);
  window.addEventListener("keydown", escape);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("scroll", resize);
  document.addEventListener("visibilitychange", hidden);
  reduced.addEventListener("change", preference);
  return () => {
    disposed = true;
    observer?.disconnect();
    restore();
    delete actor.dataset.homeMascotDraggable;
    actor.removeEventListener("pointerdown", down);
    actor.removeEventListener("pointermove", move);
    actor.removeEventListener("pointerup", up);
    actor.removeEventListener("pointercancel", cancel);
    actor.removeEventListener("lostpointercapture", cancel);
    actor.removeEventListener("click", click, true);
    actor.removeEventListener("dragstart", preventNativeDrag);
    window.removeEventListener("blur", blur);
    window.removeEventListener("keydown", escape);
    window.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("resize", resize);
    window.visualViewport?.removeEventListener("scroll", resize);
    document.removeEventListener("visibilitychange", hidden);
    reduced.removeEventListener("change", preference);
  };
}
