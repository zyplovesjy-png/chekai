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

/**
 * 再入座时冲回结余：从 archive.finalPot 减去带回桌上的金额。
 * 不改 totalBuyIn（本金已记过）。
 */
function reclaimChipArchive(room, username, amount) {
  if (!room || !username) return 0;
  const arch = room.chipArchives && room.chipArchives[username];
  if (!arch) return 0;
  const take = Math.max(0, Math.floor(Number(amount) || 0));
  if (take <= 0) return 0;
  const had = Math.max(0, Math.floor(Number(arch.finalPot) || 0));
  const used = Math.min(had, take);
  arch.finalPot = had - used;
  return used;
}

/** 未入座玩家可带回的结余（archive.finalPot） */
function getCarryChips(room, username) {
  if (!room || !username) return 0;
  const seated = (room.seats || []).some((s) => s && s.username === username);
  if (seated) return 0;
  const arch = room.chipArchives && room.chipArchives[username];
  return Math.max(0, Math.floor(Number(arch?.finalPot) || 0));
}

/**
 * 从引擎玩家和/或座位推算本段带入与带走。
 * - 有 player：pendingBuyIn 计入本段 totalBuyIn（尚未写入 totalBuyIn 的新钱）
 * - 仅座位（观战占座未进引擎）：final=seat.buyIn，buy=segmentBuyIn??buyIn
 */
function computeSeatChipSegment(player, seat) {
  if (player) {
    const pending = Math.max(0, Math.floor(Number(player.pendingBuyIn) || 0));
    const totalBuyIn = Math.max(0, Math.floor(Number(player.totalBuyIn) || 0));
    const pot = Math.max(0, Math.floor(Number(player.pot) || 0));
    const committed = Math.max(0, Math.floor(Number(player.committed) || 0));
    const segBuy = totalBuyIn + pending;
    const segFinal = pot + committed + pending;
    return {
      nickname: player.nickname,
      totalBuyIn: segBuy,
      finalPot: segFinal,
      initialBuyIn: segBuy,
    };
  }
  if (seat) {
    const stack = Math.max(0, Math.floor(Number(seat.buyIn) || 0));
    const segment = seat.segmentBuyIn != null
      ? Math.max(0, Math.floor(Number(seat.segmentBuyIn) || 0))
      : stack;
    return {
      nickname: seat.nickname,
      totalBuyIn: segment,
      finalPot: stack,
      initialBuyIn: segment,
    };
  }
  return null;
}

/**
 * 统一离座/离开/超时归档：有 player 或 seat 任一即可。
 * @returns {{ archive, totalBuyIn, finalPot, seatIdx } | null}
 */
function archivePlayerOrSeat(room, username, {
  player,
  clearSeat = true,
  rebuild = false,
} = {}) {
  if (!room || !username) return null;
  const engine = room.game;
  const p = player !== undefined
    ? player
    : (engine && typeof engine.getPlayer === 'function' ? engine.getPlayer(username) : null);
  const seatIdx = (room.seats || []).findIndex((s) => s && s.username === username);
  const seat = seatIdx >= 0 ? room.seats[seatIdx] : null;
  if (!p && !seat) return null;

  const seg = computeSeatChipSegment(p, seat);
  if (!seg) return null;

  const archive = accumulateChipArchive(room, {
    username,
    nickname: seg.nickname || username,
    totalBuyIn: seg.totalBuyIn,
    finalPot: seg.finalPot,
    initialBuyIn: seg.initialBuyIn,
  });

  if (clearSeat && seatIdx >= 0) {
    room.seats[seatIdx] = null;
  }
  if (rebuild && engine && typeof engine.rebuildPlayersFromSeats === 'function') {
    engine.rebuildPlayersFromSeats(room.seats);
  }

  return {
    archive,
    totalBuyIn: seg.totalBuyIn,
    finalPot: seg.finalPot,
    seatIdx,
    nickname: seg.nickname || username,
  };
}

/** 累加 initialBuyIns（加簸生效 / 新带入） */
function bumpInitialBuyIn(room, username, nickname, amount) {
  if (!room || !username) return;
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  if (n <= 0) return;
  if (!room.initialBuyIns) room.initialBuyIns = [];
  const row = room.initialBuyIns.find((i) => i.username === username);
  if (row) {
    row.buyIn = (row.buyIn || 0) + n;
    if (nickname) row.nickname = nickname;
  } else {
    room.initialBuyIns.push({ username, nickname: nickname || username, buyIn: n });
  }
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
  reclaimChipArchive,
  getCarryChips,
  computeSeatChipSegment,
  archivePlayerOrSeat,
  bumpInitialBuyIn,
  settlePlayerChips,
};
