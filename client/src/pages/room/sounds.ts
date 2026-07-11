/**
 * Room SFX — Kenney Casino Audio (CC0) MP3 under /game/sounds/.
 * HTMLAudio primary (iOS); Web Audio decode optional. No procedural beeps.
 */

type SfxKind = 'deal' | 'chip' | 'fold' | 'knock' | 'warn' | 'win';

const FILE_CANDIDATES: Record<SfxKind, string[]> = {
  deal: ['card-place-1.mp3', 'card-place-2.mp3', 'card-place-3.mp3', 'card-slide-1.mp3'],
  chip: ['chips-collide-1.mp3', 'chips-collide-2.mp3', 'chips-stack-1.mp3', 'chip-lay-1.mp3'],
  fold: ['card-shove-1.mp3', 'card-slide-2.mp3'],
  knock: ['chips-stack-3.mp3', 'chips-handle-1.mp3'],
  warn: ['card-fan-1.mp3', 'die-throw-1.mp3'],
  win: ['chips-stack-5.mp3', 'chips-handle-3.mp3'],
};

const SOUND_BASE = '/game/sounds/';
const SFX_ENABLED_KEY = 'chekai-sfx-enabled';

let unlocked = false;
let audioCtx: AudioContext | null = null;
const buffers = new Map<SfxKind, AudioBuffer[]>();
/** url list per kind after successful HEAD/GET check */
const readyUrls = new Map<SfxKind, string[]>();
let loadPromise: Promise<void> | null = null;
let sfxEnabled = readEnabled();

function readEnabled(): boolean {
  try {
    const v = localStorage.getItem(SFX_ENABLED_KEY);
    if (v === null) return true;
    return v !== '0' && v !== 'false';
  } catch {
    return true;
  }
}

export function isSfxEnabled() {
  return sfxEnabled;
}

export function setSfxEnabled(on: boolean) {
  sfxEnabled = !!on;
  try {
    localStorage.setItem(SFX_ENABLED_KEY, sfxEnabled ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('chekai-sfx-changed', { detail: { enabled: sfxEnabled } }));
}

export function toggleSfxEnabled() {
  setSfxEnabled(!sfxEnabled);
  if (sfxEnabled) unlockAudio();
  return sfxEnabled;
}

function soundUrl(file: string): string {
  return new URL(SOUND_BASE + file, window.location.origin).href;
}

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function resumeSync(): AudioContext | null {
  const ctx = getCtx();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try {
      void ctx.resume();
    } catch {
      /* ignore */
    }
  }
  return ctx;
}

async function ensureRunning(): Promise<AudioContext | null> {
  const ctx = resumeSync();
  if (!ctx) return null;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      return null;
    }
  }
  return ctx;
}

function makeHtmlAudio(url: string): HTMLAudioElement {
  const el = new Audio(url);
  el.preload = 'auto';
  el.setAttribute('playsinline', 'true');
  el.setAttribute('webkit-playsinline', 'true');
  return el;
}

/** Call inside user gesture. Safe to call repeatedly. */
export function unlockAudio() {
  const ctx = resumeSync();
  if (ctx) {
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }
  }

  try {
    const probe = makeHtmlAudio(soundUrl(FILE_CANDIDATES.deal[0]));
    probe.muted = true;
    probe.volume = 0;
    const p = probe.play();
    if (p && typeof p.then === 'function') {
      void p
        .then(() => {
          probe.pause();
          probe.currentTime = 0;
        })
        .catch(() => {});
    }
  } catch {
    /* ignore */
  }

  unlocked = true;
  void ensureFilesLoaded();
}

export function isAudioUnlocked() {
  return unlocked;
}

async function ensureFilesLoaded() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const kinds = Object.keys(FILE_CANDIDATES) as SfxKind[];

    await Promise.all(
      kinds.map(async (kind) => {
        const urls: string[] = [];
        for (const name of FILE_CANDIDATES[kind]) {
          const url = soundUrl(name);
          try {
            const res = await fetch(url, { cache: 'force-cache' });
            if (!res.ok) continue;
            // Warm browser media cache
            const blob = await res.blob();
            if (!blob.size) continue;
            const objUrl = URL.createObjectURL(blob);
            urls.push(objUrl);
          } catch {
            /* try next file */
          }
        }
        if (urls.length) readyUrls.set(kind, urls);
      }),
    );

    const ctx = await ensureRunning();
    if (!ctx) return;

    await Promise.all(
      kinds.map(async (kind) => {
        const urls = readyUrls.get(kind);
        if (!urls?.length) return;
        const loaded: AudioBuffer[] = [];
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const arr = await res.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arr.slice(0));
            loaded.push(decoded);
          } catch {
            /* skip */
          }
        }
        if (loaded.length) buffers.set(kind, loaded);
      }),
    );
  })();
  return loadPromise;
}

function pickUrl(kind: SfxKind): string | null {
  const ready = readyUrls.get(kind);
  if (ready?.length) return ready[Math.floor(Math.random() * ready.length)];
  const files = FILE_CANDIDATES[kind];
  if (!files?.length) return null;
  return soundUrl(files[Math.floor(Math.random() * files.length)]);
}

/** Always new Audio(src) — cloneNode is unreliable on iOS. */
function playHtml(kind: SfxKind, volume: number): boolean {
  const url = pickUrl(kind);
  if (!url) return false;
  try {
    const el = makeHtmlAudio(url);
    el.volume = Math.min(1, Math.max(0, volume));
    const p = el.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        /* autoplay blocked — next gesture unlock will help */
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function playBuffer(kind: SfxKind, volume: number): Promise<boolean> {
  const list = buffers.get(kind);
  const ctx = await ensureRunning();
  if (!list?.length || !ctx || ctx.state === 'suspended') return false;
  try {
    const buf = list[Math.floor(Math.random() * list.length)];
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buf;
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    return true;
  } catch {
    return false;
  }
}

function play(kind: SfxKind, volume = 0.35) {
  if (!sfxEnabled) return;
  if (!unlocked) unlockAudio();
  else resumeSync();

  // File SFX only — never synthetic beeps
  if (playHtml(kind, volume)) {
    void ensureFilesLoaded();
    return;
  }
  void (async () => {
    await ensureFilesLoaded();
    if (!sfxEnabled) return;
    if (playHtml(kind, volume)) return;
    await playBuffer(kind, volume);
  })();
}

let lastDealAt = 0;
export function playDealSound() {
  const t = performance.now();
  if (t - lastDealAt < 55) return;
  lastDealAt = t;
  play('deal', 0.28);
}

let lastChipAt = 0;
export function playChipSound() {
  const t = performance.now();
  if (t - lastChipAt < 70) return;
  lastChipAt = t;
  play('chip', 0.32);
}

export function playFoldSound() {
  play('fold', 0.3);
}

export function playKnockSound() {
  play('knock', 0.38);
}

export function playWarnSound() {
  play('warn', 0.35);
}

export function playWinSound() {
  play('win', 0.34);
}
