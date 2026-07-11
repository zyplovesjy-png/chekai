/**
 * 中途离场再买入的筹码账本：archive 累加 + 总结算合并。
 */

/**
 * 中途离场/起身：累加本段带入与带走，保留更早段落（再入座后结算要合并）。
 * totalBuyIn / finalPot 传入的是「本段」数值，不是全场累计。
 */
function accumulateChipArchive(room, {
  username,
  nickname,
  totalBuyIn = 0,
  finalPot = 0,
  initialBuyIn = 0,
} = {}) {
  if (!room || !username) return null;
  if (!room.chipArchives) room.chipArchives = {};
  const prev = room.chipArchives[username];
  const segBuy = Math.max(0, Math.floor(Number(totalBuyIn) || 0));
  const segFinal = Math.max(0, Math.floor(Number(finalPot) || 0));
  const segInitial = Math.max(0, Math.floor(Number(initialBuyIn) || 0));
  room.chipArchives[username] = {
    username,
    nickname: nickname || prev?.nickname || username,
    // initialBuyIn 仅作首段记录，不累加（结算用 totalBuyIn）
    initialBuyIn: prev?.initialBuyIn || segInitial || segBuy,
    totalBuyIn: (prev?.totalBuyIn || 0) + segBuy,
    finalPot: (prev?.finalPot || 0) + segFinal,
    leftAt: Date.now(),
  };
  return room.chipArchives[username];
}

/** 总结算：已兑现 archive + 当前在座筹码 / 带入 */
function settlePlayerChips({
  username,
  nickname,
  player = null,
  archive = null,
  fallbackBuyIn = 0,
} = {}) {
  const priorBuyIn = archive ? (archive.totalBuyIn || 0) : 0;
  const priorFinal = archive ? (archive.finalPot || 0) : 0;
  const currentBuyIn = player ? (player.totalBuyIn || 0) : 0;
  const currentFinal = player
    ? (player.pot + (player.committed || 0) + (player.pendingBuyIn || 0))
    : 0;
  let initial = priorBuyIn + currentBuyIn;
  let final = priorFinal + currentFinal;
  if (!player && !archive) {
    initial = Math.max(0, Math.floor(Number(fallbackBuyIn) || 0));
    final = initial;
  } else if (initial <= 0 && fallbackBuyIn) {
    initial = Math.max(0, Math.floor(Number(fallbackBuyIn) || 0));
  }
  return {
    username,
    nickname: nickname || player?.nickname || archive?.nickname || username,
    initial,
    final,
    delta: final - initial,
  };
}

module.exports = {
  accumulateChipArchive,
  settlePlayerChips,
};
