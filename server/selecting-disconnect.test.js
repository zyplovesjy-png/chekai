const assert = require('assert');
const { GameEngine, DECK } = require('./game');
const {
  autoSplitOnSelectingDisconnect,
  cancelPendingDisconnectRemoval,
  shouldDeferDisconnectTimeout,
} = require('./selecting-disconnect');

function makeSeat(username) {
  return { username, nickname: username, buyIn: 100, ready: true };
}

function makeSelectingRoom() {
  const room = {
    code: 'DISC',
    minBuyIn: 100,
    seats: Array(8).fill(null),
    pendingDisconnectAfterHand: new Set(),
  };
  room.seats[0] = makeSeat('p1');
  room.seats[1] = makeSeat('p2');
  const engine = new GameEngine(room);
  assert.strictEqual(engine.init(room.seats), true);
  room.game = engine;
  engine.state.phase = 'selecting';
  engine.state.activeIds = ['p1', 'p2'];
  engine.getPlayer('p1').hand = DECK.slice(0, 4).map((card) => ({ ...card }));
  engine.getPlayer('p2').hand = DECK.slice(4, 8).map((card) => ({ ...card }));
  return room;
}

{
  const room = makeSelectingRoom();
  const outcome = autoSplitOnSelectingDisconnect(room, 'p2');
  assert.strictEqual(outcome.handled, true);
  assert.strictEqual(outcome.autoSplit, true);
  assert.ok(room.game.state.splits.p2);
  assert.strictEqual(room.pendingDisconnectAfterHand.has('p2'), true);
  assert.strictEqual(shouldDeferDisconnectTimeout(room, 'p2', 'selecting'), true);
  assert.strictEqual(shouldDeferDisconnectTimeout(room, 'p2', 'comparing'), true);
  assert.strictEqual(shouldDeferDisconnectTimeout(room, 'p2', 'betting3'), false);

  assert.strictEqual(cancelPendingDisconnectRemoval(room, 'p2'), true);
  assert.strictEqual(room.pendingDisconnectAfterHand.has('p2'), false);
}

{
  const room = makeSelectingRoom();
  const manual = room.game.aiPickSplit(room.game.getPlayer('p2'));
  room.game.state.splits.p2 = manual;
  const outcome = autoSplitOnSelectingDisconnect(room, 'p2');
  assert.strictEqual(outcome.handled, true);
  assert.strictEqual(outcome.autoSplit, false);
  assert.strictEqual(outcome.split, manual);
  assert.strictEqual(room.pendingDisconnectAfterHand.has('p2'), true);
}

console.log('PASS selecting disconnect auto-split and reconnect cancellation');
