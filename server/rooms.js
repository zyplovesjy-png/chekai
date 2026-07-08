/* ========== 房间系统：创建/加入/座位管理/游戏状态 ========== */

// 内存存储所有房间
const roomsByCode = new Map();

const SEAT_IDS = ['top-0','top-1','right-0','right-1','bottom-0','bottom-1','left-0','left-1'];

const GAME_TYPES = {
  '1,3':  { name:'1、3',  firstPot:100 },
  '5,10': { name:'5、10', firstPot:500 },
  '5,20': { name:'5、20', firstPot:1000 },
};

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
  const room = {
    code,
    name: options.name || '扯旋房间',
    host: host.username,
    creator: host.username,
    roundLimit: options.roundLimit || 8,
    minBuyIn: options.minBuyIn || 100,
    members: [{ username: host.username, nickname: host.nickname, ready: false, avatar_path: host.avatar_path || null }],
    seats: Array(8).fill(null),
    gameType: '1,3',
    gameStarted: false,
    gameFinished: false,
    gameRound: 0,
    createdAt: Date.now(),
    ws: new Set(),
    disconnected: {},
  };
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
  return { ok: true, room };
}

function getRoomByCode(code) { return roomsByCode.get(code); }

function getRoomsByCreator(username) {
  const result = [];
  for (const room of roomsByCode.values()) {
    if (room.creator !== username) continue;
    if (room.disbanded) continue;
    if (room.members.length > 0 && !room.gameFinished) {
      result.push({
        code: room.code, name: room.name, host: room.host,
        roundLimit: room.roundLimit, minBuyIn: room.minBuyIn,
        gameStarted: room.gameStarted, gameRound: room.gameRound,
        memberCount: room.members.length,
        seatedCount: room.seats.filter(s => s !== null).length,
        createdAt: room.createdAt,
      });
    }
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

function getRoomInfo(code, user) {
  const room = roomsByCode.get(code);
  if (!room) return null;
  return {
    code: room.code, name: room.name, host: room.host, creator: room.creator,
    roundLimit: room.roundLimit, minBuyIn: room.minBuyIn,
    members: room.members.map(m => ({ username: m.username, nickname: m.nickname, ready: m.ready })),
    seats: room.seats.map(s => s ? { ...s, ready: !!s.ready } : null),
    gameType: room.gameType,
    gameStarted: room.gameStarted,
    gameRound: room.gameRound,
    createdAt: room.createdAt,
  };
}

// 坐下 / 换座
function sitDown(code, username, nickname, seatId, buyIn) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (!SEAT_IDS.includes(seatId)) return { ok: false, msg: '无效的座位' };

  const targetIdx = SEAT_IDS.indexOf(seatId);
  if (room.seats[targetIdx]) return { ok: false, msg: '该座位已被占用' };

  const existingSeatIdx = room.seats.findIndex(s => s && s.username === username);
  const isSeatChange = existingSeatIdx >= 0;
  const existingSeat = isSeatChange ? { ...room.seats[existingSeatIdx] } : null;
  const midGame = !!room.gameStarted && !!room.game;
  const member = room.members.find(m => m.username === username);
  const config = GAME_TYPES[room.gameType];

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
      return { ok: true, seats: room.seats };
    }

    // 新入座：对局中坐下则本局观战，下局加入
    const finalBuyIn = buyIn || config.firstPot;
    if (finalBuyIn < (room.minBuyIn || 0)) {
      return { ok: false, msg: `至少需要带入 ${room.minBuyIn} 分` };
    }
    room.seats[targetIdx] = {
      username,
      nickname,
      buyIn: finalBuyIn,
      ready: true,
      avatar_path: member?.avatar_path || null,
      joiningNextRound: inHand,
    };
    if (!room.initialBuyIns) room.initialBuyIns = [];
    if (!room.initialBuyIns.find(i => i.username === username)) {
      room.initialBuyIns.push({ username, nickname, buyIn: finalBuyIn });
    }
    if (engine.rebuildPlayersFromSeats) engine.rebuildPlayersFromSeats(room.seats);
    return { ok: true, seats: room.seats, spectating: inHand };
  }

  if (room.gameStarted) return { ok: false, msg: '游戏进行中，请等待下一局' };

  if (isSeatChange) room.seats[existingSeatIdx] = null;
  const finalBuyIn = buyIn || existingSeat?.buyIn || config.firstPot;
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
  room.chipArchives = {};
  room.initialBuyIns = seated.map(s => ({
    username: s.username,
    nickname: s.nickname,
    buyIn: s.buyIn,
  }));
  return { ok: true, gameStarted: true, gameRound: 1 };
}

function standUp(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };

  const idx = room.seats.findIndex(s => s && s.username === username);
  if (idx < 0) return { ok: false, msg: '你不在座位上' };

  if (room.gameStarted && room.game) {
    const engine = room.game;
    const phase = engine.state?.phase;
    const inHand = ['betting1','betting2','betting3','dealing','selecting','comparing'].includes(phase);
    const p = engine.getPlayer(username);
    // 整场进行中：仅局间可起身；局中需已弃牌
    if (inHand && p && !p.folded) {
      return { ok: false, msg: '对局进行中，请先弃牌或等待本局结束' };
    }
    // 保留筹码档案
    if (!room.chipArchives) room.chipArchives = {};
    room.chipArchives[username] = {
      username,
      nickname: p?.nickname || room.seats[idx].nickname,
      initialBuyIn: (room.initialBuyIns || []).find(i => i.username === username)?.buyIn || room.seats[idx].buyIn || 0,
      totalBuyIn: p?.totalBuyIn || room.seats[idx].buyIn || 0,
      finalPot: p ? (p.pot + (p.committed || 0) + (p.pendingBuyIn || 0)) : room.seats[idx].buyIn,
      leftAt: Date.now(),
    };
    room.seats[idx] = null;
    if (engine.rebuildPlayersFromSeats) engine.rebuildPlayersFromSeats(room.seats);
    return { ok: true, seats: room.seats };
  }

  if (room.gameStarted) return { ok: false, msg: '游戏进行中，不能起身' };
  room.seats[idx] = null;
  return { ok: true, seats: room.seats };
}

function setGameType(code, username, gameType) {
  const room = roomsByCode.get(code);
  if (!room) return { ok: false, msg: '房间不存在' };
  if (room.host !== username) return { ok: false, msg: '只有房主可以设置' };
  if (!GAME_TYPES[gameType]) return { ok: false, msg: '无效的游戏类型' };
  if (room.gameStarted) return { ok: false, msg: '游戏进行中，不能修改' };
  room.gameType = gameType;
  return { ok: true, gameType };
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
  room.members = room.members.filter(m => m.username !== username);
  const seatIdx = room.seats.findIndex(s => s && s.username === username);
  if (seatIdx >= 0) room.seats[seatIdx] = null;
  if (room.host === username && room.members.length > 0) {
    room.host = room.members[0].username;
  }
  if (room.members.length === 0) { roomsByCode.delete(code); return null; }
  return room;
}

// ========== 断线重连 ==========
const DISCONNECT_TIMEOUT = 60000;

function markDisconnected(code, username) {
  const room = roomsByCode.get(code);
  if (!room) return;
  room.disconnected[username] = Date.now();
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
  for (const room of roomsByCode.values()) {
    if (!room.game || !room.game.state) continue;
    const s = room.game.state;
    if (s.phase === 'idle' || s.phase === 'done' || s.phase === 'gameover') continue;

    for (const [username, disconnectedAt] of Object.entries(room.disconnected)) {
      if (now - disconnectedAt > DISCONNECT_TIMEOUT) {
        const engine = room.game;
        const p = engine.getPlayer(username);
        if (p && !p.folded && s.activeIds.includes(username)) {
          const result = engine.doFold(p);
          if (result) {
            const msg = JSON.stringify({ type: 'game_action', action: result });
            for (const ws of room.ws) { if (ws.readyState === 1) ws.send(msg); }
            if (s.toAct.length > 0 && s.toAct[0] === username) s.toAct.shift();
            engine.advanceToAct();
            const done = engine.checkBettingDone();
            if (done.done) {
              if (s.betRound === 1) {
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
          }
        }
        delete room.disconnected[username];
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
  const data = JSON.stringify({
    type: 'room_update',
    room: {
      code: room.code, name: room.name, host: room.host,
      roundLimit: room.roundLimit, minBuyIn: room.minBuyIn,
      members: room.members.map(m => ({
        username: m.username, nickname: m.nickname, ready: m.ready,
        disconnected: !!room.disconnected[m.username],
      })),
      seats: room.seats.map(s => s ? { ...s, ready: !!s.ready } : null),
      gameType: room.gameType,
      gameStarted: room.gameStarted,
      gameRound: room.gameRound,
    }
  });
  for (const ws of room.ws) { if (ws.readyState === 1) ws.send(data); }
}

function getSeatIds() { return SEAT_IDS; }
function getGameTypes() { return GAME_TYPES; }

module.exports = {
  roomsByCode, SEAT_IDS, GAME_TYPES,
  createRoom, joinRoom, getRoomInfo, getRoomByCode, getRoomsByCreator,
  setReady: () => {}, // deprecated, use setSeatReady
  sitDown, standUp, setGameType, setSeatReady, startGame,
  leaveRoom, broadcastRoom, finishRound,
  markDisconnected, handleReconnect,
  getSeatIds, getGameTypes,
};
