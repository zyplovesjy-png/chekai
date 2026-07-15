const assert = require('assert');
const { GameEngine, DECK, compareSplit, evalCombo } = require('./game');
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

function makeEngine(buyIns = [100, 120, 100], extraBuyIns = []) {
  const room = { code: 'TST', minBuyIn: 100, seats: Array(8).fill(null) };
  room.seats[0] = makeSeat('p1', buyIns[0]);
  room.seats[1] = makeSeat('p2', buyIns[1]);
  room.seats[2] = makeSeat('p3', buyIns[2]);
  extraBuyIns.forEach((buyIn, i) => {
    room.seats[3 + i] = makeSeat(`p${4 + i}`, buyIn);
  });

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

function cardById(id) {
  const c = DECK.find((d) => d.id === id);
  assert.ok(c, `missing card ${id}`);
  return { ...c };
}

function setHands(engine, hands) {
  Object.entries(hands).forEach(([username, ids]) => {
    const p = player(engine, username);
    p.hand = ids.map(cardById);
  });
}

function forceDocSplit(engine, username, headIds, tailIds) {
  const p = player(engine, username);
  const head = headIds.map(cardById);
  const tail = tailIds.map(cardById);
  p.hand = [...head, ...tail];
  engine.state.splits[username] = {
    head,
    tail,
    headEval: evalCombo(head[0], head[1]),
    tailEval: evalCombo(tail[0], tail[1]),
    headIdx: [0, 1],
  };
}

function pickBestSplit(engine, username) {
  const p = player(engine, username);
  const split = engine.aiPickSplit(p);
  engine.state.splits[username] = split;
  return split;
}

function fakeCard(id) {
  return { id, color: 'black', rank: '9', cnName: id, cnChar: id, cardPoints: 9, order: 50, suit: '♠' };
}

function fakeEval(level, name, sub = 1) {
  return { level, sub, points: level, maxO: level, minO: level, name };
}

function forceSplit(engine, username, headLevel, tailLevel, headSub = 1, tailSub = 1) {
  const p = player(engine, username);
  p.hand = [0, 1, 2, 3].map((idx) => fakeCard(`${username}-${idx}`));
  engine.state.splits[username] = {
    head: p.hand.slice(0, 2),
    tail: p.hand.slice(2),
    headEval: fakeEval(headLevel, `${username}-head`, headSub),
    tailEval: fakeEval(tailLevel, `${username}-tail`, tailSub),
    headIdx: [0, 1],
  };
}

function totalChips(engine) {
  const s = engine.state;
  const pots = engine.players.reduce((sum, p) => sum + p.pot + (p.committed || 0) + (p.pendingBuyIn || 0), 0);
  return pots + s.potPi;
}

function assertConservation(engine, baseline) {
  assert.strictEqual(totalChips(engine), baseline, 'chip conservation violated');
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

/* ========== 基础开局 / 轮转 ========== */

run('startNewRound charges only the banker ante before cards are dealt', () => {
  const engine = makeEngine([100, 120, 100]);
  assert.strictEqual(player(engine, 'p1').pot, 90);
  assert.strictEqual(player(engine, 'p2').pot, 120);
  assert.strictEqual(player(engine, 'p3').pot, 100);
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(engine.state.minBet, 10); // 第1轮开叫 = 底池
  assert.strictEqual(engine.state.currentBet, 0);
  assert.strictEqual(engine.state.betStarted, false);
  assert.deepStrictEqual(engine.players.map((p) => p.roundCommitted), [0, 0, 0]);
  assert.deepStrictEqual(engine.players.map((p) => p.committed), [0, 0, 0]);
  assert.deepStrictEqual(engine.state.toAct, ['p2', 'p3', 'p1']);
});

run('betting1 opening minBet equals current pot after mango', () => {
  const engine = makeEngine([200, 200, 200]);
  // 人为抬高底池模拟多轮累计
  engine.state.potPi = 200;
  engine.resetBettingRound(Math.max(10, engine.state.potPi));
  assert.strictEqual(engine.state.minBet, 200);
  const p2 = player(engine, 'p2');
  assert.strictEqual(engine.doCall(p2, 199), null);
  assert.ok(engine.doCall(p2, 200));
  assert.strictEqual(engine.state.currentBet, 200);
});

run('rest keeps same opening minBet for next actor in betting1', () => {
  const engine = makeEngine([300, 300, 300]);
  engine.state.potPi = 200;
  engine.resetBettingRound(200);
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  assert.ok(engine.doRest(p2));
  assert.strictEqual(engine.state.minBet, 200);
  assert.strictEqual(engine.state.betStarted, false);
  assert.strictEqual(engine.doCall(p3, 150), null);
  assert.ok(engine.doCall(p3, 200));
});

run('raise requires at least double the current shout', () => {
  const engine = makeEngine([500, 500, 500]);
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  engine.doCall(p2, 50);
  assert.strictEqual(engine.doRaise(p3, 99), null);
  assert.ok(engine.doRaise(p3, 100));
  assert.strictEqual(engine.state.currentBet, 100);
});

run('banker rotates in the same order as player actions', () => {
  const engine = makeEngine([100, 120, 100]);
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p1');
  engine.rotateBanker();
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p2');
  engine.rotateBanker();
  assert.strictEqual(engine.players[engine.state.bankerIdx].username, 'p3');
});

run('player seated mid-hand becomes active and clears waiting flag next round', () => {
  const room = { code: 'JOIN', minBuyIn: 100, seats: Array(8).fill(null) };
  room.seats[0] = makeSeat('p1', 200);
  room.seats[1] = makeSeat('p2', 200);
  const engine = new GameEngine(room);
  assert.strictEqual(engine.init(room.seats), true);
  engine.state.bankerIdx = 0;
  assert.strictEqual(engine.startNewRound(), true);

  room.seats[2] = { ...makeSeat('late', 200), joiningNextRound: true };
  engine.rebuildPlayersFromSeats(room.seats);
  assert.strictEqual(player(engine, 'late').joiningNextRound, true);
  assert.strictEqual(
    engine.getPublicState().players.find((p) => p.username === 'late').joiningNextRound,
    true,
  );

  engine.state.phase = 'done';
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(player(engine, 'late').joiningNextRound, false);
  assert.strictEqual(room.seats[2].joiningNextRound, false);
  assert.strictEqual(
    engine.getPublicState().players.find((p) => p.username === 'late').joiningNextRound,
    false,
  );
  assert.strictEqual(player(engine, 'late').hand.length, 2);
});

run('street opener ties break by first-round speak order (not near-banker)', () => {
  // 座位逆时针 a b c d e，b 庄 → 第一轮 cdeab；d、a 并列最大 → d 先 → deabc
  const room = { code: 'ORD', minBuyIn: 100, seats: Array(8).fill(null) };
  ['a', 'b', 'c', 'd', 'e'].forEach((u, i) => { room.seats[i] = makeSeat(u, 100); });
  const eng = new GameEngine(room);
  assert.strictEqual(eng.init(room.seats), true);
  eng.state.bankerIdx = 1;
  assert.strictEqual(eng.startNewRound(), true);
  assert.deepStrictEqual(
    eng.firstRoundSpeakOrder().map((i) => eng.players[i].username),
    ['c', 'd', 'e', 'a', 'b'],
  );

  const by = (id) => cardById(id);
  ['a', 'b', 'c', 'd', 'e'].forEach((u) => {
    eng.getPlayer(u).hand = [by('b51'), by('b52'), null];
  });
  // a 持 ♠梅十、d 持 ♣梅十：同 order75；若误比花色会选 a（♠>♣），正确应按发话序选 d
  eng.getPlayer('d').hand[2] = by('b102'); // ♣ 梅十
  eng.getPlayer('a').hand[2] = by('b101'); // ♠ 梅十
  eng.getPlayer('c').hand[2] = by('b71');
  eng.getPlayer('b').hand[2] = by('b72');
  eng.getPlayer('e').hand[2] = by('b81');

  assert.strictEqual(eng.findOpenerWithTieBreak(2), 'd');
  const openerIdx = eng.players.indexOf(eng.getPlayer('d'));
  assert.deepStrictEqual(
    eng.activeIndicesCCW(openerIdx).map((i) => eng.players[i].username),
    ['d', 'e', 'a', 'b', 'c'],
  );
});

run('street opener same strength: banker next speaks first, ignore suit', () => {
  // 甲庄，甲乙丙第三张同 order；乙是庄家下家 → 乙先说（不看花色）
  const engine = makeEngine([200, 200, 200]);
  const p1 = player(engine, 'p1'); // 甲
  const p2 = player(engine, 'p2'); // 乙
  const p3 = player(engine, 'p3'); // 丙
  assert.strictEqual(engine.state.bankerIdx, 0);

  const by = (id) => cardById(id);
  // 甲♦天、乙♠梅十、丙♥天：甲丙 order100，乙更小；改成三人都 order100
  p1.hand = [by('b51'), by('b52'), by('rQ2')]; // ♦ 天
  p2.hand = [by('b51'), by('b52'), by('rQ1')]; // ♥ 天（花色高于甲的♦，但并列应看座位）
  p3.hand = [by('b51'), by('b52'), { ...by('rQ1'), id: 'rQ1b', suit: '♠' }]; // 人为同 order

  // 若误比花色：丙♠ > 乙♥ > 甲♦ → 丙先；正确：第一轮乙→丙→甲 → 乙先
  assert.strictEqual(engine.findOpenerWithTieBreak(2), 'p2');
});

/* ========== 喊价模型 ========== */

run('shouting uses cumulative totals; chips leave hand but stay out of pot until fold/compare', () => {
  const engine = makeEngine([300, 300, 300]);
  const baseline = totalChips(engine);
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  const open = engine.doCall(p2, 50);
  assert.strictEqual(open.amount, 50);
  assert.strictEqual(p2.pot, 250);
  assert.strictEqual(p2.committed, 50);
  assert.strictEqual(p2.roundCommitted, 50);
  assert.strictEqual(engine.state.currentBet, 50);
  assert.strictEqual(engine.state.potPi, 10); // 只有底注

  const raise = engine.doRaise(p3, 120);
  assert.strictEqual(raise.amount, 120);
  assert.strictEqual(raise.delta, 120);
  assert.strictEqual(p3.pot, 180);
  assert.strictEqual(p3.committed, 120);
  assert.strictEqual(engine.state.currentBet, 120);
  assert.strictEqual(engine.state.potPi, 10);

  const follow = engine.doSee(p2);
  assert.strictEqual(follow.bet, 70);
  assert.strictEqual(p2.pot, 180);
  assert.strictEqual(p2.committed, 120);
  assert.strictEqual(engine.state.potPi, 10);
  assertConservation(engine, baseline);
});

run('fold pays current shout into the pot immediately', () => {
  const engine = makeEngine([100, 120, 100]);
  const baseline = totalChips(engine);
  const p2 = player(engine, 'p2');

  engine.doCall(p2, 10);
  assert.strictEqual(engine.state.potPi, 10);
  const folded = engine.doFold(p2);

  assert.strictEqual(folded.lost, 10);
  assert.strictEqual(p2.pot, 110);
  assert.strictEqual(p2.committed, 0);
  assert.strictEqual(engine.state.potPi, 20);
  assertConservation(engine, baseline);
});

run('pure all-rest carries only ante and charges next-round mango', () => {
  const engine = makeEngine([100, 120, 100]);
  const baseline = totalChips(engine);

  engine.doRest(player(engine, 'p2'));
  engine.doRest(player(engine, 'p3'));
  engine.doRest(player(engine, 'p1'));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'rest_cross' });
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(engine.state.restMangoLevel, 1);

  engine.state.phase = 'done';
  assert.strictEqual(engine.startNewRound(), true);

  assert.strictEqual(engine.state.potPi, 50);
  assert.strictEqual(player(engine, 'p1').pot, 70);
  assert.strictEqual(player(engine, 'p2').pot, 110);
  assert.strictEqual(player(engine, 'p3').pot, 90);
  assertConservation(engine, baseline);
});

run('rest_cross refunds fold money from earlier street', () => {
  const engine = makeEngine([200, 200, 200]);
  const baseline = totalChips(engine);
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p1 = player(engine, 'p1');

  // p2 喊10 → p3 跟10 → p1 加到30 → p3 弃牌付当前喊价10 → p2 跟30
  engine.doCall(p2, 10);
  engine.doSee(p3);
  engine.doRaise(p1, 30);
  engine.doFold(p3);
  engine.doSee(p2);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  assert.strictEqual(engine.state.potPi, 20); // ante10 + fold10
  assert.strictEqual(p3.pot, 190);
  assert.strictEqual(p3.foldPaid, 10);

  engine.dealThirdCard();
  const still = engine.state.activeIds.map((id) => engine.getPlayer(id)).filter((p) => !p.folded && !p.allIn);
  still.forEach((p) => engine.doRest(p));
  const done = engine.checkBettingDone();
  assert.strictEqual(done.reason, 'rest_cross');
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(p3.pot, 200); // 退回弃牌10
  assert.strictEqual(p1.committed, 0);
  assert.strictEqual(p2.committed, 0);
  assertConservation(engine, baseline);
});

run('fourth-card all-rest refunds prior shouts and earlier fold payments', () => {
  const engine = makeEngine([500, 500, 500], [500]);
  const baseline = totalChips(engine);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p4 = player(engine, 'p4');

  // 两张牌阶段四人跟到50。
  assert.ok(engine.doCall(p2, 50));
  assert.ok(engine.doSee(p3));
  assert.ok(engine.doSee(p4));
  assert.ok(engine.doSee(p1));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });

  // 第三张阶段抬到100，p4弃牌并实际支付此前累计的50，其余三人跟到100。
  engine.dealThirdCard();
  assert.ok(engine.doCall(p2, 100));
  assert.ok(engine.doSee(p3));
  assert.ok(engine.doFold(p4));
  assert.ok(engine.doSee(p1));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  assert.strictEqual(p4.foldPaid, 50);

  // 第四张阶段全休：三名存活者的累计100和p4已付的50全部退回，只留底注。
  engine.dealFourthCard();
  assert.strictEqual(engine.canFoldNow(), false);
  assert.ok(engine.doRest(p1));
  assert.ok(engine.doRest(p2));
  assert.ok(engine.doRest(p3));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'rest_cross' });
  assert.deepStrictEqual([p1.committed, p2.committed, p3.committed, p4.foldPaid], [0, 0, 0, 0]);
  assert.strictEqual(p4.pot, 500);
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(engine.state.restMangoLevel, 1);

  engine.state.phase = 'done';
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(engine.state.potPi, 60); // 上局底注10 + 四人休芒40 + 新庄底注10
  assert.strictEqual(engine.state.openingMango?.kind, 'rest');
  assertConservation(engine, baseline);
});

run('sanhua player also pays next-round rest mango', () => {
  const engine = makeEngine([300, 300, 300], [300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p4 = player(engine, 'p4');

  assert.ok(engine.doCall(p2, 20));
  assert.ok(engine.doSee(p3));
  assert.ok(engine.doSee(p4));
  assert.ok(engine.doSee(p1));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  engine.dealThirdCard();

  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
  ];
  engine.state.toAct = ['p2', 'p3', 'p4', 'p1'];
  assert.ok(engine.doShowSanhua(p2));
  assert.ok(engine.doRest(p3));
  assert.ok(engine.doRest(p4));
  assert.ok(engine.doRest(p1));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'rest_cross' });

  const p2BeforeNext = p2.pot;
  engine.state.phase = 'done';
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(p2.pot, p2BeforeNext - 10);
  assert.strictEqual(engine.state.openingMango?.kind, 'rest');
  assert.strictEqual(engine.state.openingMango?.exempt, null);
});

run('mango chain continues through bet-and-fold and exempts only the winner', () => {
  const engine = makeEngine([200, 100, 120]);
  const baseline = totalChips(engine);

  engine.doRest(player(engine, 'p2'));
  engine.doRest(player(engine, 'p3'));
  engine.doRest(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'rest_cross' });

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(engine.state.potPi, 50);

  engine.doRest(player(engine, 'p3'));
  engine.doRest(player(engine, 'p1'));
  engine.doCall(player(engine, 'p2'), 50);
  engine.doFold(player(engine, 'p3'));
  engine.doFold(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_folded', winner: 'p2' });

  // 赢家拿到底池；自己的喊价退还；揍芒
  // 开局 potPi=50；无人弃牌前喊价不进池；p3折后付喊价0；p1 fold 付0？
  // p1/p3 没喊价就 fold → lost=0；p2 喊了50被退还
  assert.strictEqual(engine.state.restMangoLevel, 2);
  assert.strictEqual(engine.state.beatMangoWinner, 'p2');
  assertConservation(engine, baseline);
});

run('first-street white folds without a bet do not trigger beat mango', () => {
  const engine = makeEngine([500, 500, 500]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doRest(p2);
  engine.doRest(p3);
  engine.doRest(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'rest_cross' });
  assert.strictEqual(engine.state.restMangoLevel, 1);

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(engine.state.restMangoLevel, 1); // 开局仍按 1 级收取
  assert.ok(engine.state.potPi >= 30); // 含芒果

  // 发完两张牌后无人喊价直接弃牌：赢家收池，但不揍芒，并清掉旧芒链。
  engine.doFold(p3);
  engine.doFold(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_folded', winner: 'p2' });
  assert.strictEqual(engine.state.restMangoLevel, 0);
  assert.strictEqual(engine.state.beatMangoWinner, null);

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(engine.state.openingMango, null);
});

run('first-street raise followed by folds still triggers beat mango', () => {
  const engine = makeEngine([500, 500, 500]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 20);
  engine.doFold(p3);
  engine.doFold(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_folded', winner: 'p2' });
  assert.strictEqual(engine.state.restMangoLevel, 1);
  assert.strictEqual(engine.state.beatMangoWinner, 'p2');

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.startNewRound(), true);
  // 揍芒：赢家 p2 免除
  assert.strictEqual(engine.state.openingMango?.kind, 'beat');
  assert.strictEqual(engine.state.beatMangoWinner, null); // 收取后清空免罚标记

  // 新规则不再排除“面对加价后弃牌”：只要发生在第一轮、最终由有喊价者独赢，就揍芒。
  // Round 2: banker=p2, toAct=[p3,p1,p2]
  const openAmt = engine.state.minBet || 50;
  assert.ok(engine.doCall(p3, openAmt));
  assert.ok(engine.doRaise(p1, openAmt * 2));
  assert.ok(engine.doFold(p3));
  assert.ok(engine.doFold(p2));
  const done = engine.checkBettingDone();
  assert.strictEqual(done.done, true);
  assert.strictEqual(done.reason, 'all_folded');
  assert.strictEqual(done.winner, 'p1');
  assert.strictEqual(engine.state.restMangoLevel, 2);
  assert.strictEqual(engine.state.beatMangoWinner, 'p1');

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.startNewRound(), true);
  assert.strictEqual(engine.state.openingMango?.level, 2);
  assert.strictEqual(engine.state.openingMango?.kind, 'beat');
});

run('a betting round cannot finish until every active player has matched', () => {
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

run('minimum bet doubles from the previous street final shout total', () => {
  const engine = makeEngine([300, 300, 300]);
  engine.doCall(player(engine, 'p2'), 20);
  engine.doSee(player(engine, 'p3'));
  engine.doSee(player(engine, 'p1'));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });

  engine.dealThirdCard();
  assert.strictEqual(engine.state.betRound, 2);
  assert.strictEqual(engine.state.minBet, 40);
  assert.strictEqual(engine.state.currentBet, 0);
  // 累计喊价保留
  assert.strictEqual(player(engine, 'p2').committed, 20);
});

run('raising across streets raises the cumulative shout total', () => {
  const engine = makeEngine([300, 300, 300]);
  engine.doCall(player(engine, 'p2'), 30);
  engine.doSee(player(engine, 'p3'));
  engine.doSee(player(engine, 'p1'));
  engine.checkBettingDone();
  engine.dealThirdCard();

  // 第2轮把喊价从30抬到60
  const p2 = player(engine, 'p2');
  // opener 可能是牌最大者，直接操作
  const opener = engine.getPlayer(engine.state.opener);
  const raise = engine.doCall(opener, 60);
  assert.ok(raise);
  assert.strictEqual(opener.committed, 60);
  assert.strictEqual(engine.state.currentBet, 60);
  assert.strictEqual(engine.state.potPi, 10);
});

run('knocked players do not skip the third-card speaking round', () => {
  const engine = makeEngine([100, 120, 300]);
  // p2 knock 120, p3 call 120, p1 knock 90
  engine.doKnock(player(engine, 'p2'));
  engine.doSee(player(engine, 'p3')); // 跟120
  engine.doKnock(player(engine, 'p1')); // 敲90 < 120，不算加注
  const done = engine.checkBettingDone();
  assert.strictEqual(done.done, true);
  assert.strictEqual(done.reason, 'all_matched');
  engine.dealThirdCard();
  assert.strictEqual(engine.state.phase, 'betting2');
  assert.deepStrictEqual(new Set(engine.state.toAct), new Set(['p1', 'p2', 'p3']));
  assert.strictEqual(player(engine, 'p1').actedThisRound, false);
  assert.strictEqual(player(engine, 'p2').actedThisRound, false);
});

run('all knocked players skip remaining streets and enter selecting', () => {
  const engine = makeEngine([100, 120, 100]);
  engine.doKnock(player(engine, 'p2'));
  engine.doKnock(player(engine, 'p3'));
  engine.doKnock(player(engine, 'p1'));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_in_showdown' });

  assert.strictEqual(resolveAllInShowdown(engine, done), true);
  assert.strictEqual(engine.state.phase, 'selecting');
  assert.deepStrictEqual(engine.players.map((p) => p.hand.length), [4, 4, 4]);
  assert.deepStrictEqual(engine.state.toAct, []);
});

run('mixed knocked and funded players do not invoke automatic all-in resolver', () => {
  const engine = makeEngine([100, 120, 300]);
  engine.doKnock(player(engine, 'p2'));
  engine.doSee(player(engine, 'p3'));
  engine.doKnock(player(engine, 'p1'));
  const done = engine.checkBettingDone();
  assert.strictEqual(done.reason, 'all_matched');
  assert.strictEqual(resolveAllInShowdown(engine, done), false);
  assert.strictEqual(engine.state.phase, 'betting1');
});

run('short knocked player may rest on the third-card round and joins rest mango', () => {
  const engine = makeEngine([300, 20, 300], [300]);
  const baseline = totalChips(engine);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p4 = player(engine, 'p4');

  assert.ok(engine.doKnock(p2));
  assert.ok(engine.doSee(p3));
  assert.ok(engine.doSee(p4));
  assert.ok(engine.doSee(p1));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });

  engine.dealThirdCard();
  assert.strictEqual(p2.allIn, true);
  assert.ok(engine.state.toAct.includes('p2'));
  assert.ok(engine.doRest(p2));
  assert.ok(engine.doRest(p3));
  assert.ok(engine.doRest(p4));
  assert.ok(engine.doRest(p1));

  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'rest_cross' });
  assert.strictEqual(p2.committed, 0);
  assert.strictEqual(p2.pot, 20);
  assert.strictEqual(engine.state.restMangoLevel, 1);
  assertConservation(engine, baseline);
});

run('repeated short knock preserves previous high price and next raise floor', () => {
  const engine = makeEngine([300, 20, 300], [300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p4 = player(engine, 'p4');

  // 两张牌：p2 敲20，其余玩家跟到20。
  assert.ok(engine.doKnock(p2));
  assert.ok(engine.doSee(p3));
  assert.ok(engine.doSee(p4));
  assert.ok(engine.doSee(p1));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });

  // 第三张：p2 再敲仍是20；p3返到80，其他人响应，最高累计价变为80。
  engine.dealThirdCard();
  assert.ok(engine.doKnock(p2));
  assert.strictEqual(engine.state.currentBet, 20);
  assert.ok(engine.doRaise(p3, 80));
  assert.ok(engine.doSee(p4));
  assert.ok(engine.doSee(p1));
  assert.ok(engine.doKnock(p2));
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  assert.strictEqual(engine.state.lastFinalBet, 80);

  // 第四张：p2 再敲20时，桌面有效基准仍为80；其他玩家返必须至少160。
  engine.dealFourthCard();
  assert.ok(engine.state.toAct.includes('p2'));
  assert.ok(engine.doKnock(p2));
  assert.strictEqual(engine.state.currentBet, 80);
  assert.strictEqual(engine.state.minBet, 160);
  assert.strictEqual(engine.doRaise(p3, 159), null);
  assert.ok(engine.doRaise(p3, 160));
});

run('declared sanhua voids shout without paying; opening pot stays', () => {
  const engine = makeEngine([300, 300, 300]);
  const baseline = totalChips(engine);
  const p2 = player(engine, 'p2');

  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
  ];
  engine.doCall(p2, 50);
  assert.strictEqual(p2.committed, 50);
  assert.strictEqual(p2.pot, 250);
  assert.strictEqual(engine.state.potPi, 10);

  engine.state.phase = 'betting2';
  engine.state.toAct = ['p2', 'p3', 'p1'];
  const result = engine.doShowSanhua(p2);

  assert.strictEqual(result.action, 'show_sanhua');
  assert.strictEqual(result.refund, 50);
  assert.strictEqual(p2.pot, 300);
  assert.strictEqual(p2.committed, 0);
  assert.strictEqual(engine.state.potPi, 10);
  assert.strictEqual(p2.sanhuaShown, true);
  assertConservation(engine, baseline);
});

run('sanhua alone without any fold does not trigger beat mango', () => {
  const engine = makeEngine([200, 200, 200]);
  const baseline = totalChips(engine);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 20);
  engine.doSee(p3);
  engine.doSee(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  engine.dealThirdCard();

  // p2 三花十、p3 三花六依次亮出，无人弃牌 → p1 收池，不揍芒
  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
    { cnName: '黑8', order: 8, suit: '♠' },
  ];
  p3.hand = [
    { cnName: '长三', order: 6, suit: '♠' },
    { cnName: '猫猫', order: 6, suit: '♥' },
    { cnName: '大鬼', order: 16, suit: '★' },
    { cnName: '黑8', order: 8, suit: '♣' },
  ];
  engine.state.phase = 'betting2';
  engine.state.toAct = [p2.username, p3.username, p1.username];
  engine.state.roundHadBet = true;

  assert.ok(engine.doShowSanhua(p2));
  assert.strictEqual(engine.checkBettingDone().done, false);
  assert.ok(engine.doShowSanhua(p3));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_folded', winner: 'p1' });
  assert.strictEqual(engine.state.restMangoLevel, 0);
  assert.strictEqual(engine.state.beatMangoWinner, null);
  assertConservation(engine, baseline);
});

run('dual sanhua show leaves pot for next round without mango', () => {
  // 四人：丙丁弃牌后，甲乙双三花均摊 → 底池留到下局，不打芒
  const engine = makeEngine([300, 300, 300], [300]);
  const baseline = totalChips(engine);
  const p1 = player(engine, 'p1'); // 甲
  const p2 = player(engine, 'p2'); // 乙
  const p3 = player(engine, 'p3'); // 丙
  const p4 = player(engine, 'p4'); // 丁

  engine.doCall(p2, 20);
  engine.doSee(p3);
  engine.doSee(p4);
  engine.doSee(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  engine.dealThirdCard();

  // 第3张牌后必须先有人下注，丙丁才允许弃牌。
  assert.ok(engine.doCall(p1, engine.state.minBet));
  assert.ok(engine.doFold(p3));
  assert.ok(engine.doFold(p4));
  assert.strictEqual(engine.checkBettingDone().done, false); // 甲乙仍在

  p1.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
    { cnName: '黑8', order: 8, suit: '♠' },
  ];
  p2.hand = [
    { cnName: '长三', order: 6, suit: '♠' },
    { cnName: '猫猫', order: 6, suit: '♥' },
    { cnName: '大鬼', order: 16, suit: '★' },
    { cnName: '黑7', order: 7, suit: '♣' },
  ];
  engine.state.phase = 'betting2';
  engine.state.toAct = [p1.username, p2.username];
  const potBefore = engine.state.potPi;
  assert.ok(potBefore > 0);

  assert.ok(engine.doShowSanhua(p1));
  // 乙仍可亮三花 → 暂不把底池判给乙
  assert.strictEqual(engine.checkBettingDone().done, false);
  assert.ok(engine.doShowSanhua(p2));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_sanhua' });
  assert.strictEqual(engine.state.potPi, potBefore); // 底池原样保留
  assert.strictEqual(engine.state.restMangoLevel, 0);
  assert.strictEqual(engine.state.beatMangoWinner, null);
  assertConservation(engine, baseline);

  engine.state.phase = 'done';
  engine.rotateBanker();
  assert.strictEqual(engine.startNewRound(), true);
  // 下一局：遗留底池 + 新庄底注，且不打芒
  assert.strictEqual(engine.state.openingMango, null);
  assert.strictEqual(engine.state.potPi, potBefore + 10);
  assertConservation(engine, baseline);
});

run('all-knock auto deal grants a sanhua offer in selecting', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  assert.ok(engine.doKnock(p2));
  engine.rebuildQueueAfter(p2);
  engine.advanceToAct();
  assert.ok(engine.doKnock(p3));
  engine.rebuildQueueAfter(p3);
  engine.advanceToAct();
  assert.ok(engine.doKnock(p1));
  engine.advanceToAct();
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_in_showdown' });
  assert.strictEqual(resolveAllInShowdown(engine, done), true);
  assert.strictEqual(engine.state.phase, 'selecting');

  // 自动补满四张后成三花，配牌前仍可摊。
  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
    { cnName: '黑8', order: 8, suit: '♠' },
  ];
  engine.grantSanhuaOffersAfterAutoDeal();

  assert.strictEqual(p2.allIn, true);
  assert.strictEqual(p2.sanhuaOfferPending, true);
  assert.strictEqual(engine.canShowSanhua(p2), true);
  const shown = engine.doShowSanhua(p2);
  assert.ok(shown);
  assert.strictEqual(shown.action, 'show_sanhua');
  assert.strictEqual(p2.sanhuaOfferPending, false);
  assert.ok(!engine.state.activeIds.includes('p2'));
});

run('all players knock on third card then auto deal fourth and offer sanhua', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 20);
  engine.doSee(p3);
  engine.doSee(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  engine.dealThirdCard();

  // 第三张后尚无三花，p2 敲
  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '黑8', order: 8, suit: '♠' },
  ];
  engine.state.toAct = [p2.username, p3.username, p1.username];
  assert.strictEqual(engine.canShowSanhua(p2), false);
  assert.ok(engine.doKnock(p2));
  assert.strictEqual(p2.sanhuaRevealLocked, false);

  // 其余玩家也全部敲/跟光后，直接补第4张进入配牌。
  assert.ok(engine.doSee(p3));
  assert.ok(engine.doKnock(p1));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_in_showdown' });
  assert.strictEqual(resolveAllInShowdown(engine, done), true);
  assert.strictEqual(engine.state.phase, 'selecting');

  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '黑8', order: 8, suit: '♠' },
    { cnName: '斧头', order: 11, suit: '♠' },
  ];
  engine.grantSanhuaOffersAfterAutoDeal();
  assert.strictEqual(p2.sanhuaOfferPending, true);
  assert.strictEqual(engine.canShowSanhua(p2), true);
});

run('sanhua on third card then knock locks and no offer after deal', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 20);
  engine.doSee(p3);
  engine.doSee(p1);
  engine.dealThirdCard();

  // 第三张已成三花，选择敲 = 放弃摊牌
  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
  ];
  engine.state.toAct = [p2.username, p3.username, p1.username];
  assert.strictEqual(engine.canShowSanhua(p2), true);
  assert.ok(engine.doKnock(p2));
  assert.strictEqual(p2.sanhuaRevealLocked, true);

  assert.ok(engine.doSee(p3));
  assert.ok(engine.doKnock(p1));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_in_showdown' });
  assert.strictEqual(resolveAllInShowdown(engine, done), true);

  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
    { cnName: '黑8', order: 8, suit: '♠' },
  ];
  engine.grantSanhuaOffersAfterAutoDeal();
  assert.strictEqual(p2.sanhuaOfferPending, false);
  assert.strictEqual(engine.canShowSanhua(p2), false);
});

run('decline sanhua offer by confirming split', () => {
  const engine = makeEngine([300, 300, 300]);
  const p2 = player(engine, 'p2');
  p2.allIn = true;
  p2.hand = [
    { cnName: '梅十', order: 10, suit: '♣' },
    { cnName: '苕十', order: 10, suit: '♥' },
    { cnName: '斧头', order: 11, suit: '♠' },
    { cnName: '黑8', order: 8, suit: '♠' },
  ];
  engine.state.phase = 'selecting';
  engine.grantSanhuaOffersAfterAutoDeal();
  assert.strictEqual(engine.canShowSanhua(p2), true);
  engine.declineSanhuaOffer(p2);
  assert.strictEqual(p2.sanhuaOfferPending, false);
  assert.strictEqual(p2.sanhuaRevealLocked, true);
  assert.strictEqual(engine.canShowSanhua(p2), false);
});

run('fold after bet still triggers beat mango', () => {
  // 一人喊价，其余未跟就丢 → 揍芒
  const engine = makeEngine([200, 200, 200]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 20);
  engine.doFold(p3);
  engine.doFold(p1);
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_folded', winner: 'p2' });
  assert.strictEqual(engine.state.restMangoLevel, 1);
  assert.strictEqual(engine.state.beatMangoWinner, 'p2');
});

run('winner silent while others fold does not trigger beat mango', () => {
  // 发两张后未下注，其他人全丢：赢家收池，但不揍芒。
  const engine = makeEngine([200, 200, 200]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doFold(p2);
  engine.doFold(p3);
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_folded', winner: 'p1' });
  assert.strictEqual(engine.state.roundHadBet, false);
  assert.strictEqual(engine.state.restMangoLevel, 0);
  assert.strictEqual(engine.state.beatMangoWinner, null);
});

run('third-card round forbids folding before anyone bets and all-rest refunds prior shouts', () => {
  const engine = makeEngine([300, 300, 300], [300]);
  const baseline = totalChips(engine);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p4 = player(engine, 'p4');

  engine.doCall(p2, 50);
  engine.doSee(p3);
  engine.doSee(p4);
  engine.doSee(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  engine.dealThirdCard();

  const opener = engine.getPlayer(engine.state.toAct[0]);
  assert.strictEqual(engine.canFoldNow(), false);
  assert.strictEqual(engine.doFold(opener), null);

  engine.state.activeIds.forEach((id) => assert.ok(engine.doRest(player(engine, id))));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'rest_cross' });
  assert.deepStrictEqual([p1.committed, p2.committed, p3.committed, p4.committed], [0, 0, 0, 0]);
  assert.strictEqual(engine.state.restMangoLevel, 1);
  assertConservation(engine, baseline);
});

run('first-street fold facing a raise still triggers beat mango', () => {
  const engine = makeEngine([300, 300, 300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');

  engine.doCall(p2, 50);
  engine.doRaise(p3, 200);
  engine.doFold(p1);
  engine.doFold(p2);
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_folded', winner: 'p3' });
  assert.ok((player(engine, 'p2').foldPaid || 0) > 0);
  assert.strictEqual(engine.state.restMangoLevel, 1);
  assert.strictEqual(engine.state.beatMangoWinner, 'p3');
});

run('third-card bet-and-fold win does not trigger beat mango', () => {
  const engine = makeEngine([300, 300, 300], [300]);
  const p1 = player(engine, 'p1');
  const p2 = player(engine, 'p2');
  const p3 = player(engine, 'p3');
  const p4 = player(engine, 'p4');

  engine.doCall(p2, 20);
  engine.doSee(p3);
  engine.doSee(p4);
  engine.doSee(p1);
  assert.deepStrictEqual(engine.checkBettingDone(), { done: true, reason: 'all_matched' });
  engine.dealThirdCard();

  // 指定 p2 先开口；第3张牌后有人下注，其他人此时才允许丢。
  engine.state.toAct = ['p2', 'p3', 'p4', 'p1'];
  assert.ok(engine.doCall(p2, 40));
  assert.strictEqual(engine.canFoldNow(), true);
  assert.ok(engine.doFold(p3));
  assert.ok(engine.doFold(p4));
  assert.ok(engine.doFold(p1));
  const done = engine.checkBettingDone();
  assert.deepStrictEqual(done, { done: true, reason: 'all_folded', winner: 'p2' });
  assert.strictEqual(engine.state.restMangoLevel, 0);
  assert.strictEqual(engine.state.beatMangoWinner, null);
});

/* ========== 结算场景（1.4 / 1.5） ========== */

function setupCompare(engine, commits, potPi, hands) {
  const names = ['p1', 'p2', 'p3'];
  names.forEach((name, i) => {
    const p = player(engine, name);
    // 把喊价预扣：committed 要从 pot 扣除过
    const stake = commits[i];
    p.committed = stake;
    p.roundCommitted = stake;
    p.pot = Math.max(0, p.pot - stake + (i === 0 ? 0 : 0)); // 已在 startNewRound 扣过底注
  });
  // 更干净：直接设定 pot / committed / potPi
  names.forEach((name, i) => {
    const p = player(engine, name);
    p.committed = commits[i];
    p.roundCommitted = commits[i];
    p.pot = 0; // 结算后 lastDelta 加回；手牌试测用纯结算
    p.folded = false;
    p.allIn = commits[i] > 0 && p.pot === 0;
  });
  engine.state.potPi = potPi;
  engine.state.activeIds = names.slice();
  engine.state.splits = {};
  if (hands) setHands(engine, hands);
  return names.map((n) => player(engine, n));
}

function assertDeltas(players, expected, labels = ['甲', '乙', '丙']) {
  const startCommitted = players.map((p) => p._startCommitted ?? p.committed);
  // 用结算前记录的 pot+committed 作起点更准
  void startCommitted;
  void labels;
  assert.deepStrictEqual(players.map((p) => p.pot), expected);
}

run('scenario 1: linear strength, tiered stake pass-down', () => {
  const engine = makeEngine([200, 200, 200]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 140; p1.committed = 50;
  p2.pot = 80; p2.committed = 120;
  p3.pot = 80; p3.committed = 120;
  engine.state.potPi = 10;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['rQ1', 'rQ2'], ['r21', 'b71']);
  forceDocSplit(engine, 'p2', ['r81', 'r82'], ['r41', 'b51']);
  forceDocSplit(engine, 'p3', ['r22', 'b81'], ['b101', 'b82']);

  assert.ok(compareSplit(engine.state.splits.p1, engine.state.splits.p2) > 0);
  assert.ok(compareSplit(engine.state.splits.p2, engine.state.splits.p3) > 0);
  assert.ok(compareSplit(engine.state.splits.p1, engine.state.splits.p3) > 0);

  engine.doCompare();
  // 甲+100（乙丙各50）+底池10；乙吃丙剩70付甲50净+20；丙-120
  // p1:140+50refund+50+50+10=300；p2:80+70+50refund?=220；p3:80
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [300, 220, 80]);
  assert.strictEqual(engine.state.potPi, 0);
});


run('scenario 2: tied winners, tail-larger takes loser stake alone', () => {
  const engine = makeEngine([200, 200, 200]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 90; p1.committed = 100;
  p2.pot = 100; p2.committed = 100;
  p3.pot = 100; p3.committed = 100;
  engine.state.potPi = 10;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['r21', 'r22'], ['b51', 'b81']);
  forceDocSplit(engine, 'p2', ['rQ1', 'b82'], ['rQ2', 'b71']);
  forceDocSplit(engine, 'p3', ['r81', 'r41'], ['b41', 'b72']);
  assert.strictEqual(compareSplit(engine.state.splits.p1, engine.state.splits.p2), 0);
  assert.ok(compareSplit(engine.state.splits.p1, engine.state.splits.p3) > 0);
  assert.ok(compareSplit(engine.state.splits.p2, engine.state.splits.p3) > 0);
  engine.doCompare();
  // 乙独吞丙100 + 底池10；甲拿回喊价；丙输掉100
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [190, 310, 100]);
});

run('scenario 4: extreme all-in tiered pass', () => {
  const engine = makeEngine([300, 300, 300]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 260; p1.committed = 30;
  p2.pot = 100; p2.committed = 200;
  p3.pot = 100; p3.committed = 200;
  engine.state.potPi = 0;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['rQ1', 'rQ2'], ['r21', 'b71']);
  forceDocSplit(engine, 'p2', ['r81', 'r82'], ['r41', 'b51']);
  forceDocSplit(engine, 'p3', ['r22', 'b81'], ['b101', 'b82']);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [350, 440, 100]);
});

run('scenario 5: all knock, leftover refund to loser', () => {
  const engine = makeEngine([300, 300, 400]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 190; p1.committed = 100;
  p2.pot = 200; p2.committed = 100;
  p3.pot = 100; p3.committed = 300;
  engine.state.potPi = 0;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceSplit(engine, 'p1', 9, 9);
  forceSplit(engine, 'p2', 8, 8);
  forceSplit(engine, 'p3', 5, 5);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [490, 300, 200]);
});

run('scenario 6: per-loser cap — knock50 takes50 from each', () => {
  const engine = makeEngine([200, 200, 200]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 140; p1.committed = 50;
  p2.pot = 80; p2.committed = 120;
  p3.pot = 80; p3.committed = 120;
  engine.state.potPi = 0;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceSplit(engine, 'p1', 9, 9);
  forceSplit(engine, 'p2', 8, 8);
  forceSplit(engine, 'p3', 5, 5);
  engine.doCompare();
  assert.strictEqual(p1.pot, 290);
});

run('scenario 7: identical head+tail split loser and pot', () => {
  const engine = makeEngine([300, 300, 300]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 190; p1.committed = 100;
  p2.pot = 200; p2.committed = 100;
  p3.pot = 200; p3.committed = 100;
  engine.state.potPi = 60;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['rQ1', 'b81'], ['b101', 'b91']);
  forceDocSplit(engine, 'p2', ['rQ2', 'b82'], ['b41', 'b51']);
  forceDocSplit(engine, 'p3', ['r21', 'r61'], ['r81', 'r101']);
  assert.strictEqual(compareSplit(engine.state.splits.p1, engine.state.splits.p2), 0);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [370, 380, 200]);
});

run('scenario 8: same tail different head — head wins all', () => {
  const engine = makeEngine([300, 300, 300]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 190; p1.committed = 100;
  p2.pot = 200; p2.committed = 100;
  p3.pot = 200; p3.committed = 100;
  engine.state.potPi = 60;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['rQ1', 'b81'], ['b101', 'b91']);
  forceDocSplit(engine, 'p2', ['r21', 'b82'], ['b41', 'b51']);
  forceDocSplit(engine, 'p3', ['r81', 'r101'], ['r41', 'b42']);
  assert.ok(compareSplit(engine.state.splits.p1, engine.state.splits.p2) > 0);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [550, 200, 200]);
});

run('scenario 9: two-way tie — each reclaim shout; tail wins pot', () => {
  const engine = makeEngine([200, 200, 200]);
  const [p1, p2] = [player(engine, 'p1'), player(engine, 'p2')];
  p1.pot = 90; p1.committed = 100;
  p2.pot = 100; p2.committed = 100;
  player(engine, 'p3').folded = true;
  engine.state.potPi = 60;
  engine.state.activeIds = ['p1', 'p2'];
  forceDocSplit(engine, 'p1', ['r21', 'r22'], ['b51', 'b81']);
  forceDocSplit(engine, 'p2', ['rQ1', 'b82'], ['rQ2', 'b71']);
  assert.strictEqual(compareSplit(engine.state.splits.p1, engine.state.splits.p2), 0);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot], [190, 260]);
});

run('scenario 10: tiny knock still takes full pot uncapped', () => {
  const engine = makeEngine([200, 200, 200]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 160; p1.committed = 30;
  p2.pot = 100; p2.committed = 100;
  p3.pot = 100; p3.committed = 100;
  engine.state.potPi = 200;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceSplit(engine, 'p1', 9, 9);
  forceSplit(engine, 'p2', 8, 7);
  forceSplit(engine, 'p3', 5, 5);
  engine.doCompare();
  assert.strictEqual(p1.pot, 450);
});

run('scenario 11: cyclic ties — non-winner with biggest tail takes pot', () => {
  const engine = makeEngine([200, 200, 200]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  p1.pot = 90; p1.committed = 100;
  p2.pot = 100; p2.committed = 100;
  p3.pot = 100; p3.committed = 100;
  engine.state.potPi = 60;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['r21', 'r22'], ['b101', 'b81']);
  forceDocSplit(engine, 'p2', ['r41', 'r42'], ['rQ1', 'b71']);
  forceDocSplit(engine, 'p3', ['r81', 'r82'], ['r101', 'b82']);
  assert.ok(compareSplit(engine.state.splits.p1, engine.state.splits.p3) > 0);
  assert.strictEqual(compareSplit(engine.state.splits.p1, engine.state.splits.p2), 0);
  assert.strictEqual(compareSplit(engine.state.splits.p2, engine.state.splits.p3), 0);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [290, 260, 100]);
});

run('scenario 12: full elements with fold money in pot', () => {
  const engine = makeEngine([200, 200, 200], [100]);
  const [p1, p2, p3] = [player(engine, 'p1'), player(engine, 'p2'), player(engine, 'p3')];
  const p4 = player(engine, 'p4');
  p4.folded = true;
  p4.pot = 70;
  p4.committed = 0;
  p1.pot = 120; p1.committed = 60;
  p2.pot = 100; p2.committed = 100;
  p3.pot = 100; p3.committed = 100;
  engine.state.potPi = 50;
  engine.state.activeIds = ['p1', 'p2', 'p3'];
  forceDocSplit(engine, 'p1', ['rQ1', 'rQ2'], ['r21', 'b71']);
  forceDocSplit(engine, 'p2', ['r81', 'r82'], ['r41', 'b51']);
  forceDocSplit(engine, 'p3', ['r22', 'b81'], ['b101', 'b82']);
  engine.doCompare();
  assert.deepStrictEqual([p1.pot, p2.pot, p3.pot], [350, 180, 100]);
});

run('four-player cumulative shouting keeps knocked players for street 3', () => {
  const room = { code: 'T22', minBuyIn: 100, seats: Array(8).fill(null) };
  room.seats[0] = makeSeat('甲', 100);
  room.seats[1] = makeSeat('乙', 120);
  room.seats[2] = makeSeat('丙', 80);
  room.seats[3] = makeSeat('丁', 300);
  const eng = new GameEngine(room);
  assert.strictEqual(eng.init(room.seats), true);
  eng.state.bankerIdx = 0;
  assert.strictEqual(eng.startNewRound(), true);
  const baseline = totalChips(eng);

  const 甲 = eng.getPlayer('甲');
  const 乙 = eng.getPlayer('乙');
  const 丙 = eng.getPlayer('丙');
  const 丁 = eng.getPlayer('丁');

  assert.strictEqual(甲.pot, 90);
  assert.strictEqual(eng.state.potPi, 10);
  assert.deepStrictEqual(eng.state.toAct, ['乙', '丙', '丁', '甲']);

  eng.doRest(乙);
  eng.doCall(丙, 10);
  eng.doRaise(丁, 30);
  eng.doSee(甲);
  eng.doSee(乙);
  eng.doFold(丙);
  assert.strictEqual(丙.pot, 70);
  assert.strictEqual(eng.state.potPi, 20);
  assert.deepStrictEqual(eng.checkBettingDone(), { done: true, reason: 'all_matched' });
  assert.strictEqual(eng.state.lastFinalBet, 30);

  eng.dealThirdCard();
  eng.state.opener = '甲';
  eng.state.toAct = ['甲', '乙', '丁'].filter((u) => {
    const p = eng.getPlayer(u);
    return p && !p.folded && !p.eliminated;
  });
  assert.strictEqual(eng.state.minBet, 60);

  eng.doCall(甲, 60);
  assert.strictEqual(甲.committed, 60);
  eng.doKnock(乙);
  assert.strictEqual(乙.committed, 120);
  assert.strictEqual(eng.state.currentBet, 120);
  eng.doSee(丁);
  assert.strictEqual(丁.committed, 120);
  eng.doKnock(甲);
  assert.strictEqual(甲.committed, 90);
  assert.strictEqual(甲.allIn, true);

  const done = eng.checkBettingDone();
  assert.strictEqual(done.done, true);
  assert.strictEqual(done.reason, 'all_matched');
  assert.deepStrictEqual([甲.committed, 乙.committed, 丁.committed], [90, 120, 120]);
  assert.strictEqual(eng.state.potPi, 20);
  eng.dealFourthCard();
  assert.ok(eng.state.toAct.includes('甲'));
  assert.ok(eng.state.toAct.includes('乙'));
  assertConservation(eng, baseline);
});

run('addBuyIn is pending until applied between rounds', () => {
  const engine = makeEngine([100, 100, 100]);
  const p2 = player(engine, 'p2');
  const before = p2.pot;
  engine.addBuyIn('p2', 50);
  assert.strictEqual(p2.pot, before);
  assert.strictEqual(p2.pendingBuyIn, 50);
});

run('pickSplitByPair auto-assigns stronger pair as head', () => {
  const engine = makeEngine([100, 100, 100]);
  const p1 = player(engine, 'p1');
  // QQ45：选 45 也应得到头 QQ、尾 45
  p1.hand = ['rQ1', 'rQ2', 'r41', 'b51'].map(cardById);
  const chosenTail = engine.pickSplitByPair(p1.hand, [2, 3]);
  assert.ok(chosenTail);
  assert.deepStrictEqual([...chosenTail.headIdx].sort((a, b) => a - b), [0, 1]);
  assert.deepStrictEqual(chosenTail.head.map((c) => c.id).sort(), ['rQ1', 'rQ2']);
  assert.deepStrictEqual(chosenTail.tail.map((c) => c.id).sort(), ['b51', 'r41']);

  // 选 QQ 也应得到同一配法
  const chosenHead = engine.pickSplitByPair(p1.hand, [0, 1]);
  assert.ok(chosenHead);
  assert.deepStrictEqual([...chosenHead.headIdx].sort((a, b) => a - b), [0, 1]);
  assert.strictEqual(chosenHead.headEval.name, chosenTail.headEval.name);
  assert.strictEqual(chosenHead.tailEval.name, chosenTail.tailEval.name);
});

run('leave+rebuy settlement merges archive with current seat', () => {
  const { accumulateChipArchive, settlePlayerChips } = require('./chip-ledger');
  const room = { chipArchives: {} };
  // 第一段：带入 300，离场带走 290
  accumulateChipArchive(room, {
    username: 'user1',
    nickname: '张',
    totalBuyIn: 300,
    finalPot: 290,
    initialBuyIn: 300,
  });
  assert.strictEqual(room.chipArchives.user1.totalBuyIn, 300);
  assert.strictEqual(room.chipArchives.user1.finalPot, 290);

  // 第二段仍在座：带入 500，最终 1070
  const row = settlePlayerChips({
    username: 'user1',
    nickname: '张',
    archive: room.chipArchives.user1,
    player: { pot: 1070, committed: 0, pendingBuyIn: 0, totalBuyIn: 500, nickname: '张' },
    fallbackBuyIn: 800,
  });
  assert.strictEqual(row.initial, 800);
  assert.strictEqual(row.final, 1360);
  assert.strictEqual(row.delta, 560);

  // 再离场一段应累加，而不是覆盖
  accumulateChipArchive(room, {
    username: 'user1',
    totalBuyIn: 500,
    finalPot: 400,
  });
  assert.strictEqual(room.chipArchives.user1.totalBuyIn, 800);
  assert.strictEqual(room.chipArchives.user1.finalPot, 690);
});

run('reclaim carry then top-up settles without double-counting', () => {
  const {
    accumulateChipArchive,
    reclaimChipArchive,
    getCarryChips,
    settlePlayerChips,
  } = require('./chip-ledger');
  const room = { chipArchives: {}, seats: [null, null] };

  // 首段带入 200，离座结余 80
  accumulateChipArchive(room, {
    username: 'user1',
    nickname: '甲',
    totalBuyIn: 200,
    finalPot: 80,
    initialBuyIn: 200,
  });
  assert.strictEqual(getCarryChips(room, 'user1'), 80);

  const carry = getCarryChips(room, 'user1');
  const topUp = 20;
  const used = reclaimChipArchive(room, 'user1', carry);
  assert.strictEqual(used, 80);
  assert.strictEqual(room.chipArchives.user1.finalPot, 0);
  assert.strictEqual(room.chipArchives.user1.totalBuyIn, 200); // 本金不动
  assert.strictEqual(getCarryChips(room, 'user1'), 0);

  const stack = carry + topUp;
  const row = settlePlayerChips({
    username: 'user1',
    nickname: '甲',
    archive: room.chipArchives.user1,
    player: { pot: stack, committed: 0, pendingBuyIn: 0, totalBuyIn: topUp },
    fallbackBuyIn: 220,
  });
  assert.strictEqual(row.initial, 220);
  assert.strictEqual(row.final, 100);
  assert.strictEqual(row.delta, -120);
});

run('reclaim full carry with zero top-up does not double finalPot', () => {
  const {
    accumulateChipArchive,
    reclaimChipArchive,
    settlePlayerChips,
  } = require('./chip-ledger');
  const room = { chipArchives: {} };

  accumulateChipArchive(room, {
    username: 'user1',
    totalBuyIn: 200,
    finalPot: 150,
    initialBuyIn: 200,
  });
  reclaimChipArchive(room, 'user1', 150);
  assert.strictEqual(room.chipArchives.user1.finalPot, 0);

  const row = settlePlayerChips({
    username: 'user1',
    archive: room.chipArchives.user1,
    player: { pot: 150, committed: 0, pendingBuyIn: 0, totalBuyIn: 0 },
  });
  assert.strictEqual(row.initial, 200);
  assert.strictEqual(row.final, 150);
  assert.strictEqual(row.delta, -50);
});

run('zero carry full rebuy stays single segment cash-in', () => {
  const { settlePlayerChips } = require('./chip-ledger');
  const row = settlePlayerChips({
    username: 'user1',
    archive: null,
    player: { pot: 100, committed: 0, pendingBuyIn: 0, totalBuyIn: 100 },
    fallbackBuyIn: 100,
  });
  assert.strictEqual(row.initial, 100);
  assert.strictEqual(row.final, 100);
  assert.strictEqual(row.delta, 0);
});

run('getCarryChips is zero while seated', () => {
  const { accumulateChipArchive, getCarryChips } = require('./chip-ledger');
  const room = {
    chipArchives: {},
    seats: [{ username: 'user1', buyIn: 80 }],
  };
  accumulateChipArchive(room, {
    username: 'user1',
    totalBuyIn: 200,
    finalPot: 80,
  });
  assert.strictEqual(getCarryChips(room, 'user1'), 0);
});

console.log('\nAll game-rules tests finished.');
