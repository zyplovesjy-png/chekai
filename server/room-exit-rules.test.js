const assert = require('assert');
const { ACTIVE_HAND_PHASES, getRoomExitBlockReason } = require('./room-exit-rules');

function makeRoom({ phase = 'betting1', player = { username: 'a', folded: false } } = {}) {
  return {
    gameStarted: true,
    game: {
      state: { phase },
      getPlayer: (username) => (player?.username === username ? player : null),
    },
  };
}

for (const phase of ACTIVE_HAND_PHASES) {
  const room = makeRoom({ phase });
  assert.strictEqual(
    getRoomExitBlockReason(room, 'a'),
    '对局进行中，请先弃牌或等待本局结束',
    `${phase} 阶段的未弃牌玩家应被拦截`,
  );
}

assert.strictEqual(
  getRoomExitBlockReason(makeRoom({ player: { username: 'a', folded: true } }), 'a'),
  null,
  '已弃牌玩家应允许返回大厅',
);
assert.strictEqual(
  getRoomExitBlockReason(makeRoom({ player: { username: 'a', folded: true, joiningNextRound: true } }), 'a'),
  null,
  '等待下局玩家应允许返回大厅',
);
assert.strictEqual(
  getRoomExitBlockReason(makeRoom({ player: null }), 'a'),
  null,
  '观战玩家应允许返回大厅',
);
assert.strictEqual(
  getRoomExitBlockReason(makeRoom({ phase: 'done' }), 'a'),
  null,
  '本局结束后应允许返回大厅',
);

console.log('PASS room exit rules');
