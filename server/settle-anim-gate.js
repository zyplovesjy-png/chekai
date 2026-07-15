/**
 * 局末筹码动画闸门：
 * A) 至少等 max(1.5s, 预估飞筹时长)
 * B) 在线客户端 settle_anim_done 齐了可提前到 minWait；否则等到 maxWait 兜底
 */

const SETTLE_MIN_MS = 1500;
const SETTLE_MAX_MS = 4000;
const CHIP_FLY_MS = 550;
const POT_HOLD_MS = 320;
const AFTER_POT_TO_WINNER_MS = 220;
const SEAT_STAGGER_MS = 160;

function settleAnimBaseDelayMs(reason) {
  if (reason === 'all_folded') return CHIP_FLY_MS + POT_HOLD_MS;
  return POT_HOLD_MS;
}

function estimateSettleChipAnimMs(compareResult) {
  if (!compareResult) return 0;
  if (compareResult.reason === 'rest_cross') return 0;
  if (Array.isArray(compareResult.transfers)) {
    const count = compareResult.transfers.filter((transfer) => (
      transfer?.to && Number(transfer.amount) > 0
    )).length;
    if (count === 0) return 0;
    const base = settleAnimBaseDelayMs(compareResult.reason);
    return base + SEAT_STAGGER_MS * Math.max(0, count - 1) + CHIP_FLY_MS + 80;
  }

  // 兼容部署切换期间的旧结果。
  const winner = compareResult.winner;
  if (!winner) return 0;
  const results = compareResult.results || {};
  let losers = 0;
  for (const [uname, r] of Object.entries(results)) {
    if (uname === winner) continue;
    if ((r?.lastDelta ?? 0) < 0) losers += 1;
  }
  const base = settleAnimBaseDelayMs(compareResult.reason);
  // all_folded / 有人收池的 all_sanhua：播底池→赢家；双三花无人收池时 winner 为空，上方已 return 0
  if (compareResult.reason === 'all_folded' || compareResult.reason === 'all_sanhua') {
    return base + CHIP_FLY_MS + 80;
  }
  let end = base + CHIP_FLY_MS;
  if (losers > 0) {
    end = Math.max(
      end,
      base + AFTER_POT_TO_WINNER_MS + SEAT_STAGGER_MS * Math.max(0, losers - 1) + CHIP_FLY_MS,
    );
  }
  return end + 80;
}

function clearSettleAnimGate(room) {
  if (!room?.settleAnimGate) return;
  const g = room.settleAnimGate;
  if (g.timerMin) clearTimeout(g.timerMin);
  if (g.timerMax) clearTimeout(g.timerMax);
  room.settleAnimGate = null;
}

function connectedUsernames(room) {
  const names = new Set();
  if (!room?.ws) return names;
  for (const ws of room.ws) {
    if (ws.readyState === 1 && ws.username) names.add(ws.username);
  }
  return names;
}

function tryFireSettleAnimGate(room) {
  const g = room?.settleAnimGate;
  if (!g || g.fired) return false;
  const elapsed = Date.now() - g.startedAt;
  if (elapsed < g.minWait) return false;
  const expected = [...g.expected];
  const allAcked = expected.length === 0 || expected.every((u) => g.acked.has(u));
  if (!allAcked && elapsed < g.maxWait) return false;
  g.fired = true;
  if (g.timerMin) clearTimeout(g.timerMin);
  if (g.timerMax) clearTimeout(g.timerMax);
  room.settleAnimGate = null;
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }
  try {
    g.onReady();
  } catch (e) {
    console.error('[settle-anim-gate] onReady failed', e);
  }
  return true;
}

/**
 * @param {object} room
 * @param {{ compareResult?: object, onReady: () => void }} opts
 * @returns {{ settleAnimId: string, minWait: number, maxWait: number, estimatedMs: number }}
 */
function beginSettleAnimGate(room, { compareResult = null, onReady } = {}) {
  clearSettleAnimGate(room);
  if (room.nextRoundTimer) {
    clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = null;
  }

  const estimatedMs = estimateSettleChipAnimMs(compareResult);
  const minWait = Math.max(SETTLE_MIN_MS, estimatedMs);
  const maxWait = Math.max(minWait + 800, SETTLE_MAX_MS);
  const settleAnimId = `${room.code || 'room'}-${room.gameRound || 0}-${Date.now()}`;
  const expected = connectedUsernames(room);

  room.settleAnimGate = {
    id: settleAnimId,
    expected,
    acked: new Set(),
    minWait,
    maxWait,
    estimatedMs,
    startedAt: Date.now(),
    fired: false,
    onReady: typeof onReady === 'function' ? onReady : () => {},
    timerMin: null,
    timerMax: null,
  };

  room.settleAnimGate.timerMin = setTimeout(() => tryFireSettleAnimGate(room), minWait);
  room.settleAnimGate.timerMax = setTimeout(() => tryFireSettleAnimGate(room), maxWait);

  return { settleAnimId, minWait, maxWait, estimatedMs };
}

function ackSettleAnimDone(room, username, settleAnimId) {
  const g = room?.settleAnimGate;
  if (!g || g.fired) return false;
  if (settleAnimId && g.id !== settleAnimId) return false;
  if (!username) return false;
  g.acked.add(username);
  return tryFireSettleAnimGate(room);
}

module.exports = {
  SETTLE_MIN_MS,
  SETTLE_MAX_MS,
  CHIP_FLY_MS,
  estimateSettleChipAnimMs,
  clearSettleAnimGate,
  beginSettleAnimGate,
  ackSettleAnimDone,
  tryFireSettleAnimGate,
};
