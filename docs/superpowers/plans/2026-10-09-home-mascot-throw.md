# Homepage Cactea drag and throw

> **For agentic workers:** Use superpowers:executing-plans to implement this plan inline.

**Goal:** Allow the large `/home` Cactea to be dragged and thrown, bounce under gravity within the viewport, settle for one second, then spring back to its live hero anchor.

**Architecture:** A homepage-only wrapper promotes the existing DOM instance to a manual popover during a drag, escaping ancestor clipping and transforms. A reserved anchor keeps the hero layout stable. Its controller has idle, dragging, thrown, settled, and returning states; delta-time flight owns gravity, damping, friction, collisions, squash and rotation. A one-second inactivity timer begins after settling and a separate spring handles the return. Shared Cactea animations and other instances stay untouched.

**Tech Stack:** React, TypeScript, Pointer Events, native Popover API, requestAnimationFrame, Node tests, Playwright.

**Spec:** User request in this session: target only the large hero Cactea on `/home`, preserve layout and all existing interactions.

## Constraints and review focus

- No shared Cactea or Chat changes, no new dependencies.
- Preserve ordinary clicks, eye tracking, jumping, smiling, and barrel rolls.
- Cover release velocity, viewport edges, returning to a moving anchor, and grabbing during return.
- Cancel safely on pointer cancellation, blur, hidden tab, Escape, unmount, and reduced-motion changes.
- Verify touch input and narrow viewports, resize/scroll during return, and no layout shift.
- Calculate collisions from live artwork bounds, including rotation, squash, and existing animations; keep checking containment while settled.
- Re-grabbing cancels frames and timers immediately. Unchanged resize events preserve the inactivity deadline; genuine activation renews it.
- Reduced motion preserves dragging and the one-second rest, while skipping flight and the elastic return.

## Implementation

- [x] Add failing behavioral tests for spring physics, release direction, held resize, and moving eye tracking; cover pointer lifecycle and cleanup.
- [x] Implement homepage physics and lifecycle cleanup; run focused tests.
- [x] Wrap only HomeGarden's large mascot and add scoped grab/top-layer styles.
- [x] Check desktop, touch, reduced motion, interruption, click preservation, and Chat isolation in a real browser.
- [x] Run lint, TypeScript, regression tests, and review the final diff.

Validation: pure physics checks cover all four boundaries, energy loss, gravity, eventual settling, saved collision-box scaling, and 30/60/144 Hz updates. Controller checks cover the post-settle delay, repeated throws, interrupted flight/rest/return, stale frames and timers, resize, live artwork growth/shrinkage, activation during animation, and cleanup. Edge/Playwright checks pass for momentum, bouncing, live containment, the exact one-second rest, elastic return, unchanged layout and DOM identity, interruptions in all states, narrow and short viewports, reduced motion, navigation cleanup, Chat isolation, and native touch throwing/re-grabbing/cancellation.

Final checks: all 240 Node tests pass, targeted ESLint passes, TypeScript passes, and the diff has no whitespace errors.
