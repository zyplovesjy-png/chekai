/**
 * Room SFX — Kenney Casino Audio (CC0) under /game/sounds/,
 * with Web Audio procedural fallback.
 * Credit: Kenney.nl (optional under CC0)
 */

type SfxKind = 'deal' | 'chip' | 'fold' | 'knock' | 'warn' | 'win';

const FILE_CANDIDATES: Record<SfxKind, string[]> = {
  deal: ['card-place-1.ogg', 'card-place-2.ogg', 'card-place-3.ogg', 'card-slide-1.ogg'],
  chip: ['chips-collide-1.ogg', 'chips-collide-2.ogg', 'chips-stack-1.ogg', 'chip-lay-1.ogg'],
  fold: ['card-shove-1.ogg', 'card-slide-2.ogg'],
  knock: ['chips-stack-3.ogg', 'chips-handle-1.ogg'],
  warn: ['card-fan-1.ogg', 'die-throw-1.ogg'],
  win: ['chips-stack-5.ogg', 'chips-handle-3.ogg'],
};

const SOUND_BASE = '/game/sounds/';

let unlocked = false;
let audioCtx: AudioContext | null = null;
const buffers = new Map<SfxKind, AudioBuffer[]>();
const missing = new Set<SfxKind>();
let loadPromise: Promise<void> | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Call once on first user gesture so mobile browsers allow audio. */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  const ctx = getCtx();
  if (ctx) {
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }
  void ensureFilesLoaded();
}

async function ensureFilesLoaded() {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const ctx = getCtx();
    if (!ctx) return;
    const kinds = Object.keys(FILE_CANDIDATES) as SfxKind[];
    await Promise.all(
      kinds.map(async (kind) => {
        const loaded: AudioBuffer[] = [];
        for (const name of FILE_CANDIDATES[kind]) {
          try {
            const res = await fetch(SOUND_BASE + name);
            if (!res.ok) continue;
            const arr = await res.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arr.slice(0));
            loaded.push(decoded);
          } catch {
            /* try next */
          }
        }
        if (loaded.length) buffers.set(kind, loaded);
        else missing.add(kind);
      }),
    );
  })();
  return loadPromise;
}

function playBuffer(kind: SfxKind, volume = 0.35) {
  const list = buffers.get(kind);
  const ctx = getCtx();
  if (!list?.length || !ctx) return false;
  const buf = list[Math.floor(Math.random() * list.length)];
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = volume;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start(0);
  return true;
}

function playProcedural(kind: SfxKind) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);

  const blip = (freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + delay);
    g.gain.setValueAtTime(vol, now + delay);
    g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(now + delay);
    osc.stop(now + delay + dur + 0.02);
  };

  const noiseBurst = (dur: number, vol: number, delay = 0) => {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = kind === 'chip' ? 1800 : 900;
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(now + delay);
  };

  switch (kind) {
    case 'deal':
      noiseBurst(0.06, 0.22);
      blip(420, 0.05, 'triangle', 0.08, 0.01);
      break;
    case 'chip':
      noiseBurst(0.05, 0.18);
      blip(880, 0.04, 'sine', 0.1, 0.01);
      blip(1320, 0.03, 'sine', 0.06, 0.03);
      break;
    case 'fold':
      noiseBurst(0.1, 0.16);
      blip(220, 0.12, 'sawtooth', 0.05);
      break;
    case 'knock':
      blip(140, 0.08, 'square', 0.12);
      blip(90, 0.12, 'sine', 0.1, 0.05);
      noiseBurst(0.08, 0.14, 0.02);
      break;
    case 'warn':
      blip(880, 0.12, 'triangle', 0.12);
      blip(660, 0.15, 'triangle', 0.1, 0.14);
      break;
    case 'win':
      blip(523, 0.1, 'sine', 0.1);
      blip(659, 0.1, 'sine', 0.1, 0.08);
      blip(784, 0.18, 'sine', 0.12, 0.16);
      break;
  }
}

function play(kind: SfxKind, volume?: number) {
  if (!unlocked) unlockAudio();
  if (playBuffer(kind, volume)) return;
  if (missing.has(kind)) {
    playProcedural(kind);
    return;
  }
  void ensureFilesLoaded().then(() => {
    if (!playBuffer(kind, volume)) playProcedural(kind);
  });
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
