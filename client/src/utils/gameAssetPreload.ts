/**
 * Lobby game-asset preload (cards + SFX). Shares Cache Storage with SW chekai-game-v1.
 * Enter room → pause; return lobby → check cache and fill gaps.
 */

import { CARD_BACK_URL } from '@/pages/room/cardAssets';

const GAME_CACHE = 'chekai-game-v1';
const CONCURRENCY = 3;

/** Same files as cardAssets ID_TO_FILE (+ back). */
const CARD_FILES = [
  'heart_queen',
  'diamond_queen',
  'heart_2',
  'diamond_2',
  'heart_8',
  'diamond_8',
  'heart_4',
  'diamond_4',
  'spade_10',
  'club_10',
  'spade_4',
  'club_4',
  'spade_6',
  'club_6',
  'spade_jack',
  'club_jack',
  'heart_10',
  'diamond_10',
  'heart_6',
  'diamond_6',
  'heart_7',
  'diamond_7',
  'spade_9',
  'club_9',
  'spade_8',
  'club_8',
  'spade_7',
  'club_7',
  'spade_5',
  'club_5',
  'heart_3',
  'joker_red',
];

/** Same candidates as sounds.ts FILE_CANDIDATES. */
const SOUND_FILES = [
  'card-place-1.mp3',
  'card-place-2.mp3',
  'card-place-3.mp3',
  'card-slide-1.mp3',
  'chips-collide-1.mp3',
  'chips-collide-2.mp3',
  'chips-stack-1.mp3',
  'chip-lay-1.mp3',
  'card-shove-1.mp3',
  'card-slide-2.mp3',
  'chips-stack-3.mp3',
  'chips-handle-1.mp3',
  'card-fan-1.mp3',
  'die-throw-1.mp3',
  'chips-stack-5.mp3',
  'chips-handle-3.mp3',
];

export type GameAssetPreloadState = {
  /** 0–1 */
  progress: number;
  ready: boolean;
  loading: boolean;
};

type Listener = (state: GameAssetPreloadState) => void;

const listeners = new Set<Listener>();

let state: GameAssetPreloadState = { progress: 0, ready: false, loading: false };
let runId = 0;
let abort: AbortController | null = null;
let paused = false;

function toAbs(path: string): string {
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

function assetUrls(): string[] {
  const cards = CARD_FILES.map((f) => toAbs(`/game/cards/${f}.png`));
  const sounds = SOUND_FILES.map((f) => toAbs(`/game/sounds/${f}`));
  return [...cards, toAbs(CARD_BACK_URL), ...sounds];
}

function emit() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch {
      /* ignore */
    }
  }
}

function setState(patch: Partial<GameAssetPreloadState>) {
  state = { ...state, ...patch };
  emit();
}

export function getGameAssetPreloadState(): GameAssetPreloadState {
  return state;
}

export function subscribeGameAssetPreload(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

async function openGameCache(): Promise<Cache | null> {
  try {
    if (!('caches' in window)) return null;
    return await caches.open(GAME_CACHE);
  } catch {
    return null;
  }
}

async function isCached(cache: Cache | null, url: string): Promise<boolean> {
  if (!cache) return false;
  try {
    return !!(await cache.match(url));
  } catch {
    return false;
  }
}

async function fetchIntoCache(cache: Cache | null, url: string, signal: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(url, { signal, credentials: 'same-origin' });
    if (!res.ok) return false;
    if (cache) {
      try {
        await cache.put(url, res.clone());
      } catch {
        /* SW may also put; ignore quota errors */
      }
    }
    return true;
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') throw e;
    return false;
  }
}

/**
 * Pause lobby preload (call when entering a room) so room fetches get bandwidth.
 * Does not clear cache.
 */
export function pauseGameAssetPreload() {
  paused = true;
  runId += 1;
  abort?.abort();
  abort = null;
  if (state.loading) {
    setState({ loading: false });
  }
}

/**
 * Start or resume preload: skip cached URLs, fill gaps. Safe to call on every lobby mount.
 */
export function startGameAssetPreload() {
  paused = false;
  void runPreload();
}

async function runPreload() {
  const myRun = ++runId;
  abort?.abort();
  abort = new AbortController();
  const { signal } = abort;

  const urls = assetUrls();
  const total = urls.length;
  if (total === 0) {
    setState({ progress: 1, ready: true, loading: false });
    return;
  }

  const cache = await openGameCache();
  let done = 0;
  const pending: string[] = [];

  for (const url of urls) {
    if (await isCached(cache, url)) done += 1;
    else pending.push(url);
  }

  const progress = done / total;
  if (pending.length === 0) {
    setState({ progress: 1, ready: true, loading: false });
    return;
  }

  setState({ progress, ready: false, loading: true });

  let cursor = 0;

  const worker = async () => {
    while (cursor < pending.length) {
      if (paused || signal.aborted || myRun !== runId) return;
      const i = cursor++;
      const url = pending[i];
      try {
        const ok = await fetchIntoCache(cache, url, signal);
        if (ok) done += 1;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
      if (myRun !== runId) return;
      setState({
        progress: Math.min(1, done / total),
        ready: done >= total,
        loading: true,
      });
    }
  };

  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  } catch {
    /* aborted */
  }

  if (myRun !== runId || paused || signal.aborted) return;

  const finalReady = done >= total;
  setState({
    progress: Math.min(1, done / total),
    ready: finalReady,
    loading: false,
  });

  // Retry missing once after a short delay if not fully ready
  if (!finalReady && !paused) {
    setTimeout(() => {
      if (!paused && myRun === runId) void runPreload();
    }, 2000);
  }
}
