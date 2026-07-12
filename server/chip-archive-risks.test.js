/**
 * 逻辑模拟：离座结余 / 归档 6 类风险路径（不启 HTTP/WS）
 */
const assert = require('assert');
const {
  accumulateChipArchive,
  reclaimChipArchive,
  getCarryChips,
  computeSeatChipSegment,
  archivePlayerOrSeat,
  bumpInitialBuyIn,
  settlePlayerChips,
} = require('./chip-ledger');

function run(name, fn) {
  try {
    fn();
    console.log('PASS', name);
  } catch (e) {
    console.error('FAIL', name);
    console.error(e);
    process.exitCode = 1;
  }
}

function makeRoom(overrides = {}) {
  return {
    seats: [null, null, null],
    chipArchives: {},
    initialBuyIns: [],
    game: null,
    ...overrides,
  };
}

run('risk1: spectating seat leave archives stack without engine player', () => {
  const room = makeRoom({
    seats: [{
      username: 'a',
      nickname: '甲',
      buyIn: 100,
      segmentBuyIn: 20,
    }, null],
    chipArchives: {
      a: { username: 'a', totalBuyIn: 200, finalPot: 0, initialBuyIn: 200 },
    },
    initialBuyIns: [{ username: 'a', nickname: '甲', buyIn: 220 }],
  });
  // reclaim 已完成：finalPot=0，桌上 100 = 80结余+20加簸
  const archived = archivePlayerOrSeat(room, 'a', { player: null, clearSeat: true });
  assert.ok(archived);
  assert.strictEqual(archived.totalBuyIn, 20);
  assert.strictEqual(archived.finalPot, 100);
  assert.strictEqual(room.chipArchives.a.totalBuyIn, 220);
  assert.strictEqual(room.chipArchives.a.finalPot, 100);
  assert.strictEqual(room.seats[0], null);

  const row = settlePlayerChips({
    username: 'a',
    archive: room.chipArchives.a,
    player: null,
    fallbackBuyIn: 220,
  });
  assert.strictEqual(row.initial, 220);
  assert.strictEqual(row.final, 100);
  assert.strictEqual(row.delta, -120);
});

run('risk2: pendingBuyIn included in segment buy-in on archive', () => {
  const player = {
    username: 'a',
    nickname: '甲',
    pot: 50,
    committed: 0,
    pendingBuyIn: 40,
    totalBuyIn: 200,
  };
  const seg = computeSeatChipSegment(player, null);
  assert.strictEqual(seg.totalBuyIn, 240);
  assert.strictEqual(seg.finalPot, 90);

  const room = makeRoom({
    seats: [{ username: 'a', buyIn: 90 }],
    initialBuyIns: [{ username: 'a', buyIn: 200 }],
  });
  archivePlayerOrSeat(room, 'a', { player, clearSeat: true });
  assert.strictEqual(room.chipArchives.a.totalBuyIn, 240);
  assert.strictEqual(room.chipArchives.a.finalPot, 90);

  const row = settlePlayerChips({
    username: 'a',
    archive: room.chipArchives.a,
    player: null,
  });
  assert.strictEqual(row.initial, 240);
  assert.strictEqual(row.final, 90);
  assert.strictEqual(row.delta, -150);
});

run('risk3: broke/archive seat-only uses segmentBuyIn not full stack', () => {
  const room = makeRoom({
    seats: [{
      username: 'a',
      nickname: '甲',
      buyIn: 100,
      segmentBuyIn: 20,
    }],
    chipArchives: {
      a: { username: 'a', totalBuyIn: 200, finalPot: 0, initialBuyIn: 200 },
    },
  });
  archivePlayerOrSeat(room, 'a', { player: null, clearSeat: true });
  assert.strictEqual(room.chipArchives.a.totalBuyIn, 220);
  assert.strictEqual(room.chipArchives.a.finalPot, 100);
});

run('risk4: inactivity-style archive with player matches stand semantics', () => {
  const player = {
    username: 'a',
    nickname: '甲',
    pot: 70,
    committed: 10,
    pendingBuyIn: 0,
    totalBuyIn: 100,
  };
  const room = makeRoom({
    seats: [{ username: 'a', buyIn: 100, segmentBuyIn: 100 }],
  });
  const archived = archivePlayerOrSeat(room, 'a', { player, clearSeat: true });
  assert.strictEqual(archived.totalBuyIn, 100);
  assert.strictEqual(archived.finalPot, 80);
  assert.strictEqual(room.seats[0], null);
});

run('risk5: leave path archives seat when getPlayer is null', () => {
  const room = makeRoom({
    seats: [{ username: 'b', nickname: '乙', buyIn: 150, segmentBuyIn: 150 }],
    initialBuyIns: [{ username: 'b', nickname: '乙', buyIn: 150 }],
  });
  // 模拟 leave：先归档不清座，再清座
  const archived = archivePlayerOrSeat(room, 'b', { player: null, clearSeat: false });
  assert.ok(archived);
  assert.strictEqual(archived.finalPot, 150);
  assert.strictEqual(archived.totalBuyIn, 150);
  room.seats[0] = null;
  assert.strictEqual(getCarryChips(room, 'b'), 150);

  const row = settlePlayerChips({
    username: 'b',
    archive: room.chipArchives.b,
    player: null,
    fallbackBuyIn: 150,
  });
  assert.strictEqual(row.delta, 0);
});

run('risk6: leftover pot credits archive.finalPot only (no buy-in double count)', () => {
  const room = makeRoom({
    chipArchives: {
      banker: {
        username: 'banker',
        nickname: '庄',
        initialBuyIn: 200,
        totalBuyIn: 200,
        finalPot: 80,
      },
    },
    initialBuyIns: [{ username: 'banker', nickname: '庄', buyIn: 200 }],
  });
  // 模拟 distributeLeftover：离座庄家拿余数 7
  room.chipArchives.banker.finalPot += 7;
  assert.strictEqual(room.chipArchives.banker.totalBuyIn, 200);

  const row = settlePlayerChips({
    username: 'banker',
    archive: room.chipArchives.banker,
    player: null,
  });
  assert.strictEqual(row.initial, 200);
  assert.strictEqual(row.final, 87);
  assert.strictEqual(row.delta, -113);
});

run('bumpInitialBuyIn keeps fallback in sync when pending applied', () => {
  const room = makeRoom({
    initialBuyIns: [{ username: 'a', nickname: '甲', buyIn: 200 }],
  });
  bumpInitialBuyIn(room, 'a', '甲', 50);
  assert.strictEqual(room.initialBuyIns[0].buyIn, 250);
});

run('reclaim then spectate-leave full conservation story', () => {
  const room = makeRoom({
    seats: [null],
    initialBuyIns: [{ username: 'a', nickname: '甲', buyIn: 200 }],
  });
  accumulateChipArchive(room, {
    username: 'a',
    nickname: '甲',
    totalBuyIn: 200,
    finalPot: 80,
  });
  assert.strictEqual(getCarryChips(room, 'a'), 80);

  const carry = 80;
  const topUp = 20;
  reclaimChipArchive(room, 'a', carry);
  bumpInitialBuyIn(room, 'a', '甲', topUp);
  room.seats[0] = {
    username: 'a',
    nickname: '甲',
    buyIn: carry + topUp,
    segmentBuyIn: topUp,
  };

  // 下局未开就离开
  archivePlayerOrSeat(room, 'a', { player: null, clearSeat: true });
  const row = settlePlayerChips({
    username: 'a',
    archive: room.chipArchives.a,
    player: null,
    fallbackBuyIn: room.initialBuyIns[0].buyIn,
  });
  assert.strictEqual(room.initialBuyIns[0].buyIn, 220);
  assert.strictEqual(row.initial, 220);
  assert.strictEqual(row.final, 100);
  assert.strictEqual(row.delta, -120);
});

console.log('\nChip-archive risk simulations finished.');
