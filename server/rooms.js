/* ========== 房间系统：创建/加入/座位管理/游戏状态 ========== */
const { attachLogger, getLogger } = require('./game-logger');
const { accumulateChipArchive, reclaimChipArchive, getCarryChips, archivePlayerOrSeat } = require('./chip-ledger');
const { getRoomExitBlockReason } = require('./room-exit-rules');

// 内存存储所有房间
const roomsByCode = new Map();

// 座位固化编号（逆时针，底=1）：底→右→上→左；下标 0..7 = 座位号 1..8；下标+1 = 逆时针下一家
const SEAT_IDS = ['bottom-0','right-1','right-0','top-1','top-0','left-1','left-0','bottom-1'];

const DEFAULT_BUY_IN = 100;
const ALLOWED_DURATIONS = [30, 60, 120, 180, 240];
const ALLOWED_EXTEND = [15, 30, 60];
const EMPTY_ROOM_DESTROY_MS = 5 * 60 * 1000;
const LOBBY_GHOST_TIMEOUT_MS = 90 * 1000;

let onRoomMapChanged = null;
function setRoomMapChangeHandler(fn) {
  onRoomMapChanged = typeof fn === 'function' ? fn : null;
}

function isRoomFullyEmpty(room) {
  return !!room && room.members.length === 0 && room.seats.every((s) => s === null);
}

function cancelEmptyRoomDestroy(room) {
  if (!room) return;
  if (room.emptyDestroyTimer) {
    clearTimeout(room.emptyDestroyTimer);
    room.emptyDestroyTimer = null;
  }
  room.emptySince = null;
}

function destroyEmptyRoom(code) {
  const room = roomsByCode.get(code);
  if (!room || !isRoomFullyEmpty(room)) return false;
  cancelEmptyRoomDestroy(room);
  getLogger(room)?.close();
  room.logger = null;
  for (const ws of room.ws) {
    try { ws.close(); } catch { /* ignore */ }
  }
  room.ws.clear();
  roomsByCode.delete(code);
  try { onRoomMapChanged?.(); } catch { /* ignore */ }
  return true;
}

function scheduleEmptyRoomDestroy(code) {
  const room = roomsByCode.get(code);
  if (!room || !isRoomFullyEmpty(room)) return;
  if (room.emptyDestroyTimer) return;
  room.emptySince = room.emptySince || Date.now();
  room.emptyDestroyTimer = setTimeout(() => {
    destroyEmptyRoom(code);
  }, EMPTY_ROOM_DESTROY_MS);
}

function normalizeDurationMinutes(value, fallback = 120) {
  const n = Number(value);
  if (ALLOWED_DURATIONS.includes(n)) return n;
  return fallback;
}

function formatRemainText(endsAt) {
  if (!endsAt) return '';
  const remainMs = Math.max(0, endsAt - Date.now());
  const totalSec = Math.floor(remainMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `剩余 ${h}小时${m}分`;
  if (m > 0) return `剩余 ${m}分`;
  return '剩余不足1分';
}

// 生成6位数字房间号
function genRoomCode() {
  let code;
  do { code = String(Math.floor(100 + Math.random() * 900)); }
  while (roomsByCode.has(code));
  return code;
}

// 创建房间
function createRoom(host, options = {}) {
  const code = genRoomCode();
  const durationMinutes = normalizeDurationMinutes(
    options.durationMinutes ?? options.roundLimit,
    120
  );
  const room = {
    code,
    name: options.name || '扯旋房间',
    host: host.username,
    creator: host.username,
    durationMinutes,
    endsAt: null,
    extendedMinutes: 0,
    minBuyIn: options.minBuyIn || DEFAULT_BUY_IN,
    members: [{ username: host.username, nickname: host.nickname, ready: false, avatar_path: host.avatar_path || null }],
    seats: Array(8).fill(null),
    gameStarted: false,
    gameFinished: false,
    gameRound: 0,
    paused: false,
    endAfterHand: false,
    createdAt: Date.now(),
    ws: new Set(),
    disconnected: {},
  };
  attachLogger(room);
  roomsByCode.set(code, room);
  return room;
}

function joinRoom(code, user) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (room.disbanded) return { ok: false, msg: '房间已解散' };
  // 房间成员含观战席，放宽上限；8 个座位满了仍可进房观战
  if (room.members.length >= 20) return { ok: false, msg: '房间已满' };
  if (room.members.find(m => m.username === user.username)) {
    return { ok: false, msg: '你已在该房间内' };
  }
  room.members.push({ username: user.username, nickname: user.nickname, ready: false, avatar_path: user.avatar_path || null });
  delete room.disconnected[user.username];
  cancelEmptyRoomDestroy(room);
  getLogger(room)?.logMember('join', user);
  return { ok: true, room };
}

function getRoomByCode(code) { return roomsByCode.get(code); }

function summarizeRoom(room, viewerUsername = null) {
  const seatedCount = room.seats.filter(s => s !== null).length;
  const memberCount = room.members.length;
  let statusText;
  if (room.gameStarted) {
    const remain = formatRemainText(room.endsAt);
    statusText = remain
      ? `已开局（${seatedCount}人）第${room.gameRound}局 · ${remain}`
      : `已开局（${seatedCount}人）第${room.gameRound}局`;
  } else {
    statusText = `等待中（${memberCount}人）· ${room.durationMinutes}分钟`;
  }
  const iAmMember = !!(viewerUsername && room.members.some((m) => m.username === viewerUsername));
  // 仅房主本人在场、且未开局时可销毁
  const canDisband = !!(
    viewerUsername
    && room.host === viewerUsername
    && iAmMember
    && !room.gameStarted
    && !room.members.some((m) => m.username !== viewerUsername)
  );
  return {
    code: room.code,
    name: room.name,
    host: room.host,
    creator: room.creator,
    durationMinutes: room.durationMinutes,
    endsAt: room.endsAt || null,
    extendedMinutes: room.extendedMinutes || 0,
    minBuyIn: room.minBuyIn,
    gameStarted: room.gameStarted,
    gameRound: room.gameRound,
    paused: !!room.paused,
    endAfterHand: !!room.endAfterHand,
    memberCount,
    seatedCount,
    createdAt: room.createdAt,
    statusText,
    canSpectate: room.gameStarted && seatedCount >= 2,
    iAmMember,
    canDisband,
  };
}

function getRoomsByCreator(username) {
  const result = [];
  for (const room of roomsByCode.values()) {
    if (room.creator !== username) continue;
    if (room.disbanded) continue;
    if (room.members.length > 0 && !room.gameFinished) {
      result.push(summarizeRoom(room, username));
    }
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

/** 自己创建的 + 好友（其他玩家）创建的可见房间 */
function getVisibleRooms(username) {
  const result = [];
  for (const room of roomsByCode.values()) {
    if (room.disbanded) continue;
    if (room.members.length === 0 || room.gameFinished) continue;
    // 所有玩家可见彼此房间（隐式全员好友）
    result.push(summarizeRoom(room, username));
  }
  return result.sort((a, b) => {
    // 自己的房间优先
    const aMine = a.creator === username || a.host === username ? 1 : 0;
    const bMine = b.creator === username || b.host === username ? 1 : 0;
    if (aMine !== bMine) return bMine - aMine;
    return b.createdAt - a.createdAt;
  });
}

function getActiveRoomCount() {
  let n = 0;
  for (const room of roomsByCode.values()) {
    if (room.disbanded) continue;
    if (room.members.length > 0 && !room.gameFinished) n++;
  }
  return n;
}

function getRoomInfo(code, user) {
  const room = roomsByCode.get(code);
  if (!room) return null;
  const username = user?.username || null;
  const info = {
    code: room.code, name: room.name, host: room.host, creator: room.creator,
    durationMinutes: room.durationMinutes,
    endsAt: room.endsAt || null,
    extendedMinutes: room.extendedMinutes || 0,
    minBuyIn: room.minBuyIn,
    members: room.members.map(m => ({ username: m.username, nickname: m.nickname, ready: m.ready })),
    seats: room.seats.map(s => s ? { ...s, ready: !!s.ready } : null),
    gameStarted: room.gameStarted,
    gameRound: room.gameRound,
    paused: !!room.paused,
    endAfterHand: !!room.endAfterHand,
    disbanded: !!room.disbanded,
    createdAt: room.createdAt,
    myCarryChips: username ? getCarryChips(room, username) : 0,
  };
  // 已结束对局：附带终局结算，方便刷新/重连补界面
  if (room.disbanded && room.lastSettlement) {
    info.lastSettlement = room.lastSettlement;
  }
  return info;
}

// 坐下 / 换座
function sitDown(code, username, nickname, seatId, buyIn) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (!SEAT_IDS.includes(seatId)) return { ok: false, msg: '无效的座位' };

  const targetIdx = SEAT_IDS.indexOf(seatId);
  if (room.seats[targetIdx]) return { ok: false, msg: '该座位已被占用' };

  cancelEmptyRoomDestroy(room);

  const existingSeatIdx = room.seats.findIndex(s => s && s.username === username);
  const isSeatChange = existingSeatIdx >= 0;
  const existingSeat = isSeatChange ? { ...room.seats[existingSeatIdx] } : null;
  const midGame = !!room.gameStarted && !!room.game;
  const member = room.members.find(m => m.username === username);
  const defaultBuyIn = room.minBuyIn || DEFAULT_BUY_IN;

  if (midGame) {
    const engine = room.game;
    const phase = engine.state?.phase;
    const inHand = ['betting1', 'betting2', 'betting3', 'dealing', 'selecting', 'comparing'].includes(phase);
    const p = engine.getPlayer(username);

    if (isSeatChange) {
      // 换座：局间，或本局已弃牌等待结束
      if (inHand && !(p && p.folded)) {
        return { ok: false, msg: '对局进行中，暂时不能换座' };
      }
      if (engine.nextBankerUsername && engine.nextBankerUsername() === username) {
        return { ok: false, msg: '下一局你当庄，当完庄后才能换座' };
      }
      room.seats[existingSeatIdx] = null;
      room.seats[targetIdx] = {
        ...existingSeat,
        username,
        nickname,
        buyIn: p ? p.pot : existingSeat.buyIn,
        ready: true,
        avatar_path: member?.avatar_path || existingSeat.avatar_path || null,
      };
      if (engine.rebuildPlayersFromSeats) engine.rebuildPlayersFromSeats(room.seats);
      getLogger(room)?.logSeat('change', {
        username, nickname, seatId, seatNo: targetIdx + 1, buyIn: room.seats[targetIdx].buyIn,
      });
      return { ok: true, seats: room.seats };
    }

    // 新入座：对局中坐下则本局观战，下局加入
    // buyIn = 本笔新掏的钱（topUp）；结余从 chipArchives 带回
    const carry = getCarryChips(room, username);
    const topUpRaw = buyIn === undefined || buyIn === null || buyIn === ''
      ? (carry > 0 ? 0 : defaultBuyIn)
      : Number(buyIn);
    const topUp = Math.max(0, Math.floor(Number.isFinite(topUpRaw) ? topUpRaw : 0));
    const minBuy = room.minBuyIn || 0;
    const stack = carry + topUp;
    if (stack < minBuy) {
      if (carry > 0) {
        return {
          ok: false,
          msg: `你离开时筹码为 ${carry}，不够当前最少带入 ${minBuy}，请加簸至少 ${minBuy - carry}`,
        };
      }
      return { ok: false, msg: `至少需要带入 ${minBuy} 分` };
    }
    if (carry > 0) {
      reclaimChipArchive(room, username, carry);
    }
    // 有结余时 segmentBuyIn 只记新钱；无结余时整笔都是新带入
    const segmentBuyIn = carry > 0 ? topUp : stack;
    room.seats[targetIdx] = {
      username,
      nickname,
      buyIn: stack,
      segmentBuyIn,
      ready: true,
      avatar_path: member?.avatar_path || null,
      joiningNextRound: inHand,
    };
    if (!room.initialBuyIns) room.initialBuyIns = [];
    if (segmentBuyIn > 0) {
      const existingBuyIn = room.initialBuyIns.find(i => i.username === username);
      if (existingBuyIn) {
        existingBuyIn.buyIn = (existingBuyIn.buyIn || 0) + segmentBuyIn;
        if (nickname) existingBuyIn.nickname = nickname;
      } else {
        room.initialBuyIns.push({ username, nickname, buyIn: segmentBuyIn });
      }
    } else {
      // topUp=0 纯带回：确保 initialBuyIns 仍有该用户条目（开局已有则不动）
      const existingBuyIn = room.initialBuyIns.find(i => i.username === username);
      if (!existingBuyIn) {
        room.initialBuyIns.push({ username, nickname, buyIn: 0 });
      } else if (nickname) {
        existingBuyIn.nickname = nickname;
      }
    }
    getLogger(room)?.logSeat('sit', {
      username, nickname, seatId, seatNo: targetIdx + 1, buyIn: stack,
      spectating: inHand, carry, topUp,
    });
    // 对局进行中入座：只占座观战，下局开始才纳入 players
    return { ok: true, seats: room.seats, spectating: inHand, carry, topUp, stack };
  }

  if (room.gameStarted) return { ok: false, msg: '游戏进行中，请等待下一局' };

  if (isSeatChange) room.seats[existingSeatIdx] = null;
  const finalBuyIn = buyIn || existingSeat?.buyIn || defaultBuyIn;
  if (finalBuyIn < (room.minBuyIn || 0)) {
    return { ok: false, msg: `至少需要带入 ${room.minBuyIn} 分` };
  }
  room.seats[targetIdx] = {
    username,
    nickname,
    buyIn: finalBuyIn,
    ready: false,
    avatar_path: member?.avatar_path || null,
  };
  getLogger(room)?.logSeat(isSeatChange ? 'change' : 'sit', {
    username, nickname, seatId, seatNo: targetIdx + 1, buyIn: finalBuyIn,
  });
  return { ok: true, seats: room.seats };
}

// 座位准备状态切换（房主不需要准备）
function setSeatReady(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (room.gameStarted) return { ok: false, msg: '游戏已开始' };
  if (room.host === username) return { ok: false, msg: '房主不需要准备' };
  const seat = room.seats.find(s => s && s.username === username);
  if (!seat) return { ok: false, msg: '你还没坐下' };
  seat.ready = !seat.ready;
  return { ok: true };
}

// 房主开始游戏：至少2人坐下，非房主玩家全部准备
function startGame(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (room.host !== username) return { ok: false, msg: '只有房主可以开始游戏' };
  if (room.gameStarted) return { ok: false, msg: '游戏已经开始' };

  const seated = room.seats.filter(s => s !== null);
  if (seated.length < 2) return { ok: false, msg: '至少需要2人坐下' };

  // 只检查非房主玩家的准备状态
  const notReady = seated.filter(s => s.username !== room.host && !s.ready);
  if (notReady.length > 0) {
    const names = notReady.map(s => s.nickname).join('、');
    return { ok: false, msg: `${names} 还未准备` };
  }

  room.gameStarted = true;
  room.gameRound = 1;
  room.extendedMinutes = 0;
  room.endsAt = Date.now() + (room.durationMinutes || 120) * 60 * 1000;
  room.chipArchives = {};
  room.initialBuyIns = seated.map(s => ({
    username: s.username,
    nickname: s.nickname,
    buyIn: s.buyIn,
  }));
  return { ok: true, gameStarted: true, gameRound: 1, endsAt: room.endsAt };
}

function standUp(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };

  const idx = room.seats.findIndex(s => s && s.username === username);
  if (idx < 0) return { ok: false, msg: '你不在座位上' };

  if (room.gameStarted && room.game) {
    const engine = room.game;
    const p = engine.getPlayer(username);
    // 整场进行中：仅局间可起身；局中需已弃牌
    const exitBlockReason = getRoomExitBlockReason(room, username);
    if (exitBlockReason) return { ok: false, msg: exitBlockReason };
    // 保留筹码档案（累加本段；含观战占座 / pending 加簸）
    const archived = archivePlayerOrSeat(room, username, {
      player: p || null,
      clearSeat: true,
      rebuild: true,
    });
    getLogger(room)?.logSeat('stand', {
      username,
      nickname: archived?.nickname || p?.nickname || room.chipArchives[username]?.nickname,
      seatId: SEAT_IDS[idx],
      seatNo: idx + 1,
      finalPot: archived?.finalPot,
    });
    return { ok: true, seats: room.seats };
  }

  if (room.gameStarted) return { ok: false, msg: '游戏进行中，不能起身' };
  const stood = room.seats[idx];
  room.seats[idx] = null;
  getLogger(room)?.logSeat('stand', {
    username, nickname: stood?.nickname, seatId: SEAT_IDS[idx], seatNo: idx + 1, buyIn: stood?.buyIn,
  });
  return { ok: true, seats: room.seats };
}

function finishRound(code) {
  const room = roomsByCode.get(code);
  if (!room) return;
  room.gameStarted = false;
  room.seats = room.seats.map(s => {
    if (!s) return null;
    return room.members.find(m => m.username === s.username) ? s : null;
  });
  const seatedCount = room.seats.filter(s => s !== null).length;
  if (seatedCount >= 2) { room.gameStarted = true; room.gameRound++; }
}

function leaveRoom(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return null;
  const member = room.members.find(m => m.username === username);
  getLogger(room)?.logMember('leave', { username, nickname: member?.nickname || username });
  room.members = room.members.filter(m => m.username !== username);
  const seatIdx = room.seats.findIndex(s => s && s.username === username);
  if (seatIdx >= 0) room.seats[seatIdx] = null;
  // 房主离开：随机转给仍在房间内的人；离开者不再是房主
  if (room.host === username && room.members.length > 0) {
    const pick = room.members[Math.floor(Math.random() * room.members.length)];
    room.host = pick.username;
  }
  if (room.members.length === 0) {
    scheduleEmptyRoomDestroy(code);
    return null;
  }
  return room;
}

// ========== 断线重连 ==========
const DISCONNECT_TIMEOUT = 60000;

function markDisconnected(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return;
  room.disconnected[username] = Date.now();
  getLogger(room)?.logDisconnect('mark', username);
  broadcastRoom(room);
}

function handleReconnect(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (!room.members.find(m => m.username === username)) {
    return { ok: false, msg: '你不在该房间内' };
  }
  const wasDisconnected = !!room.disconnected[username];
  delete room.disconnected[username];
  return { ok: true, room, wasDisconnected };
}

function checkDisconnectTimeouts() {
  const now = Date.now();
  for (const room of [...roomsByCode.values()]) {
    // 未开局：清理幽灵成员，并兜底销毁空房
    if (!room.game || !room.game.state) {
      for (const [username, disconnectedAt] of Object.entries(room.disconnected || {})) {
        if (now - disconnectedAt <= LOBBY_GHOST_TIMEOUT_MS) continue;
        const live = [...room.ws].some(
          (ws) => ws.username === username && ws.readyState === 1,
        );
        if (live) {
          delete room.disconnected[username];
          continue;
        }
        leaveRoom(room.code, username);
        broadcastRoom(roomsByCode.get(room.code));
      }
      if (
        isRoomFullyEmpty(room)
        && room.emptySince
        && now - room.emptySince >= EMPTY_ROOM_DESTROY_MS
      ) {
        destroyEmptyRoom(room.code);
      }
      continue;
    }

    const s = room.game.state;

    for (const [username, disconnectedAt] of Object.entries(room.disconnected)) {
      if (now - disconnectedAt <= DISCONNECT_TIMEOUT) continue;
      const engine = room.game;
      const p = engine.getPlayer(username);

      // 对局中：先自动弃牌
      if (p && !p.folded && s.activeIds.includes(username) &&
          !['idle', 'done', 'gameover'].includes(s.phase)) {
        const before = { pot: p.pot, committed: p.committed, foldPaid: p.foldPaid || 0 };
        const result = engine.doFold(p, { force: true });
        if (result) {
          getLogger(room)?.logAction(engine, result, { timeout: true, before });
          const msg = JSON.stringify({ type: 'game_action', action: { ...result, timeout: true } });
          for (const ws of room.ws) { if (ws.readyState === 1) ws.send(msg); }
          if (s.toAct.length > 0 && s.toAct[0] === username) s.toAct.shift();
          engine.advanceToAct();
        }
      }

      // 归档筹码并清空座位（有 engine 玩家或仅观战占座均可）
      const archived = archivePlayerOrSeat(room, username, {
        player: p || null,
        clearSeat: true,
        rebuild: true,
      });
      getLogger(room)?.logDisconnect('timeout_remove', username, {
        finalPot: archived?.finalPot,
      });

      delete room.disconnected[username];
      broadcastRoom(room);

      const done = engine.checkBettingDone();
      if (done.done && !['idle', 'done', 'gameover'].includes(s.phase)) {
        // 交给 server 侧统一处理（此处仅广播状态；server 的 interval 不直接调 handleBettingDone）
        if (done.reason === 'all_folded' || done.reason === 'all_sanhua' || done.reason === 'rest_cross') {
          s.phase = 'done';
          s.compareResult = { winner: done.winner || null, reason: done.reason };
          broadcastRoundStateLocal(room);
        } else if (done.reason === 'all_in_showdown') {
          engine.dealRemainingCardsToShowdown();
          broadcastRoundStateLocal(room);
        } else if (s.betRound === 1) {
          setTimeout(() => { engine.dealThirdCard(); broadcastRoundStateLocal(room); }, 600);
        } else if (s.betRound === 2) {
          setTimeout(() => { engine.dealFourthCard(); broadcastRoundStateLocal(room); }, 600);
        } else {
          s.phase = 'selecting';
          broadcastRoundStateLocal(room);
        }
      } else {
        broadcastRoundStateLocal(room);
      }

      // 在座不足 2 人：局间立即结束；对局中等本局结束后由 startNextRoundAuto 收尾
      const seated = room.seats.filter(seat => seat !== null).length;
      if (seated < 2) {
        room.pendingEndReason = 'players';
        if (['done', 'idle', 'gameover'].includes(s.phase) || seated === 0) {
          room.forceEndGame = true;
        }
      }
    }
  }
}

function broadcastRoundStateLocal(room) {
  if (!room.game) return;
  const engine = room.game;
  const pubMsg = JSON.stringify({ type: 'game_state', state: engine.getPublicState() });
  for (const ws of room.ws) { if (ws.readyState === 1) ws.send(pubMsg); }
  for (const ws of room.ws) {
    if (ws.readyState === 1 && ws.username) {
      ws.send(JSON.stringify({ type: 'game_private', state: engine.getPrivateState(ws.username) }));
    }
  }
}

setInterval(checkDisconnectTimeouts, 10000);

function broadcastRoom(room) {
  if (!room) return;
  for (const ws of room.ws) {
    if (ws.readyState !== 1) continue;
    const payload = {
      code: room.code, name: room.name, host: room.host,
      durationMinutes: room.durationMinutes,
      endsAt: room.endsAt || null,
      extendedMinutes: room.extendedMinutes || 0,
      minBuyIn: room.minBuyIn,
      members: room.members.map(m => ({
        username: m.username, nickname: m.nickname, ready: m.ready,
        disconnected: !!room.disconnected[m.username],
      })),
      seats: room.seats.map(s => s ? { ...s, ready: !!s.ready } : null),
      gameStarted: room.gameStarted,
      gameRound: room.gameRound,
      paused: !!room.paused,
      endAfterHand: !!room.endAfterHand,
      disbanded: !!room.disbanded,
      myCarryChips: getCarryChips(room, ws.username),
    };
    if (room.disbanded && room.lastSettlement) {
      payload.lastSettlement = room.lastSettlement;
    }
    ws.send(JSON.stringify({ type: 'room_update', room: payload }));
  }
}

function getSeatIds() { return SEAT_IDS; }

module.exports = {
  roomsByCode, SEAT_IDS, DEFAULT_BUY_IN,
  ALLOWED_DURATIONS, ALLOWED_EXTEND, normalizeDurationMinutes,
  createRoom, joinRoom, getRoomInfo, getRoomByCode, getRoomsByCreator,
  getVisibleRooms, getActiveRoomCount, summarizeRoom,
  setReady: () => {}, // deprecated, use setSeatReady
  sitDown, standUp, setSeatReady, startGame,
  leaveRoom, broadcastRoom, finishRound,
  markDisconnected, handleReconnect,
  getSeatIds,
  setRoomMapChangeHandler, destroyEmptyRoom, scheduleEmptyRoomDestroy, cancelEmptyRoomDestroy,
  accumulateChipArchive,
  archivePlayerOrSeat,
};
