export const ANIMATION_MS = {
  deal: 700,
  centerMessage: 1600,
  chipFly: 550,
  /** 筹码入底池后，稍停再飞向赢家 */
  potHold: 320,
  fold: 360,
  compareReveal: 900,
} as const;

const SEAT_STAGGER_MS = 160;
/** 底池→赢家 启动后，再隔多久开始输家→赢家 */
const AFTER_POT_TO_WINNER_MS = 220;

/**
 * 结算飞筹时间轴起点（相对 game_compare）：
 * - all_folded：先等弃牌入池飞完 + 停顿
 * - 其它：短停顿即可
 */
export function settleAnimBaseDelayMs(reason?: string | null): number {
  if (reason === 'all_folded') {
    return ANIMATION_MS.chipFly + ANIMATION_MS.potHold;
  }
  return ANIMATION_MS.potHold;
}

/** 与服务端 settle-anim-gate 估时对齐，用于本地播完后 ACK */
export function estimateSettleChipAnimMs(result?: {
  reason?: string | null;
  winner?: string | null;
  results?: Record<string, { lastDelta?: number } | null>;
} | null): number {
  if (!result) return 0;
  if (result.reason === 'rest_cross') return 0;
  const winner = result.winner;
  if (!winner) return 0;
  const results = result.results || {};
  let losers = 0;
  for (const [uname, r] of Object.entries(results)) {
    if (uname === winner) continue;
    if ((r?.lastDelta ?? 0) < 0) losers += 1;
  }
  const chip = ANIMATION_MS.chipFly;
  const base = settleAnimBaseDelayMs(result.reason);
  // all_folded / all_sanhua：只有底池→赢家，不再 seat_to_seat
  if (result.reason === 'all_folded' || result.reason === 'all_sanhua') {
    return base + chip + 80;
  }
  let end = base + chip;
  if (losers > 0) {
    end = Math.max(
      end,
      base + AFTER_POT_TO_WINNER_MS + SEAT_STAGGER_MS * Math.max(0, losers - 1) + chip,
    );
  }
  return end + 80;
}

export const SETTLE_ANIM_TIMING = {
  SEAT_STAGGER_MS,
  AFTER_POT_TO_WINNER_MS,
} as const;
