# Pixi Table Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-first Pixi.js table rendering layer behind the existing React poker UI so the table, deck, pot, and transient card/chip animations feel richer without rewriting gameplay logic.

**Architecture:** Keep React as the owner of game state, controls, seats, modals, WebSocket, and accessibility-critical text. Add Pixi as an opt-in canvas layer inside `game-area`, fed by small typed view models derived from existing room/game state. Start with non-interactive background rendering, then move only transient effects into Pixi; do not move betting controls, split selection, or room actions into canvas.

**Tech Stack:** React 19, TypeScript, Vite 6, Zustand, Pixi.js 8.6.6, existing CSS/React room components, existing Express/WebSocket backend.

---

## Current Context

**Existing implementation to preserve:**
- `client/src/pages/RoomPage.tsx` owns the room screen composition.
- `client/src/pages/room/useRoomGameController.ts` owns WebSocket handlers, local timers, and animation triggers.
- `client/src/pages/room/components/AnimatedLayer.tsx` currently renders CSS deal cards and center messages.
- `client/src/pages/room/seatLayout.ts` maps physical seats to visual seat positions.
- `client/src/styles/room.css`, `client/src/styles/cards.css`, and `client/src/styles/mobile-game.css` define the current React/CSS table.

**Rules:**
- Keep phone portrait as the primary layout target: 360x740, 390x844, 430x932.
- Do not change server game rules or WebSocket message names.
- Do not put action controls, menus, split buttons, or settlement into Pixi.
- Every completed task must update this markdown file by changing its checkbox.
- Use generated Pixi graphics first; do not introduce external image assets until the canvas lifecycle is stable.
- Keep a feature flag so the React/CSS table remains usable if Pixi has a device-specific issue.

## File Structure Target

- Create: `client/src/pages/room/pixi/PixiTableLayer.tsx`
  - React host component. Creates/destroys Pixi `Application`, owns resize handling, and mounts the canvas.
- Create: `client/src/pages/room/pixi/pixiTableTypes.ts`
  - Typed view models for table size, seat anchors, pot/deck values, and animation events.
- Create: `client/src/pages/room/pixi/tableGeometry.ts`
  - Pure coordinate helpers that convert `game-area` dimensions plus visual seats into Pixi positions.
- Create: `client/src/pages/room/pixi/tableScene.ts`
  - Imperative Pixi scene builder/updater for felt, rim, deck, pot badge background, and animation containers.
- Create: `client/src/pages/room/pixi/tableTextures.ts`
  - Generated `Graphics`/texture helpers for card backs, chips, table felt gradients, and glow rings.
- Create: `client/src/pages/room/pixi/usePrefersReducedMotion.ts`
  - Small media-query hook for reduced-motion fallback.
- Modify: `client/src/pages/RoomPage.tsx`
  - Mount `PixiTableLayer` behind React seats/cards when enabled.
- Modify: `client/src/pages/room/components/AnimatedLayer.tsx`
  - Keep center message in React. Disable CSS deal cards only when Pixi handles deal animation.
- Modify: `client/src/pages/room/useRoomGameController.ts`
  - Expose typed animation events already represented by `dealAnim` without changing WebSocket handling.
- Modify: `client/src/styles/room.css`
  - Add `.pixi-table-layer` positioning and canvas pointer behavior.
- Modify: `client/src/styles/mobile-game.css`
  - Ensure the canvas layer respects safe-area and never changes layout size.

---

## Task 1: Add Pixi Feature Flag And Host Shell

**Files:**
- Create: `client/src/pages/room/pixi/PixiTableLayer.tsx`
- Create: `client/src/pages/room/pixi/usePrefersReducedMotion.ts`
- Modify: `client/src/pages/RoomPage.tsx`
- Modify: `client/src/styles/room.css`
- Modify: this plan file

- [x] **Step 1: Create reduced-motion hook**

Create `client/src/pages/room/pixi/usePrefersReducedMotion.ts`:

```ts
import { useEffect, useState } from 'react';

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}
```

- [x] **Step 2: Create a non-rendering Pixi host**

Create `client/src/pages/room/pixi/PixiTableLayer.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface PixiTableLayerProps {
  enabled: boolean;
}

export function PixiTableLayer({ enabled }: PixiTableLayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (!enabled || reducedMotion || !hostRef.current || appRef.current) return;

    const app = new Application();
    let disposed = false;

    void app.init({
      resizeTo: hostRef.current,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    }).then(() => {
      if (disposed || !hostRef.current) {
        app.destroy(true);
        return;
      }
      hostRef.current.appendChild(app.canvas);
      appRef.current = app;
    });

    return () => {
      disposed = true;
      appRef.current?.destroy(true);
      appRef.current = null;
    };
  }, [enabled, reducedMotion]);

  if (!enabled || reducedMotion) return null;
  return <div className="pixi-table-layer" ref={hostRef} aria-hidden="true" />;
}
```

- [x] **Step 3: Mount the host behind current React table UI**

In `client/src/pages/RoomPage.tsx`, add the import:

```ts
import { PixiTableLayer } from './room/pixi/PixiTableLayer';
```

Inside `<main className="game-area">`, before the existing `.table-felt` div, add:

```tsx
<PixiTableLayer enabled={import.meta.env.VITE_PIXI_TABLE === '1'} />
```

- [x] **Step 4: Add canvas layer CSS**

Append to `client/src/styles/room.css`:

```css
.pixi-table-layer {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.pixi-table-layer canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

- [x] **Step 5: Verify off-by-default build**

Run:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
```

Expected: build succeeds with Pixi imported but not visible unless `VITE_PIXI_TABLE=1`.

---

## Task 2: Add Table Geometry Mapper

**Files:**
- Create: `client/src/pages/room/pixi/pixiTableTypes.ts`
- Create: `client/src/pages/room/pixi/tableGeometry.ts`
- Create: `client/src/pages/room/pixi/tableGeometry.test.ts` if the project adds Vitest later; otherwise verify with TypeScript build
- Modify: this plan file

- [x] **Step 1: Define Pixi view model types**

Create `client/src/pages/room/pixi/pixiTableTypes.ts`:

```ts
export interface TableSize {
  width: number;
  height: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface TableGeometry {
  center: Point2D;
  feltRadiusX: number;
  feltRadiusY: number;
  deck: Point2D;
  pot: Point2D;
  seats: Point2D[];
}
```

- [x] **Step 2: Implement deterministic geometry helper**

Create `client/src/pages/room/pixi/tableGeometry.ts`:

```ts
import type { TableGeometry, TableSize } from './pixiTableTypes';

const seatRatios = [
  { x: 0.5, y: 0.12 },
  { x: 0.88, y: 0.22 },
  { x: 0.88, y: 0.42 },
  { x: 0.88, y: 0.62 },
  { x: 0.5, y: 0.78 },
  { x: 0.12, y: 0.62 },
  { x: 0.12, y: 0.42 },
  { x: 0.12, y: 0.22 },
];

export function getTableGeometry(size: TableSize): TableGeometry {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const center = { x: width * 0.5, y: height * 0.45 };

  return {
    center,
    feltRadiusX: width * 0.44,
    feltRadiusY: height * 0.27,
    deck: { x: center.x, y: center.y },
    pot: { x: center.x, y: center.y - Math.min(44, height * 0.07) },
    seats: seatRatios.map((point) => ({ x: width * point.x, y: height * point.y })),
  };
}
```

- [x] **Step 3: Verify TypeScript catches no type errors**

Run:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
```

Expected: build succeeds.

Completion note 2026-07-05: Task 2 completed. Added `pixiTableTypes.ts` and deterministic `tableGeometry.ts`; `npm run build` passed with approved escalation after sandbox `spawn EPERM`.

---

## Task 3: Render Pixi Felt, Rim, Pot Zone, And Deck

**Files:**
- Create: `client/src/pages/room/pixi/tableScene.ts`
- Create: `client/src/pages/room/pixi/tableTextures.ts`
- Modify: `client/src/pages/room/pixi/PixiTableLayer.tsx`
- Modify: `client/src/styles/room.css`
- Modify: this plan file

- [x] **Step 1: Create generated drawing helpers**

Create `client/src/pages/room/pixi/tableTextures.ts`:

```ts
import { Graphics } from 'pixi.js';

export function drawFelt(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  graphics.ellipse(width / 2, height * 0.45, width * 0.44, height * 0.27);
  graphics.fill({ color: 0x155734, alpha: 0.96 });
  graphics.stroke({ color: 0xd4af37, width: 3, alpha: 0.45 });
}

export function drawDeck(graphics: Graphics, x: number, y: number) {
  graphics.clear();
  graphics.roundRect(x - 28, y - 39, 56, 78, 6);
  graphics.fill({ color: 0x7a3522, alpha: 1 });
  graphics.stroke({ color: 0xd4af37, width: 1, alpha: 0.55 });
  graphics.roundRect(x - 23, y - 34, 46, 68, 5);
  graphics.stroke({ color: 0xf0d77c, width: 1, alpha: 0.28 });
}
```

- [x] **Step 2: Create scene updater**

Create `client/src/pages/room/pixi/tableScene.ts`:

```ts
import { Container, Graphics } from 'pixi.js';
import { getTableGeometry } from './tableGeometry';
import { drawDeck, drawFelt } from './tableTextures';
import type { TableSize } from './pixiTableTypes';

export interface PixiTableScene {
  root: Container;
  resize: (size: TableSize) => void;
  destroy: () => void;
}

export function createPixiTableScene() {
  const root = new Container();
  const felt = new Graphics();
  const deck = new Graphics();
  const potGlow = new Graphics();

  root.addChild(felt, potGlow, deck);

  function resize(size: TableSize) {
    const geometry = getTableGeometry(size);
    drawFelt(felt, size.width, size.height);

    potGlow.clear();
    potGlow.circle(geometry.pot.x, geometry.pot.y, Math.min(48, size.width * 0.12));
    potGlow.fill({ color: 0xd4af37, alpha: 0.1 });

    drawDeck(deck, geometry.deck.x, geometry.deck.y);
  }

  return {
    root,
    resize,
    destroy: () => root.destroy({ children: true }),
  } satisfies PixiTableScene;
}
```

- [x] **Step 3: Wire scene into `PixiTableLayer`**

In `PixiTableLayer.tsx`, after app initialization succeeds, create and attach the scene:

```ts
const scene = createPixiTableScene();
app.stage.addChild(scene.root);
scene.resize({ width: app.screen.width, height: app.screen.height });
app.renderer.on('resize', (width, height) => {
  scene.resize({ width, height });
});
```

Also destroy it in cleanup:

```ts
scene.destroy();
```

- [x] **Step 4: Hide CSS felt only when Pixi is enabled**

In `RoomPage.tsx`, compute:

```ts
const pixiEnabled = import.meta.env.VITE_PIXI_TABLE === '1';
```

Apply class:

```tsx
<div className={`table-felt${pixiEnabled ? ' pixi-backed' : ''}`}>
```

Add CSS:

```css
.table-felt.pixi-backed {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}
```

- [x] **Step 5: Verify flag-on and flag-off builds**

Run:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
```

Then run dev with Pixi enabled:

```powershell
$env:VITE_PIXI_TABLE='1'
npm run dev
```

Expected: room still renders with React controls above a nonblank Pixi table. Stop dev server after testing.

Completion note 2026-07-05: Task 3 completed. Added generated Pixi table drawing helpers, scene updater, dynamic scene wiring, and `.table-felt.pixi-backed`. `npm run build` passed with flag off and with `VITE_PIXI_TABLE=1`. Browser check at 390x844 entered room `880` with injected `user1` session: `.game-area` exists, `.pixi-table-layer canvas` exists, canvas CSS size is 390x631, backing size is 780x1262, WebGL context is available, and `.table-felt` class is `table-felt pixi-backed`. Dev server process 14732 and Chrome remote-debug process 14472 were stopped after verification.

---

## Task 4: Move Deal Animation Into Pixi

**Files:**
- Modify: `client/src/pages/room/pixi/pixiTableTypes.ts`
- Modify: `client/src/pages/room/pixi/tableScene.ts`
- Modify: `client/src/pages/room/pixi/PixiTableLayer.tsx`
- Modify: `client/src/pages/RoomPage.tsx`
- Modify: `client/src/pages/room/components/AnimatedLayer.tsx`
- Modify: this plan file

- [x] **Step 1: Add deal animation props**

In `pixiTableTypes.ts`, add:

```ts
export interface DealAnimationEvent {
  key: number;
  targets: number[];
}
```

Update `PixiTableLayerProps`:

```ts
import type { DealAnimationEvent } from './pixiTableTypes';

interface PixiTableLayerProps {
  enabled: boolean;
  dealAnim: DealAnimationEvent;
}
```

- [x] **Step 2: Add Pixi deal-card animation method**

In `tableScene.ts`, add a method:

```ts
playDealAnimation: (event: DealAnimationEvent, reducedMotion: boolean) => void;
```

Implementation shape:

```ts
function playDealAnimation(event: DealAnimationEvent, reducedMotion: boolean) {
  if (reducedMotion || event.targets.length === 0) return;
  const geometry = lastGeometry;
  if (!geometry) return;

  event.targets.forEach((target, index) => {
    const destination = geometry.seats[target];
    if (!destination) return;
    const card = new Graphics();
    drawDeck(card, 0, 0);
    card.scale.set(0.5);
    card.position.set(geometry.deck.x, geometry.deck.y);
    root.addChild(card);

    const start = performance.now() + index * 70;
    const duration = 620;
    appTickerCallbacks.add((now) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      card.position.set(
        geometry.deck.x + (destination.x - geometry.deck.x) * progress,
        geometry.deck.y + (destination.y - geometry.deck.y) * progress,
      );
      card.alpha = 1 - progress;
      if (progress >= 1) card.destroy();
    });
  });
}
```

Do not copy this exact pseudo-code blindly if the scene owns ticker differently; implement with Pixi ticker cleanup so destroyed cards do not leak callbacks.

- [x] **Step 3: Pass `dealAnim` to Pixi host**

In `RoomPage.tsx`:

```tsx
<PixiTableLayer enabled={pixiEnabled} dealAnim={dealAnim} />
```

- [x] **Step 4: Prevent duplicate CSS deal cards when Pixi is enabled**

Update `AnimatedLayer` props:

```ts
interface AnimatedLayerProps {
  dealAnim: { key: number; targets: number[] };
  centerMessage: string | null;
  renderDealCards?: boolean;
}
```

Render deal cards only when `renderDealCards !== false`.

In `RoomPage.tsx`:

```tsx
<AnimatedLayer dealAnim={dealAnim} centerMessage={game.centerMessage} renderDealCards={!pixiEnabled} />
```

- [x] **Step 5: Verify no duplicated animations**

With `VITE_PIXI_TABLE=1`, confirm there is one deal animation layer only. With the flag unset, confirm the existing CSS deal cards still render.

Completion note 2026-07-05: Task 4 completed. `npm run build` passed after approved escalation for Vite/esbuild `spawn EPERM`; the known Pixi lazy chunk >500KB warning remains. Browser QA at 390x844 used local server/dev and Chrome remote-debug. With `VITE_PIXI_TABLE=1`, room `365` started with `.pixi-table-layer canvas` present, `.table-felt pixi-backed`, and `.deal-card` max count 0 during the start/deal observation window. With the flag unset, room `648` was driven through a real second deal via WebSocket actions; `.pixi-table-layer canvas` was absent, `.table-felt` remained unbacked, and `.deal-card` max count was 2, confirming the CSS fallback still renders. Started validation processes were cleaned up after testing.

---

## Task 5: Add Pixi Chip And Pot Feedback Effects

**Files:**
- Modify: `client/src/pages/room/pixi/tableScene.ts`
- Modify: `client/src/pages/room/pixi/tableTextures.ts`
- Modify: `client/src/pages/room/useRoomGameController.ts`
- Modify: `client/src/pages/RoomPage.tsx`
- Modify: this plan file

- [x] **Step 1: Add visual action event type**

In `pixiTableTypes.ts`, add:

```ts
export interface ChipAnimationEvent {
  key: number;
  player: string;
  visualSeatIndex: number;
  amount?: number;
}
```

- [x] **Step 2: Emit chip animation event from controller on bet actions**

In `useRoomGameController.ts`, add state:

```ts
const [chipAnim, setChipAnim] = useState<ChipAnimationEvent | null>(null);
```

When handling `game_action` for `see`, `raise`, `knock`, or `call`, map `msg.action.player` to a visual seat index using current `roomRef.current` and `calcSeatRotation`, then call:

```ts
setChipAnim({
  key: Date.now(),
  player: msg.action.player,
  visualSeatIndex,
  amount: msg.action.amount ?? msg.action.bet,
});
```

Return `chipAnim` from the hook.

- [x] **Step 3: Render flying chips in Pixi**

Add `playChipAnimation(event: ChipAnimationEvent)` to `tableScene.ts`. Draw three small circles at the seat anchor and tween them toward the pot anchor over 450ms with staggered start times.

- [x] **Step 4: Pass chip animation into Pixi host**

In `RoomPage.tsx`, destructure `chipAnim` from the controller and pass:

```tsx
<PixiTableLayer enabled={pixiEnabled} dealAnim={dealAnim} chipAnim={chipAnim} />
```

- [x] **Step 5: Verify betting actions remain server-authoritative**

Run a two-player smoke test. Confirm Pixi chip animation is purely visual and failed backend actions do not animate unless a `game_action` WebSocket event is received.

Completion note 2026-07-06: Task 5 completed. Fixed real U+FFFD mojibake in `RoomPage.tsx` and `AnimatedLayer.tsx`; `useRoomGameController.ts` and `useWebSocket.ts` read correctly as UTF-8. Added `ChipAnimationEvent`, emitted `chipAnim` only from backend `game_action` WebSocket events for `see`, `raise`, `knock`, and `call`, and rendered generated Pixi chip flights toward the pot with ticker cleanup. `npm run build` passed after approved escalation for Vite/esbuild `spawn EPERM`; the known Pixi lazy chunk >500KB warning remains. Browser QA at 390x844 with `VITE_PIXI_TABLE=1` used room `437`: failed over-limit `raise` produced an error and no `game_action`; successful `see` produced `game_action`; `.pixi-table-layer canvas` existed, `.deal-card` count was 0, `.table-felt` was `table-felt pixi-backed`, and page text had no replacement character.

---

## Task 6: Mobile QA And Fallback Hardening

**Files:**
- Modify code only for bugs found during QA
- Modify this plan file

- [ ] **Step 1: Build verification**

Run:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
node --check ..\server\server.js
node --check ..\server\game.js
```

Expected: all pass.

- [ ] **Step 2: Canvas nonblank check**

With `VITE_PIXI_TABLE=1`, inspect the room page and confirm:
- canvas exists under `.pixi-table-layer`
- canvas dimensions match `.game-area`
- at least one non-transparent table/deck pixel is visible
- React seats/cards/buttons remain clickable because canvas has `pointer-events: none`

- [ ] **Step 3: Phone viewport QA**

Test these viewports:
- 360x740
- 390x844
- 430x932

Expected:
- no horizontal scroll
- table is centered in the play area
- local hand and bottom action bar do not overlap
- deal/chip animations do not cover buttons long enough to interfere
- reduced-motion users get no Pixi animation layer

- [ ] **Step 4: Flag-off regression QA**

Unset `VITE_PIXI_TABLE` and repeat one two-player smoke test. Expected: current React/CSS table and CSS animations still work.

- [ ] **Step 5: Update this plan with QA notes**

Add a dated note listing tested devices/viewports, whether Pixi stayed enabled, and any remaining issues.

---

## Verification Commands

Use these commands before marking any task complete:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
```

```powershell
cd G:\WorkBuddy\开发\chekai
node --check server\server.js
node --check server\game.js
```

When a dev server is used, check for leftovers before final response:

```powershell
netstat -ano | Select-String -Pattern ':3000\s|:5173\s'
```

Stop only servers started for this task.

## Non-Goals

- No full canvas rewrite of seats, names, action buttons, modals, or split selection.
- No backend rule changes.
- No new image asset pipeline until generated Pixi graphics are stable.
- No desktop-first redesign.
- No hidden dependency on hover or mouse-only interaction.

## Self-Review Notes

- This plan keeps React as the interaction and accessibility layer, limiting Pixi to background and transient visuals.
- The plan has an off-by-default feature flag, so future sessions can land it incrementally.
- The riskiest implementation area is ticker cleanup for transient card/chip animations; each animation task explicitly requires cleanup verification.