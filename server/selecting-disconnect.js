/**
 * 配牌阶段的断线状态机：
 * - 立即自动配牌，保留玩家参与本手比牌；
 * - 比牌完成前重连，取消局后移出；
 * - 等待其他在线玩家配牌期间，不受常规断线超时清理。
 */

function pendingSet(room) {
  if (!(room.pendingDisconnectAfterHand instanceof Set)) {
    room.pendingDisconnectAfterHand = new Set();
  }
  return room.pendingDisconnectAfterHand;
}

function autoSplitOnSelectingDisconnect(room, username) {
  const engine = room?.game;
  const state = engine?.state;
  if (!engine || !state || state.phase !== 'selecting') {
    return { handled: false, autoSplit: false, split: null };
  }

  const player = engine.getPlayer(username);
  if (
    !player
    || player.folded
    || player.eliminated
    || !state.activeIds.includes(username)
  ) {
    return { handled: false, autoSplit: false, split: null };
  }

  const pending = pendingSet(room);
  pending.add(username);
  const existing = state.splits[username];
  if (existing) {
    return { handled: true, autoSplit: false, split: existing };
  }

  engine.declineSanhuaOffer(player);
  const split = engine.aiPickSplit(player);
  if (!split) {
    pending.delete(username);
    return { handled: false, autoSplit: false, split: null };
  }
  state.splits[username] = split;
  return { handled: true, autoSplit: true, split };
}

function cancelPendingDisconnectRemoval(room, username) {
  return !!room?.pendingDisconnectAfterHand?.delete(username);
}

function shouldDeferDisconnectTimeout(room, username, phase) {
  return !!(
    room?.pendingDisconnectAfterHand?.has(username)
    && ['selecting', 'comparing', 'done'].includes(phase)
  );
}

module.exports = {
  autoSplitOnSelectingDisconnect,
  cancelPendingDisconnectRemoval,
  shouldDeferDisconnectTimeout,
};
