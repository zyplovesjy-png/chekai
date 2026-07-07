const assert = require('assert');
const { GameEngine } = require('./game');
const { resolveAllInShowdown } = require('./betting-flow');

function makeSeat(username, buyIn) {
  return {
    username,
    nickname: username,
    buyIn,
    ready: true,
    avatar_path: null,
  };
}

function makeEngine(buyIns = [100, 120, 100]) {
  const room = { code: 'TST', gameType: '1,3', seats: Array(8).fill(null) };
  room.seats[0] = makeSeat('p1', buyIns[0]);
  room.seats[1] = makeSeat('p2', buyIns[1]);
  room.seats[2] = makeSeat('p3', buyIns[2]);

  const engine = new GameEngine(room);
  assert.strictEqual(engine.init(room.seats), true);
  engine.state.bankerIdx = 0;
  assert.strictEqual(engine.startNewRound(), true);
  return engine;
}

function player(engine, username) {
  const p = engine.getPlayer(username);
  assert.ok(p, `missing player ${username}`);
  return p;
}

function fakeCard(id) {
  return { id, color: 'black', rank: '9', cnName: id, cnChar: id, cardPoints: 9, order: 50, suit: '♠' };
}

function fakeEval(level, name) {
  return { level, sub: 1, points: level, maxO: level, minO: level, name };
}

function forceSplit(engine, username, headLevel, tailLevel) {
  const p = player(engine, username);
  p.hand = [0, 1, 2, 3].map((idx) => fakeCard(`${username}-${idx}`));
  engine.state.splits[username] = {
    head: p.hand.slice(0, 2),
    tail: p.hand.slice(2),
    headEval: fakeEval(headLevel, `${username}-head`),
    tailEval: fakeEval(tailLevel, `${username}-tail`),
    headIdx: [0, 1],
  };
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run('startNewRound charges only the banker ante before cards are dealt', () => {
  const engine = makeEngine([100, 120, 100]);
  assert.strictEqual(player(engine, 'p1').pot, 90);
  assert.strictEqual(player(engine, 'p2').pot, 120);
  assert.strictEqual(player(engine, 'p3').pot, 100);
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(engine.state.currentBet, 0);
  assert.strictEqual(engine.state.betStarted, false);
  assert.deepStrictEqual(engine.players.map((p) => p.roundCommitted), [0, 0, 0]);
  assert.deepStrictEqual(engine.players.map((p) => p.committed), [0, 0, 0]);
  assert.deepStrictEqual(engine.state.toAct, ['p2', 'p3', 'p1']);
});

run('banker rotates in the same order as player actions', () => {
  const engine = makeEngine([100, 120, 100]);

  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p1');
  engine.rotateBanker();
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p2');
  engine.rotateBanker();
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p3');
});

run('betting uses target amounts and only deducts the missing difference', () => {
  const engine = makeEngine([300, 300, 300]);
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  const open = engine.doCall(p2, 50);
  assert.strictEqual(open.amount, 50);
  assert.strictEqual(p2.pot, 250);
  assert.strictEqual(p2.roundCommitted, 50);
  assert.strictEqual(p2.committed, 50);
  assert.strictEqual(engine.state.currentBet, 50);
  assert.strictEqual(engine.state.potPi, 60);

  const raise = engine.doRaise(p3, 120);
  assert.strictEqual(raise.amount, 120);
  assert.strictEqual(raise.delta, 120);
  assert.strictEqual(p3.pot, 180);
  assert.strictEqual(p3.roundCommitted, 120);
  assert.strictEqual(engine.state.currentBet, 120);

  const follow = engine.doSee(p2);
  assert.strictEqual(follow.bet, 70);
  assert.strictEqual(p2.pot, 180);
  assert.strictEqual(p2.roundCommitted, 120);
  assert.strictEqual(p2.committed, 120);
});

run('folding loses only chips already committed to the pot', () => {
  const engine = makeEngine([100, 120, 100]);
  const p2 = player(engine, 'p2');

  engine.doCall(p2, 10);
  const folded = engine.doFold(p2);

  assert.strictEqual(folded.penalty, 0);
  assert.strictEqual(p2.pot, 110);
  assert.strictEqual(p2.committed, 10);
  assert.strictEqual(p2.lastDelta, -10);
  assert.strictEqual(engine.state.potPi, 20);
});

run('all-rest rounds carry the pot and charge next-round mango plus banker ante', () => {
  const engine = makeEngine([100, 120, 100]);

  engine.doRest(player(engine, 'p2'));
  engine.doRest(player(engine, 'p3'));
  engine.doRest(player(engine, 'p1'));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'rest_cross' });

  engine.state.phase = 'done';
  assert.strictEqual(engine.startNewRound(), true);

  assert.strictEqual(engine.state.potPi, 50);
  assert.strictEqual(player(engine, 'p1').pot, 70);
  assert.strictEqual(player(engine, 'p2').pot, 110);
  assert.strictEqual(player(engine, 'p3').pot, 90);
});

run('mango chain continues through bet-and-fold rounds and exempts only the bettor winner next round', () => {
  const engine = makeEngine([200, 100, 120]);

  engine.doRest(player(engine, 'p2'));
  engine.doRest(player(engine, 'p3'));
  engine.doRest(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'rest_cross' });

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p2');
  assert.strictEqual(engine.startNewRound(), true);

  assert.strictEqual(engine.state.potPi, 50);
  assert.deepStrictEqual(
    ['p1', 'p2', 'p3'].map((username) => player(engine, username).pot),
    [180, 80, 110],
  );
  assert.deepStrictEqual(engine.state.toAct, ['p3', 'p1', 'p2']);

  engine.doRest(player(engine, 'p3'));
  engine.doRest(player(engine, 'p1'));
  engine.doCall(player(engine, 'p2'), 50);
  engine.doFold(player(engine, 'p3'));
  engine.doFold(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_folded', winner: 'p2' });

  assert.strictEqual(player(engine, 'p2').pot, 130);
  assert.strictEqual(engine.state.restMangoLevel, 2);
  assert.strictEqual(engine.state.beatMangoWinner, 'p2');

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p3');
  assert.strictEqual(engine.startNewRound(), true);

  assert.strictEqual(engine.state.potPi, 50);
  assert.deepStrictEqual(
    ['p1', 'p2', 'p3'].map((username) => player(engine, username).pot),
    [160, 130, 80],
  );
  assert.strictEqual(engine.state.beatMangoWinner, null);
});

run('mango chain is capped at three and cleared only by compare', () => {
  const engine = makeEngine([500, 500, 500]);
  engine.state.restMangoLevel = 3;
  engine.state.beatMangoWinner = 'p2';

  engine.doCall(player(engine, 'p2'), 50);
  engine.doFold(player(engine, 'p3'));
  engine.doFold(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_folded', winner: 'p2' });
  assert.strictEqual(engine.state.restMangoLevel, 3);
  assert.strictEqual(engine.state.beatMangoWinner, 'p2');

  engine.state.phase = 'selecting';
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceSplit(engine, 'p1', 5, 5);
  forceSplit(engine, 'p2', 6, 6);
  forceSplit(engine, 'p3', 7, 7);
  engine.doCompare();

  assert.strictEqual(engine.state.restMangoLevel, 0);
  assert.strictEqual(engine.state.beatMangoWinner, null);
});

run('a betting round cannot finish until every active player has matched the current bet', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 50);
  engine.doRaise(p3, 120);
  engine.doSee(p1);
  assert.strictEqual(engine.checkBettingDone().done, false);

  engine.doSee(p2);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
});


run('minimum bet doubles from the previous betting round final bet', () => {
  const engine = makeEngine([300, 300, 300]);
  engine.doCall(player(engine, 'p2'), 20);
  engine.doSee(player(engine, 'p3'));
  engine.doSee(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });

  engine.dealThirdCard();
  assert.strictEqual(engine.state.betRound, 2);
  assert.strictEqual(engine.state.minBet, 40);
  assert.strictEqual(engine.state.currentBet, 0);
});

run('all players knocking moves directly to split selection after dealing four cards', () => {
  const engine = makeEngine([100, 120, 100]);
  engine.doKnock(player(engine, 'p2'));
  engine.doKnock(player(engine, 'p3'));
  engine.doKnock(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_in_showdown' });

  engine.dealRemainingCardsToShowdown();
  assert.strictEqual(engine.state.phase, 'selecting');
  assert.deepStrictEqual(engine.players.map((p) => p.hand.length), [4, 4, 4]);
});

run('server all-in showdown resolver deals remaining cards and enters split selection', () => {
  const engine = makeEngine([100, 120, 100]);
  engine.doKnock(player(engine, 'p2'));
  engine.doKnock(player(engine, 'p3'));
  engine.doKnock(player(engine, 'p1'));
  const done = engine.checkBettingDone();

  assert.strictEqual(resolveAllInShowdown(engine, done), true);
  assert.strictEqual(engine.state.phase, 'selecting');
  assert.deepStrictEqual(engine.players.map((p) => p.hand.length), [4, 4, 4]);
  assert.deepStrictEqual(engine.state.toAct, []);
});

run('all-in compare settlement uses pairwise wins and caps each loser stake', () => {
  const engine = makeEngine([200, 100, 120]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  p1.pot = 160;
  p2.pot = 130;
  p3.pot = 80;
  p1.committed = 0;
  p2.committed = 0;
  p3.committed = 0;
  p1.roundCommitted = 0;
  p2.roundCommitted = 0;
  p3.roundCommitted = 0;
  engine.state.potPi = 50;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  engine.state.splits = {};

  engine.doKnock(p1);
  engine.doKnock(p2);
  engine.doKnock(p3);

  assert.strictEqual(engine.state.potPi, 420);
  assert.deepStrictEqual([p1.committed, p2.committed, p3.committed], [160, 130, 80]);

  forceSplit(engine, 'p1', 5, 5);
  forceSplit(engine, 'p2', 6, 6);
  forceSplit(engine, 'p3', 1, 9);

  const result = engine.doCompare();

  assert.strictEqual(result.winner, 'p3');
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [30, 260, 130]);
});

run('compare settlement uses paired head-tail wins and keeps opening pot separate', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  [p1, p2, p3].forEach((p) => {
    p.pot = 0;
    p.committed = 180;
    p.roundCommitted = 180;
  });
  engine.state.potPi = 840;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  engine.state.splits = {};

  forceSplit(engine, 'p1', 8, 8);
  forceSplit(engine, 'p2', 5, 5);
  forceSplit(engine, 'p3', 1, 9);

  const result = engine.doCompare();

  assert.strictEqual(result.results.p1.wins, 1);
  assert.strictEqual(result.results.p1.ties, 1);
  assert.strictEqual(result.results.p2.losses, 1);
  assert.strictEqual(result.results.p3.ties, 2);
  assert.strictEqual(result.winner, 'p3');
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [360, 0, 480]);
});

run('table pot goes only to the player with the strongest tail-qualified hand', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  [p1, p2, p3].forEach((p) => {
    p.pot = 0;
    p.committed = 0;
    p.roundCommitted = 0;
  });
  engine.state.potPi = 90;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  engine.state.splits = {};

  forceSplit(engine, 'p1', 8, 9);
  forceSplit(engine, 'p2', 5, 9);
  forceSplit(engine, 'p3', 7, 7);

  engine.doCompare();

  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [90, 0, 0]);
});

run('a loser stake goes to the strongest player among everyone who beats that loser', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  [p1, p2, p3].forEach((p) => {
    p.pot = 0;
    p.committed = 180;
    p.roundCommitted = 180;
  });
  engine.state.potPi = 540;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  engine.state.splits = {};

  forceSplit(engine, 'p1', 9, 9);
  forceSplit(engine, 'p2', 8, 8);
  forceSplit(engine, 'p3', 5, 5);

  engine.doCompare();

  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [540, 0, 0]);
});

run('a loser stake is split when multiple strongest winners tie', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  [p1, p2, p3].forEach((p) => {
    p.pot = 0;
    p.committed = 180;
    p.roundCommitted = 180;
  });
  engine.state.potPi = 540;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  engine.state.splits = {};

  forceSplit(engine, 'p1', 9, 9);
  forceSplit(engine, 'p2', 9, 9);
  forceSplit(engine, 'p3', 5, 5);

  engine.doCompare();

  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [270, 270, 0]);
});

run('declared sanhua refunds only betting chips and leaves opening pot in the table pot', () => {
  const engine = makeEngine([300, 300, 300]);
  const p2 = player(engine, 'p2');

  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
  ];
  p2.pot = 250;
  p2.committed = 50;
  p2.roundCommitted = 50;
  engine.state.potPi = 90;
  engine.state.phase = 'betting2';
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  engine.state.toAct = ['p2', 'p3', 'p1'];

  const result = engine.doShowSanhua(p2);

  assert.strictEqual(result.action, 'show_sanhua');
  assert.strictEqual(result.refund, 50);
  assert.strictEqual(p2.pot, 300);
  assert.strictEqual(p2.committed, 0);
  assert.strictEqual(p2.roundCommitted, 0);
  assert.strictEqual(engine.state.potPi, 40);
  assert.strictEqual(p2.sanhuaShown, true);
  assert.deepStrictEqual(engine.state.activeIds, ['p1', 'p3']);
});
