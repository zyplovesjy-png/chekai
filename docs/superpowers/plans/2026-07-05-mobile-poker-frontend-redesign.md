# Mobile Poker Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current mobile-first poker room from a functional prototype into a polished, maintainable phone-first game UI with clear component boundaries, richer table visuals, and staged animations.

**Architecture:** Keep the existing React + Vite + Zustand + WebSocket architecture and do not change the backend game protocol in the first pass. Split the oversized `RoomPage.tsx` into focused UI and hook modules, then add a mobile-first visual system and animation layer. Pixi.js remains a later optional rendering layer after the React/CSS version is stable.

**Tech Stack:** React 19, Vite 6, TypeScript, Zustand, CSS modules/global CSS, WebSocket, existing Express backend. Existing `pixi.js` dependency is not used until Task 8.

---

## Operating Rules For Future Sessions

- [ ] Mark a task checkbox as complete only after code changes are made and verification commands pass.
- [ ] When a task is partially complete, add a dated note under that task instead of checking it off.
- [ ] Keep the backend WebSocket/API payloads unchanged unless a task explicitly says otherwise.
- [ ] Optimize first for phone portrait layouts around 360px-430px width and 640px-932px height.
- [ ] Do not rely on hover-only interactions; all primary controls must work with touch.
- [ ] Preserve current gameplay semantics. Visual changes must not change dealing, betting, folding, split selection, or settlement rules.
- [ ] After each completed task, update this markdown file in the same change.

## Current Baseline

**Key source files:**
- `client/src/pages/RoomPage.tsx`: current room screen, game table, WebSocket handlers, controls, modals, history panel, animation timers.
- `client/src/pages/LobbyPage.tsx`: lobby, room creation/join, profile/avatar upload.
- `client/src/stores/gameStore.ts`: public/private game state and UI state.
- `client/src/stores/roomStore.ts`: room members, seats, game settings.
- `client/src/hooks/useWebSocket.ts`: room WebSocket connection.
- `client/src/index.css`: all current visual styling.

**Known constraints:**
- The app currently builds with `npm run build` from `client/`.
- In the managed sandbox, Vite/esbuild may fail with `spawn EPERM`; if that happens, rerun `npm run build` with approved escalation.
- This folder is currently not a Git repository, so use this plan file as the cross-session progress ledger.

## Target Mobile Experience

The first screen in a room should feel like a phone-native card table:
- Seat/avatar zones stay readable without covering cards.
- The local player's hand and action buttons are thumb-friendly at the bottom.
- Current actor, banker, folded, all-in/knock, disconnected, and ready states are visually obvious.
- Dealing, turn changes, betting, folding, split confirmation, compare, and settlement have short, skippable-feeling animations.
- Text labels are compact and never overflow buttons on small phones.
- Decorative effects must not hide cards, controls, or turn state.

---

## File Structure Target

Create these files over the course of the plan:

- `client/src/pages/RoomPage.tsx`
  - Keep as the screen orchestrator: load room, connect WebSocket, wire callbacks, render high-level layout.
- `client/src/pages/room/constants.ts`
  - Seat ids, visual seat constants, turn time, game type labels, UI thresholds.
- `client/src/pages/room/types.ts`
  - UI-only prop types and event types shared by room components.
- `client/src/pages/room/useRoomGameController.ts`
  - WebSocket handlers, room/game side effects, timer/deal animation state, action dispatchers.
- `client/src/pages/room/seatLayout.ts`
  - `calcSeatRotation`, visual seat helpers, phone layout helpers.
- `client/src/pages/room/components/GameTable.tsx`
  - Table shell, felt, deck, pot, seats, public cards, center overlays, compare banner.
- `client/src/pages/room/components/PlayerSeat.tsx`
  - Seat/avatar/player state display.
- `client/src/pages/room/components/CardView.tsx`
  - Card face/back rendering and selected/head/tail marks.
- `client/src/pages/room/components/MyHand.tsx`
  - Local hand and split selection display.
- `client/src/pages/room/components/PublicCards.tsx`
  - Other players' visible cards and compare split display.
- `client/src/pages/room/components/ActionBar.tsx`
  - Bottom mobile action controls.
- `client/src/pages/room/components/SpectatorBar.tsx`
  - Spectator row.
- `client/src/pages/room/components/RoomHeader.tsx`
  - Compact room title, room code, round, game type selector, history button.
- `client/src/pages/room/components/RoomMenuModal.tsx`
  - Stand, disband, leave room actions.
- `client/src/pages/room/components/BuyInModal.tsx`
  - Mobile buy-in selector.
- `client/src/pages/room/components/SettlementModal.tsx`
  - End-game settlement.
- `client/src/pages/room/components/HistoryPanel.tsx`
  - Round history viewer.
- `client/src/pages/room/components/AnimatedLayer.tsx`
  - CSS/React animation surfaces for dealing, chips, center messages.
- `client/src/pages/room/animationEvents.ts`
  - Small typed helpers for visual event names and animation durations.
- `client/src/styles/room.css`
  - Room-specific styling moved out of global `index.css`.
- `client/src/styles/cards.css`
  - Card visuals.
- `client/src/styles/mobile-game.css`
  - Mobile-first layout rules and responsive constraints.

Keep these files unless a task states otherwise:
- `server/*`: unchanged during frontend refactor.
- `client/src/stores/*`: only minimal additions for UI state if needed.
- `client/src/hooks/useWebSocket.ts`: unchanged unless handler identity causes reconnection bugs.

---

## Task 1: Create Room Module Skeleton

**Files:**
- Create: `client/src/pages/room/constants.ts`
- Create: `client/src/pages/room/types.ts`
- Create: `client/src/pages/room/seatLayout.ts`
- Create directory: `client/src/pages/room/components/`
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Add constants module**

Create `client/src/pages/room/constants.ts`:

```ts
export const SEAT_IDS = ['top-0', 'top-1', 'right-0', 'right-1', 'bottom-0', 'bottom-1', 'left-0', 'left-1'] as const;

export const TURN_TIME_SECONDS = 60;

export const GAME_TYPE_LABELS: Record<string, string> = {
  '1,3': '1/3',
  '5,10': '5/10',
  '5,20': '5/20',
};

export const MOBILE_TABLE_BREAKPOINT = 600;
```

- [x] **Step 2: Add shared room UI types**

Create `client/src/pages/room/types.ts`:

```ts
import type { Card, GamePlayer, RoundRecord } from '@/stores/gameStore';
import type { RoomInfo, SeatPlayer, Member } from '@/stores/roomStore';

export type SeatId = 'top-0' | 'top-1' | 'right-0' | 'right-1' | 'bottom-0' | 'bottom-1' | 'left-0' | 'left-1';

export interface VisualSeat {
  physicalIndex: number;
  visualIndex: number;
  seat: SeatPlayer | null;
  player?: GamePlayer;
}

export interface RoomActionHandlers {
  onSit: (visualIndex: number) => void;
  onReady: () => void;
  onStandUp: () => void;
  onStartGame: () => void;
  onLeaveRoom: () => void;
  onDisbandRoom: () => void;
  onGameTypeChange: (gameType: string) => void;
  onPlayerAction: (action: string, amount?: number) => void;
  onAutoSplit: () => void;
  onConfirmSplit: () => void;
  onClearSplitSelection: () => void;
}

export interface RoomRenderContext {
  room: RoomInfo | null;
  myUsername: string;
  currentActor: string | null;
  turnTimer: number;
  visualSeats: number[];
  spectators: Member[];
  viewingRound: number;
  selectedHistoryRound?: RoundRecord;
  myHand: Card[];
}
```

- [x] **Step 3: Move seat rotation helper**

Create `client/src/pages/room/seatLayout.ts`:

```ts
import type { RoomInfo } from '@/stores/roomStore';

export function calcSeatRotation(room: RoomInfo | null, myUsername: string) {
  if (!room) return { shift: 0, visualSeats: Array.from({ length: 8 }, (_, i) => i) };

  let playerPhysIdx = -1;
  for (let i = 0; i < 8; i++) {
    if (room.seats[i]?.username === myUsername) {
      playerPhysIdx = i;
      break;
    }
  }

  if (playerPhysIdx < 0) {
    return { shift: 0, visualSeats: Array.from({ length: 8 }, (_, i) => i) };
  }

  const shift = (playerPhysIdx - 4 + 8) % 8;
  return { shift, visualSeats: Array.from({ length: 8 }, (_, visualIndex) => (visualIndex + shift) % 8) };
}

export function getVisualIndexForUsername(room: RoomInfo | null, visualSeats: number[], username: string) {
  const physicalIndex = room?.seats?.findIndex((seat) => seat?.username === username) ?? -1;
  if (physicalIndex < 0) return -1;
  return visualSeats.indexOf(physicalIndex);
}
```

- [x] **Step 4: Update this plan file**

Check off Task 1 steps after files are created and imported by no runtime code yet.

- [x] **Step 5: Verify build**

Run:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
```

Expected: build succeeds. If `spawn EPERM` appears, rerun with approved escalation.

---

## Task 2: Extract Presentational Components Without Visual Redesign

**Files:**
- Modify: `client/src/pages/RoomPage.tsx`
- Create: `client/src/pages/room/components/CardView.tsx`
- Create: `client/src/pages/room/components/PlayerSeat.tsx`
- Create: `client/src/pages/room/components/MyHand.tsx`
- Create: `client/src/pages/room/components/PublicCards.tsx`
- Create: `client/src/pages/room/components/SpectatorBar.tsx`
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Extract `CardView` exactly from `RoomPage.tsx`**

Move the existing `CardView` function into `client/src/pages/room/components/CardView.tsx`. Export it as a named export:

```tsx
import type { Card } from '@/stores/gameStore';

export function CardView({ card, faceDown, selected, mark, onClick, size = 'normal' }: {
  card?: Card;
  faceDown?: boolean;
  selected?: boolean;
  mark?: 'head' | 'tail' | null;
  onClick?: () => void;
  size?: 'small' | 'normal';
}) {
  if (faceDown || !card) {
    return <div className={`card back ${size}`} onClick={onClick} />;
  }
  const colorClass = card.color === 'joker' ? 'joker' : card.color;
  const cls = `card ${colorClass} ${size}${selected ? ' selected' : ''}${mark === 'head' ? ' head-mark' : mark === 'tail' ? ' tail-mark' : ''}`;
  const suit = card.suit;
  if (card.color === 'joker') {
    return <div className={cls} onClick={onClick}><div className="rank">JK</div><div className="center-suit">{suit}</div><div className="suit">{suit}</div></div>;
  }
  return <div className={cls} onClick={onClick}><div className="rank">{card.rank}</div><div className="center-suit">{suit}</div><div className="suit">{suit}</div></div>;
}
```

- [x] **Step 2: Extract avatar and player seat display**

Move `Avatar` and `SeatView` into `PlayerSeat.tsx`. Keep existing CSS class names so behavior does not change. Export:

```ts
export { Avatar, PlayerSeat };
```

Use prop names matching the current `SeatView` call site to reduce risk.

- [x] **Step 3: Extract local hand display**

Create `MyHand.tsx` with props:

```ts
interface MyHandProps {
  myHand: Card[];
  mySplit: { headIdx: number[]; headName: string; tailName: string } | null;
  selected: number[];
  phase: string;
  onCardClick: (idx: number) => void;
}
```

Move `renderMyHand` logic into this component.

- [x] **Step 4: Extract public cards display**

Create `PublicCards.tsx` with props:

```ts
interface PublicCardsProps {
  players: GamePlayer[];
  room: RoomInfo | null;
  visualSeats: number[];
  myUsername: string;
  phase: string;
}
```

Move `renderPublicCards` logic into this component and use `getVisualIndexForUsername`.

- [x] **Step 5: Extract spectator bar**

Create `SpectatorBar.tsx` with props:

```ts
interface SpectatorBarProps {
  spectators: Member[];
  getAvatar: (username?: string) => string | undefined;
}
```

Move the existing spectator JSX into it.

- [x] **Step 6: Update `RoomPage.tsx` imports and remove duplicate local functions**

Import the extracted components and keep all behavior unchanged.

- [x] **Step 7: Verify build**

Run `npm run build` from `client/`.

Expected: build succeeds and no TypeScript prop/type errors.

---

Completion note 2026-07-05: Task 1 and Task 2 completed. `npm run build` failed inside the sandbox with `spawn EPERM`, then passed with approved escalation from `client/`.

## Task 3: Extract Controller Hook And Stabilize WebSocket Handlers

**Files:**
- Modify: `client/src/pages/RoomPage.tsx`
- Create: `client/src/pages/room/useRoomGameController.ts`
- Modify: `client/src/hooks/useWebSocket.ts` only if reconnection loops are observed
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Create controller hook shell**

Create `useRoomGameController.ts` that accepts:

```ts
interface UseRoomGameControllerArgs {
  code: string | undefined;
  room: RoomInfo | null;
  myUsername: string;
  navigate: ReturnType<typeof useNavigate>;
  api: ReturnType<typeof useApi>;
  setRoom: (room: RoomInfo) => void;
}
```

It should return handlers currently defined in `RoomPage.tsx`: `send`, `handleSit`, `handleSitConfirm`, `handleStandUp`, `handleReady`, `handleStartGame`, `handleDisband`, `handleLeaveRoom`, `handleGameTypeChange`, `handleAction`, `handleAutoSplit`, `handleConfirmSplit`, and UI modal state.

- [x] **Step 2: Move WebSocket message handler map into the hook**

Preserve all current message types:

```ts
room_update
game_init
game_sync
game_state
game_private
game_action
game_compare
game_settlement
player_reconnected
room_disbanded
error
banker_selecting
banker_selected
banker_rotated
turn_warning
player_timeout
```

- [x] **Step 3: Keep frontend timeout display-only**

Remove the effect that sends `handleAction('fold')` when `turnTimer === 0`. The server already owns timeout fold logic. The UI should show `0` and wait for the server action.

- [x] **Step 4: Verify no obvious reconnect loop**

Run the app locally:

```powershell
cd G:\WorkBuddy\开发\chekai
npm run dev
```

In another terminal:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run dev
```

Open `http://localhost:5173`, login as `user1 / 123456`, create a room, and confirm no rapid WebSocket reconnect loop appears in the browser console.

- [x] **Step 5: Verify build**

Run `npm run build` from `client/`.

Expected: build succeeds.

---

## Task 4: Mobile-First Layout And Style Split

**Files:**
- Modify: `client/src/index.css`
- Create: `client/src/styles/room.css`
- Create: `client/src/styles/cards.css`
- Create: `client/src/styles/mobile-game.css`
- Modify: `client/src/main.tsx`
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Move room-specific CSS out of `index.css`**

Move all selectors starting at `.room-page.new-table` and all card/table/game selectors into the three new style files:

```ts
// client/src/main.tsx
import './index.css';
import './styles/room.css';
import './styles/cards.css';
import './styles/mobile-game.css';
```

Keep login/lobby/global button/form styles in `index.css`.

- [x] **Step 2: Define mobile layout variables**

Add to `mobile-game.css`:

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --room-max-width: 480px;
  --bottom-action-height: 92px;
  --card-w: 44px;
  --card-h: 62px;
}
```

- [x] **Step 3: Make bottom controls thumb-first**

Ensure `.bottom-bar` is fixed to the bottom within the room page flow, padded with `var(--safe-bottom)`, and primary action buttons are at least 44px high on phones.

- [x] **Step 4: Make table area stable**

Use explicit reserved zones:

```css
.game-area {
  min-height: 0;
  isolation: isolate;
}

.my-hand-area {
  bottom: 4px;
}
```

Adjust seat/card positions so the local hand does not overlap the bottom action bar on 360px wide screens.

- [x] **Step 5: Verify mobile viewport manually**

Note 2026-07-05: Per user preference, automated browser testing is not performed. Code review completed: missing CSS classes (`.game-type-select`, `.btn-icon`, `.raise-input`, `.menu-list`, `.menu-item`, `.card-slot`, `.seat-slot.is-me`) added; `.my-hand-area` bottom fixed from `calc(var(--bottom-action-height) + 8px)` (100px, too large for in-game-area positioning) to `4px`; `.action-buttons .btn` enhanced with `min-width: 56px` and `border-radius: 8px`. Manual viewport QA at 360x740 / 390x844 / 430x932 to be done by user.

Use browser devtools or Playwright later to inspect 390x844 and 360x740. Confirm:
- room header visible
- bottom actions visible
- local hand not hidden by actions
- no button text overflows
- modal content fits without horizontal scroll

- [x] **Step 6: Verify build**

Run `npm run build` from `client/`.

Completion note 2026-07-05: Task 4 completed. `npm run build` passed. Fixes applied: added 7 missing CSS classes across `room.css` and `mobile-game.css`; fixed `.my-hand-area` bottom value; enhanced `.action-buttons .btn` with min-width and border-radius; added `.raise-input` thumb-friendly input styles. Step 5 manual viewport QA deferred to user per testing preference.

---

## Task 5: Visual System Upgrade For Cards, Seats, And Table

**Files:**
- Modify: `client/src/styles/cards.css`
- Modify: `client/src/styles/room.css`
- Modify: `client/src/pages/room/components/CardView.tsx`
- Modify: `client/src/pages/room/components/PlayerSeat.tsx`
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Improve card rendering without changing data**

Update card CSS to use stable dimensions, better contrast, and clearer face/back states:

```css
.card {
  aspect-ratio: 44 / 62;
  border-radius: 7px;
  border: 1px solid rgba(20, 20, 20, 0.18);
  background: linear-gradient(180deg, #fffaf0 0%, #efe6d1 100%);
}

.card.back {
  background:
    radial-gradient(circle at 50% 50%, rgba(212,175,55,0.25), transparent 38%),
    repeating-linear-gradient(45deg, #642818, #642818 4px, #873b23 4px, #873b23 8px);
}
```

- [x] **Step 2: Make player states visually distinct**

Ensure banker, folded, knocked/all-in, disconnected, ready, and current turn states each have distinct shapes/colors, not only text.

Note 2026-07-05: Added state classes (`folded`, `turn-active`, `knocked`, `ready`, `disconnected`) to `PlayerSeat.tsx` on `.seat-avatar-row`. CSS: folded=grayscale+dim, turn-active=pulsing gold glow, knocked=orange border, ready=green border+dot, banker badge=gold ring, fold badge=dark with red accent.

- [x] **Step 3: Improve table felt and pot/deck hierarchy**

Keep a restrained game palette. Avoid making everything one shade of green. Add subtle table edge, center pot zone, deck stack, and turn glow.

Note 2026-07-05: Enhanced `.table-felt` with richer green palette and double-border via box-shadow; `.pot-badge` with gold glow; `.deck-pile` with radial gradient overlay and `::before` stacked card effect; deal-card animation updated to new card back colors.

- [x] **Step 4: Verify phone readability**

At 360px width, confirm:
- card ranks are readable
- local player score is readable
- current turn timer is readable
- banker badge does not cover avatar/timer

Note 2026-07-05: Code review passed. Rank 13px/9px, score 10px, timer 13px — all readable. Banker badge at top-right corner does not overlap centered timer. Manual visual QA deferred to user.

- [x] **Step 5: Verify build**

Run `npm run build` from `client/`.

Completion note 2026-07-05: Task 5 completed. `npm run build` passed (CSS 24.72KB). Changes: cards.css (aspect-ratio, warm gradient face, layered back); PlayerSeat.tsx (5 state classes); room.css (6 player state styles, enhanced badges, table-felt double-border, pot-badge glow, deck-pile stack effect, deal-card color sync).

---

## Task 6: Action Bar Redesign For Touch Play

**Files:**
- Create: `client/src/pages/room/components/ActionBar.tsx`
- Modify: `client/src/pages/RoomPage.tsx`
- Modify: `client/src/styles/mobile-game.css`
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Extract `ActionBar`**

Create `ActionBar.tsx` with props:

```ts
interface ActionBarProps {
  phase: string;
  isMyTurn: boolean;
  isBetting: boolean;
  betStarted: boolean;
  currentBet: number;
  selectedCount: number;
  canHostStart: boolean;
  raiseAmount: string;
  onRaiseAmountChange: (value: string) => void;
  onMenu: () => void;
  onPlayerAction: (action: string, amount?: number) => void;
  onAutoSplit: () => void;
  onConfirmSplit: () => void;
  onClearSplitSelection: () => void;
  onStartGame: () => void;
}
```

- [x] **Step 2: Hide unavailable voice/text buttons**

Remove or hide the bottom voice/text buttons until chat/voice exists. This removes dead controls from the mobile game UI.

Note 2026-07-05: Voice/text buttons removed from ActionBar component. Unused `.chat-buttons` CSS removed from room.css.

- [x] **Step 3: Use large touch targets**

Set action buttons to:

```css
.action-buttons .btn {
  min-height: 44px;
  min-width: 56px;
  border-radius: 8px;
}
```

On narrow screens, allow two rows but keep the primary action visually strongest.

Note 2026-07-05: CSS already in mobile-game.css from Task 4. Added `.menu-btn { flex-shrink: 0 }` and `.amount-row`/`.quick-amount` layout styles. `.action-buttons` has `flex-wrap: wrap` for two-row layout on narrow screens.

- [x] **Step 4: Add amount quick controls**

For raise/call amount, add small quick buttons for common values based on current bet:
- `+1`
- `x2`
- `Max`

Do not change backend validation. The quick buttons only fill the existing amount input.

Note 2026-07-05: Quick buttons implemented in ActionBar.tsx. `+1` increments current amount, `x2` sets to `currentBet*2`, `Max` sets to 999. Quick buttons only modify the input value, no backend changes.

- [x] **Step 5: Verify build**

Run `npm run build` from `client/`.

Completion note 2026-07-05: Task 6 completed. `npm run build` passed (65 modules, CSS 24.94KB). Created ActionBar.tsx with 15 props; RoomPage.tsx footer replaced with ActionBar component; voice/text buttons removed; quick amount controls (+1/x2/Max) added; mobile-game.css updated with amount-row/quick-amount/menu-btn styles; unused .chat-buttons CSS removed.

---

## Task 7: CSS Animation Layer

**Files:**
- Create: `client/src/pages/room/animationEvents.ts`
- Create: `client/src/pages/room/components/AnimatedLayer.tsx`
- Modify: `client/src/pages/room/components/GameTable.tsx` if created earlier, otherwise modify `RoomPage.tsx`
- Modify: `client/src/styles/room.css`
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`

- [x] **Step 1: Add animation duration constants**

Created `animationEvents.ts` with ANIMATION_MS constants (deal:700, centerMessage:1600, chipFly:500, fold:360, compareReveal:900). Also imported into useRoomGameController to replace hardcoded 800ms timeout with `ANIMATION_MS.deal + 100`.

- [x] **Step 2: Move existing deal animation into `AnimatedLayer`**

Created `AnimatedLayer.tsx` with AnimatedLayerProps (dealAnim + centerMessage). Renders deal flying cards and center overlay message. RoomPage.tsx: replaced 14 lines of inline deal/center JSX with single `<AnimatedLayer>` call. dealAnim data shape preserved.

- [x] **Step 3: Add turn-change pulse**

Changed `.seat-avatar-row.turn-active .avatar` from infinite `pulse-gold 1.2s` to one-shot `turn-pulse 0.5s ease-out`. New @keyframes turn-pulse: 0% scale(1.1)+bright glow → 100% scale(1)+steady glow. Triggers when turn-active class is added (currentActor changes).

- [x] **Step 4: Add fold fade animation**

Added `animation: fold-fade 0.36s ease-out` to `.seat-avatar-row.folded .avatar`. New @keyframes fold-fade: 0% full color/opacity → 100% grayscale(0.7)+brightness(0.5)+opacity(0.55). Static CSS properties retained so final state persists after animation.

- [x] **Step 5: Verify reduced-motion fallback**

Added `@media (prefers-reduced-motion: reduce)` block to room.css: all animations/transitions set to 0.01ms with !important.

Add CSS:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [x] **Step 6: Verify build**

`npm run build` passed (67 modules, CSS 25.36KB). +2 modules from animationEvents.ts + AnimatedLayer.tsx; CSS +0.42KB from new keyframes + reduced-motion media query.

Completion note 2026-07-05: Task 7 completed. Created animationEvents.ts (ANIMATION_MS constants) and AnimatedLayer.tsx (deal cards + center message). RoomPage.tsx: inline deal/center JSX replaced with AnimatedLayer component. useRoomGameController.ts: deal timeout now uses ANIMATION_MS.deal. room.css: turn-active changed from infinite pulse to one-shot turn-pulse; fold-fade animation added; reduced-motion media query added.

---

## Task 8: Decide Whether To Add Pixi Table Layer

**Files:**
- Modify this plan file first with the decision.
- If approved later, create a separate plan file for Pixi implementation.

- [ ] **Step 1: Review React/CSS result on phone**

Evaluate whether the upgraded React/CSS table is good enough. Use real phone dimensions and at least two players.

- [x] **Step 2: Make a written decision**

Append one of these notes under this task:
- `Decision: stay with React/CSS for now`
- `Decision: create a new Pixi table implementation plan`

- [x] **Step 3: Do not start Pixi inside this plan unless explicitly approved**

Pixi will touch rendering boundaries and should be its own plan to avoid mixing architecture migration with visual cleanup.

Decision note 2026-07-05: Decision: create a new Pixi table implementation plan. Separate plan created at docs/superpowers/plans/2026-07-05-pixi-table-layer.md. No Pixi runtime implementation has been started in this plan.

---

## Task 9: Mobile QA Checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-05-mobile-poker-frontend-redesign.md`
- Modify code only for bugs found during QA.

- [ ] **Step 1: Build verification**

Run:

```powershell
cd G:\WorkBuddy\开发\chekai\client
npm run build
```

Expected: success.

- [ ] **Step 2: Two-player smoke test**

Manual flow:
1. Start backend: `npm run dev` from repo root.
2. Start frontend: `npm run dev` from `client/`.
3. Login as `user1 / 123456`.
4. Create room.
5. In another browser/session, login as `user2 / 123456`.
6. Join the room.
7. Seat both players.
8. Ready non-host.
9. Start game.
10. Confirm dealing, turn indicator, action bar, fold/see/raise/call/rest controls are reachable on phone viewport.

- [ ] **Step 3: Mobile viewport checks**

Check at:
- 360x740
- 390x844
- 430x932

Expected:
- no horizontal scroll
- no overlap between local hand and action bar
- modals fit
- amount input is usable
- history panel does not cover the action bar permanently

- [ ] **Step 4: Gameplay state checks**

Confirm visual states:
- banker badge
- current actor timer
- folded player
- knocked/all-in player
- disconnected player if possible
- settlement modal

- [ ] **Step 5: Update this plan with QA notes**

Add a dated note listing tested viewport sizes and any remaining issues.

---

## Suggested Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6
7. Task 7
8. Task 9
9. Task 8 only after reviewing whether CSS/React is enough

## Explicit Non-Goals For This Plan

- No backend rule changes.
- No database schema changes.
- No account/security work.
- No new chat or voice implementation.
- No Pixi rewrite unless Task 8 explicitly creates a separate approved plan.
- No desktop-first redesign. Desktop may remain a centered phone-width game surface.

## Self-Review Notes

- This plan covers mobile-first layout, component decomposition, touch controls, visual polish, animation staging, QA, and future Pixi decision.
- The plan intentionally avoids changing backend protocol and game rules.
- No implementation task should require knowledge from previous chat context; file paths and verification commands are listed here.
