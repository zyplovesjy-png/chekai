const ACTIVE_HAND_PHASES = new Set([
  'dealing',
  'betting1',
  'betting2',
  'betting3',
  'selecting',
  'comparing',
]);

/** 当前手仍在参与的玩家必须先弃牌，或等待本局结束后才能离开房间。 */
function getRoomExitBlockReason(room, username) {
  const engine = room?.game;
  const phase = engine?.state?.phase;
  if (!room?.gameStarted || !engine || !ACTIVE_HAND_PHASES.has(phase)) return null;

  const player = engine.getPlayer?.(username);
  if (player && !player.folded) {
    return '对局进行中，请先弃牌或等待本局结束';
  }
  return null;
}

module.exports = {
  ACTIVE_HAND_PHASES,
  getRoomExitBlockReason,
};
