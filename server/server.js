/* ========== 扯旋游戏服务器：Express + WebSocket + GameEngine ========== */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const { login, verifyToken, authMiddleware, getProfile, setAvatar, listUsers } = require('./users');
const {
  roomsByCode, createRoom, joinRoom, getRoomInfo,
  setSeatReady, startGame, leaveRoom, broadcastRoom,
  sitDown, standUp, finishRound,
  getRoomByCode, getRoomsByCreator,
  markDisconnected, handleReconnect,
} = require('./rooms');
const { GameEngine } = require('./game');
const { resolveAllInShowdown } = require('./betting-flow');
const { saveGameRecord, getUserStats, getAllUserStats, getUserGameHistory } = require('./db');
const { attachLogger, getLogger } = require('./game-logger');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 头像上传
const avatarsDir = path.join(__dirname, '..', 'public', 'avatars');
if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: avatarsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `${req.user.username}${ext}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

/* ---------- 工具 ---------- */
function sendToRoom(room, data) {
  const msg = JSON.stringify(data);
  for (const ws of room.ws) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

function sendToUser(room, username, data) {
  const msg = JSON.stringify(data);
  for (const ws of room.ws) {
    if (ws.username === username && ws.readyState === 1) ws.send(msg);
  }
}

function sendError(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', msg }));
}

function parseBetAmount(value) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  return amount;
}

/* ---------- 回合计时器 ---------- */
const TURN_TIMEOUT = 60000;   // 60秒操作时间
const INACTIVITY_LIMIT = 180000; // 3分钟无操作视为掉线
const turnTimers = new Map(); // code -> { main, warning }

function clearTurnTimer(code) {
  const t = turnTimers.get(code);
  if (t) {
    clearTimeout(t.main);
    if (t.warning) clearTimeout(t.warning);
    turnTimers.delete(code);
  }
}

function startTurnTimer(room) {
  clearTurnTimer(room.code);
  if (!room.game) return;
  const engine = room.game;
  const s = engine.state;
  if (!['betting1','betting2','betting3'].includes(s.phase)) return;
  if (!s.toAct || s.toAct.length === 0) return;

  const actor = s.toAct[0];

  // 30秒时发送警告提示音
  const warning = setTimeout(() => {
    sendToUser(room, actor, { type: 'turn_warning', secondsLeft: 30 });
  }, 30000);

  // 60秒超时：可休则自动休，否则自动弃牌并支付当前喊价
  const main = setTimeout(() => {
    turnTimers.delete(room.code);
    if (!room.game) return;
    const engine2 = room.game;
    const s2 = engine2.state;
    if (!s2.toAct || s2.toAct.length === 0 || s2.toAct[0] !== actor) return;

    const p = engine2.getPlayer(actor);
    if (!p || p.folded) return;

    const before = { pot: p.pot, committed: p.committed, foldPaid: p.foldPaid || 0 };
    let result;
    if (engine2.canRestNow()) {
      result = engine2.doRest(p);
    } else {
      result = engine2.doFold(p);
    }
    if (!result) return;
    getLogger(room)?.logAction(engine2, result, { timeout: true, before });
    sendToRoom(room, { type: 'game_action', action: { ...result, timeout: true } });
    s2.toAct.shift();
    engine2.advanceToAct();

    // 记录不活跃时间
    if (!s2.playerInactivity) s2.playerInactivity = {};
    if (!s2.playerInactivity[actor]) s2.playerInactivity[actor] = Date.now();

    // 检查是否超过3分钟无操作 → 移出座位但保留筹码档案
    if (Date.now() - s2.playerInactivity[actor] >= INACTIVITY_LIMIT) {
      const seatIdx = room.seats.findIndex(seat => seat && seat.username === actor);
      if (seatIdx >= 0) {
        const seat = room.seats[seatIdx];
        if (!room.chipArchives) room.chipArchives = {};
        room.chipArchives[actor] = {
          username: actor,
          nickname: p.nickname || seat.nickname,
          initialBuyIn: (room.initialBuyIns || []).find(i => i.username === actor)?.buyIn || seat.buyIn || 0,
          totalBuyIn: p.totalBuyIn || seat.buyIn || 0,
          finalPot: p.pot + (p.committed || 0) + (p.pendingBuyIn || 0),
          leftAt: Date.now(),
        };
        room.seats[seatIdx] = null;
        if (engine2.rebuildPlayersFromSeats) engine2.rebuildPlayersFromSeats(room.seats);
        getLogger(room)?.logDisconnect('timeout_remove', actor, { finalPot: room.chipArchives[actor].finalPot });
        sendToRoom(room, { type: 'player_timeout', username: actor });
        broadcastRoom(room);
      }
      delete s2.playerInactivity[actor];
    }

    broadcastRoundState(room);
    const done = engine2.checkBettingDone();
    if (done.done) handleBettingDone(room, engine2, done);
  }, TURN_TIMEOUT);

  turnTimers.set(room.code, { main, warning });
}

// 选庄流程：3秒动画后随机选庄并开始第一局
function startBankerSelection(room) {
  const engine = room.game;
  sendToRoom(room, { type: 'banker_selecting' });
  setTimeout(() => {
    if (!room.game) return;
    const bankerIdx = engine.selectBanker();
    const banker = engine.players[bankerIdx];
    sendToRoom(room, {
      type: 'banker_selected',
      banker: banker.username,
      bankerIdx: bankerIdx,
      bankerName: banker.nickname,
    });
    // 1.5秒后开始发牌
    setTimeout(() => {
      if (!room.game) return;
      if (engine.startNewRound()) {
        const log = getLogger(room);
        log?.logRoundStart(engine);
        log?.logDeal(engine, 1);
        broadcastRoundState(room);
      }
    }, 1500);
  }, 3000);
}

function getSeatedEnginePlayers(room) {
  if (!room.game) return [];
  return room.seats
    .map(s => (s ? room.game.getPlayer(s.username) : null))
    .filter(Boolean);
}

function archiveAndRemoveSeat(room, username) {
  const engine = room.game;
  const p = engine?.getPlayer(username);
  const seatIdx = room.seats.findIndex(s => s && s.username === username);
  if (seatIdx < 0 && !p) return;
  if (!room.chipArchives) room.chipArchives = {};
  room.chipArchives[username] = {
    username,
    nickname: p?.nickname || room.seats[seatIdx]?.nickname || username,
    initialBuyIn: (room.initialBuyIns || []).find(i => i.username === username)?.buyIn || 0,
    totalBuyIn: p?.totalBuyIn || room.seats[seatIdx]?.buyIn || 0,
    finalPot: p ? (p.pot + (p.committed || 0) + (p.pendingBuyIn || 0)) : 0,
    leftAt: Date.now(),
  };
  if (seatIdx >= 0) room.seats[seatIdx] = null;
  if (p) p.eliminated = true;
  getLogger(room)?.logDisconnect('broke_exit', username, {
    finalPot: room.chipArchives[username].finalPot,
  });
}

function buildBuyInDecisionPayload(room) {
  const decision = room.awaitingBuyInDecision;
  if (!decision) return null;
  const pending = decision.players.filter(p => !p.choice);
  const pendingNames = pending.map(p => p.nickname || p.username);
  return {
    type: 'awaiting_buyin_decision',
    players: decision.players.map(p => ({
      username: p.username,
      nickname: p.nickname,
      choice: p.choice,
      amount: p.amount,
    })),
    pending: pending.map(p => p.username),
    waitingText: pendingNames.length
      ? `等待 ${pendingNames.join('、')} 加簸或退出…`
      : '正在处理…',
  };
}

function broadcastBuyInDecision(room) {
  const payload = buildBuyInDecisionPayload(room);
  if (!payload) return;
  sendToRoom(room, payload);
  broadcastRoundState(room);
  broadcastRoom(room);
}

/** 局间：有人输光且「有筹码在座」将不足 2 人 → 进入加簸/退出决策 */
function startBrokeBuyInDecision(room, brokePlayers) {
  brokePlayers.forEach(p => { p.eliminated = false; });
  room.awaitingBuyInDecision = {
    players: brokePlayers.map(p => ({
      username: p.username,
      nickname: p.nickname,
      choice: null,
      amount: null,
    })),
  };
  getLogger(room)?.logBuyInDecisionStart?.(
    room.awaitingBuyInDecision.players.map(p => p.username),
  );
  broadcastBuyInDecision(room);
}

function finishBrokeBuyInDecision(room) {
  const decision = room.awaitingBuyInDecision;
  if (!decision) return;
  decision.players.forEach(entry => {
    if (entry.choice === 'settle') {
      archiveAndRemoveSeat(room, entry.username);
    }
  });
  room.awaitingBuyInDecision = null;
  sendToRoom(room, { type: 'buyin_decision_cleared' });
  if (room.game?.rebuildPlayersFromSeats) {
    room.game.rebuildPlayersFromSeats(room.seats);
  }
  broadcastRoom(room);
  startNextRoundAuto(room, { skipBrokeDecision: true });
}

function handleBrokePlayerDecision(room, username, choice, amount) {
  const decision = room.awaitingBuyInDecision;
  if (!decision || !room.game) return { ok: false, msg: '当前无需决策' };
  const entry = decision.players.find(p => p.username === username);
  if (!entry) return { ok: false, msg: '你不在待决策名单中' };
  if (entry.choice) return { ok: false, msg: '你已经选择过了' };

  if (choice === 'settle') {
    entry.choice = 'settle';
    entry.amount = null;
    getLogger(room)?.logDisconnect('broke_choose_settle', username);
  } else if (choice === 'continue') {
    const n = Math.floor(Number(amount) || 0);
    if (n <= 0) return { ok: false, msg: '请先选择加簸金额' };
    const engine = room.game;
    engine.addBuyIn(username, n);
    const p = engine.getPlayer(username);
    if (p && p.pendingBuyIn > 0) {
      p.pot += p.pendingBuyIn;
      p.totalBuyIn = (p.totalBuyIn || 0) + p.pendingBuyIn;
      const applied = p.pendingBuyIn;
      p.pendingBuyIn = 0;
      p.eliminated = false;
      getLogger(room)?.logBuyIn(username, applied, {
        pending: false, applied: true, reason: 'buyin_decision_continue',
      });
      // 同步座位显示
      const seat = room.seats.find(s => s && s.username === username);
      if (seat) seat.buyIn = p.pot;
    }
    entry.choice = 'continue';
    entry.amount = n;
  } else {
    return { ok: false, msg: '无效选择' };
  }

  broadcastBuyInDecision(room);

  const allDone = decision.players.every(p => !!p.choice);
  if (allDone) {
    finishBrokeBuyInDecision(room);
  }
  return { ok: true };
}

// 游戏结束并发送结算
function endGameAndSendSettlement(room, reason) {
  if (!room.game) return;
  room.awaitingBuyInDecision = null;
  const engine = room.game;
  engine.state.phase = 'gameover';
  engine.syncSeatBuyIns();
  saveRoundResults(room);

  const initialBuyIns = room.initialBuyIns || [];
  const playerMap = new Map(engine.players.map(p => [p.username, p]));
  const settlementMap = new Map();

  initialBuyIns.forEach(initial => {
    const p = playerMap.get(initial.username);
    const archive = (room.chipArchives || {})[initial.username];
    // 仍在局内的玩家：pot 可能含未结算喊价预扣，结算时一并计入
    const finalPot = p
      ? p.pot + (p.committed || 0) + (p.pendingBuyIn || 0)
      : (archive ? archive.finalPot : initial.buyIn);
    const totalBuyIn = p
      ? (p.totalBuyIn || initial.buyIn)
      : (archive ? archive.totalBuyIn : initial.buyIn);
    settlementMap.set(initial.username, {
      username: initial.username,
      nickname: initial.nickname || p?.nickname || initial.username,
      initial: totalBuyIn,
      final: finalPot,
      delta: finalPot - totalBuyIn,
    });
  });

  // 中途加入、档案里有但 initialBuyIns 没有的
  Object.values(room.chipArchives || {}).forEach(archive => {
    if (settlementMap.has(archive.username)) return;
    settlementMap.set(archive.username, {
      username: archive.username,
      nickname: archive.nickname,
      initial: archive.totalBuyIn,
      final: archive.finalPot,
      delta: archive.finalPot - archive.totalBuyIn,
    });
  });

  const settlement = [...settlementMap.values()];
  const log = getLogger(room);
  log?.logSessionEnd(settlement, reason);
  log?.close();
  room.logger = null;
  sendToRoom(room, { type: 'game_settlement', settlement, reason });

  room.game = null;
  room.gameStarted = false;
  room.gameRound = 0;
  room.chipArchives = {};
  // 游戏全局结束后在后台解散房间，玩家点击关闭时各自离开
  room.disbanded = true;
  broadcastRoom(room);
}

// 庄家轮转并开始下一局
function startNextRoundAuto(room, opts = {}) {
  if (!room.game) return;
  if (room.awaitingBuyInDecision && !opts.skipBrokeDecision) return;
  if (room.nextRoundTimer) { clearTimeout(room.nextRoundTimer); room.nextRoundTimer = null; }

  // 掉线导致在座不足 / 强制结束
  if (room.forceEndGame || room.pendingEndReason === 'players') {
    const reason = room.pendingEndReason || 'players';
    room.forceEndGame = false;
    room.pendingEndReason = null;
    endGameAndSendSettlement(room, reason);
    return;
  }

  // 达到总局数，结束游戏
  if (room.gameRound >= room.roundLimit) {
    endGameAndSendSettlement(room, 'round_limit');
    return;
  }

  const engine = room.game;

  // 应用待加簸
  engine.players.forEach(p => {
    if (p.pendingBuyIn > 0) {
      const applied = p.pendingBuyIn;
      p.pot += p.pendingBuyIn;
      p.totalBuyIn = (p.totalBuyIn || 0) + p.pendingBuyIn;
      p.pendingBuyIn = 0;
      p.eliminated = false;
      getLogger(room)?.logBuyIn(p.username, applied, {
        pending: false, applied: true, reason: 'next_round_apply',
      });
    }
  });

  if (!opts.skipBrokeDecision) {
    const seatedPlayers = getSeatedEnginePlayers(room);
    const broke = seatedPlayers.filter(p => p.pot <= 0 && (p.pendingBuyIn || 0) <= 0);
    const fundedCount = seatedPlayers.filter(p => p.pot > 0 || (p.pendingBuyIn || 0) > 0).length;
    // 未满总局数，且输光离座后将不足 2 人 → 弹窗让输光者加簸/退出
    if (broke.length > 0 && fundedCount < 2) {
      startBrokeBuyInDecision(room, broke);
      return;
    }
  }

  // 下局开始时簸簸仍为 0 且未加簸 → 自动离座
  engine.players.forEach(p => {
    if (p.pot > 0 || p.pendingBuyIn > 0) return;
    archiveAndRemoveSeat(room, p.username);
  });

  if (engine.rebuildPlayersFromSeats) engine.rebuildPlayersFromSeats(room.seats);

  const stillSeated = room.seats.filter(s => s !== null);
  if (stillSeated.length < 2) {
    endGameAndSendSettlement(room, 'players');
    return;
  }

  engine.rotateBanker();
  // 轮庄不再单独播报；下一局状态里的 bankerUsername /「庄」标签即可
  room.gameRound++;
  if (engine.startNewRound()) {
    const log = getLogger(room);
    log?.logRoundStart(engine);
    log?.logDeal(engine, 1);
    broadcastRoundState(room);
  } else {
    endGameAndSendSettlement(room, 'players');
  }
}

/* ---------- 认证 ---------- */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.json({ ok: false, msg: '请输入账号和密码' });
  const result = login(username.trim(), password);
  res.json(result);
});

/* ---------- 用户接口 ---------- */
app.get('/api/user/profile', authMiddleware, (req, res) => {
  const profile = getProfile(req.user.username);
  if (!profile) return res.status(404).json({ ok: false, msg: '用户不存在' });
  res.json({ ok: true, profile });
});

app.post('/api/user/avatar', authMiddleware, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.json({ ok: false, msg: '请选择头像文件' });
  const avatarPath = `/avatars/${req.file.filename}`;
  setAvatar(req.user.username, avatarPath);
  res.json({ ok: true, avatar_path: avatarPath });
});

app.get('/api/users', authMiddleware, (req, res) => {
  res.json({ ok: true, users: listUsers() });
});

/* ---------- 统计接口 ---------- */
app.get('/api/stats', authMiddleware, (req, res) => {
  res.json({ ok: true, stats: getAllUserStats() });
});

app.get('/api/stats/:username', authMiddleware, (req, res) => {
  const stats = getUserStats(req.params.username);
  const history = getUserGameHistory(req.params.username);
  res.json({ ok: true, stats, history });
});

/* ---------- 房间接口 ---------- */
app.post('/api/rooms/create', authMiddleware, (req, res) => {
  const { name, roundLimit, minBuyIn } = req.body || {};
  const room = createRoom(req.user, { name, roundLimit, minBuyIn });
  // createRoom 内已 attachLogger；房主进房记一条 member
  getLogger(room)?.logMember('join', req.user);
  res.json({ ok: true, room: { code: room.code, name: room.name, host: room.host, roundLimit: room.roundLimit, minBuyIn: room.minBuyIn,
    members: room.members.map(m => ({ username: m.username, nickname: m.nickname })) }});
});

// 获取我的房间列表
app.get('/api/rooms/my', authMiddleware, (req, res) => {
  const list = getRoomsByCreator(req.user.username);
  res.json({ ok: true, rooms: list });
});

app.post('/api/rooms/join', authMiddleware, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.json({ ok: false, msg: '请输入房间号' });
  const result = joinRoom(code.trim(), req.user);
  if (!result.ok) return res.json(result);
  broadcastRoom(result.room);
  res.json({ ok: true, room: { code: result.room.code, name: result.room.name, host: result.room.host,
    roundLimit: result.room.roundLimit, minBuyIn: result.room.minBuyIn,
    members: result.room.members.map(m => ({ username: m.username, nickname: m.nickname })) }});
});

app.get('/api/rooms/:code', authMiddleware, (req, res) => {
  const room = getRoomInfo(req.params.code, req.user);
  if (!room) return res.status(404).json({ ok: false, msg: '房间不存在' });
  res.json({ ok: true, room });
});

app.post('/api/rooms/:code/ready-seat', authMiddleware, (req, res) => {
  const result = setSeatReady(req.params.code, req.user.username);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  if (room) broadcastRoom(room);
  res.json({ ok: true });
});

// 房主开始游戏
app.post('/api/rooms/:code/start', authMiddleware, (req, res) => {
  const result = startGame(req.params.code, req.user.username);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  broadcastRoom(room);
  // 清理上一局可能遗留的下一轮计时器
  if (room.nextRoundTimer) { clearTimeout(room.nextRoundTimer); room.nextRoundTimer = null; }
  // 创建游戏引擎
  room.game = new GameEngine(room);
  // 记录所有入座玩家的初始分数，用于最终结算
  room.initialBuyIns = room.seats
    .filter(s => s !== null)
    .map(s => ({ username: s.username, nickname: s.nickname, buyIn: s.buyIn }));
  if (room.game.init(room.seats)) {
    attachLogger(room);
    getLogger(room)?.logGameStart(room.game);
    sendToRoom(room, { type: 'game_init', gameRound: room.gameRound });
    // 启动选庄流程
    startBankerSelection(room);
  }
  res.json({ ok: true, gameStarted: true });
});

// 房主解散房间
app.post('/api/rooms/:code/disband', authMiddleware, (req, res) => {
  const room = roomsByCode.get(req.params.code);
  if (!room) return res.json({ ok: false, msg: '房间不存在' });
  if (room.host !== req.user.username) return res.json({ ok: false, msg: '只有房主可以解散房间' });
  clearTurnTimer(req.params.code);
  if (room.nextRoundTimer) { clearTimeout(room.nextRoundTimer); room.nextRoundTimer = null; }
  getLogger(room)?.logSessionEnd([], 'disbanded');
  getLogger(room)?.close();
  room.logger = null;
  sendToRoom(room, { type: 'room_disbanded', msg: '房间已被房主解散' });
  for (const ws of room.ws) {
    try { ws.close(); } catch {}
  }
  room.ws.clear();
  roomsByCode.delete(req.params.code);
  res.json({ ok: true });
});

app.post('/api/rooms/:code/leave', authMiddleware, (req, res) => {
  const room = roomsByCode.get(req.params.code);
  if (!room) return res.json({ ok: true });
  const username = req.user.username;
  let bettingDone = null;

  // 如果游戏正在进行且该玩家是参与者，先自动弃牌并归档
  if (room.game && room.game.state) {
    const engine = room.game;
    const s = engine.state;
    const p = engine.getPlayer(username);
    if (p && !p.folded && s.activeIds.includes(username) &&
        !['idle','done','gameover'].includes(s.phase)) {
      const before = { pot: p.pot, committed: p.committed, foldPaid: p.foldPaid || 0 };
      const result = engine.doFold(p);
      if (result) {
        getLogger(room)?.logAction(engine, result, { leave: true, before });
        sendToRoom(room, { type: 'game_action', action: { ...result, leave: true } });
        s.toAct = s.toAct.filter(u => u !== username);
        engine.advanceToAct();
        bettingDone = engine.checkBettingDone();
      }
    }
    if (p) {
      if (!room.chipArchives) room.chipArchives = {};
      room.chipArchives[username] = {
        username,
        nickname: p.nickname,
        initialBuyIn: (room.initialBuyIns || []).find(i => i.username === username)?.buyIn || 0,
        totalBuyIn: p.totalBuyIn || 0,
        finalPot: p.pot + (p.committed || 0) + (p.pendingBuyIn || 0),
        leftAt: Date.now(),
      };
      getLogger(room)?.logDisconnect('leave', username, {
        finalPot: room.chipArchives[username].finalPot,
      });
    }
  }

  const result = leaveRoom(req.params.code, username);
  // 离座后立刻从引擎玩家列表移除，避免幽灵座位继续发牌
  if (room.game && room.game.rebuildPlayersFromSeats) {
    room.game.rebuildPlayersFromSeats(room.seats);
  }
  if (result) broadcastRoom(result);
  if (room.game) {
    broadcastRoundState(room);
    if (bettingDone && bettingDone.done) {
      handleBettingDone(room, room.game, bettingDone);
    } else {
      // 离座后若在座不足 2 人且局间/已结束，提前总结算
      const seated = room.seats.filter(s => s !== null).length;
      if (seated < 2 && ['done', 'idle', 'gameover'].includes(room.game.state?.phase)) {
        endGameAndSendSettlement(room, 'players');
      }
    }
  }
  res.json({ ok: true });
});

app.post('/api/rooms/:code/sit', authMiddleware, (req, res) => {
  const { seatId, buyIn } = req.body || {};
  if (!seatId) return res.json({ ok: false, msg: '请选择座位' });
  const result = sitDown(req.params.code, req.user.username, req.user.nickname, seatId, buyIn);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  broadcastRoom(room);
  if (room?.game) broadcastRoundState(room);
  res.json(result);
});

app.post('/api/rooms/:code/stand', authMiddleware, (req, res) => {
  const result = standUp(req.params.code, req.user.username);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  broadcastRoom(room);
  if (room?.game) broadcastRoundState(room);
  res.json(result);
});

app.post('/api/rooms/:code/add-buyin', authMiddleware, (req, res) => {
  const room = roomsByCode.get(req.params.code);
  if (!room) return res.json({ ok: false, msg: '房间不存在' });
  const amount = Math.floor(Number(req.body?.amount) || 0);
  if (amount <= 0) return res.json({ ok: false, msg: '加簸金额无效' });

  if (room.game) {
    const result = room.game.addBuyIn(req.user.username, amount);
    if (!result) return res.json({ ok: false, msg: '加簸失败' });
    const player = room.game.getPlayer(req.user.username);
    const nickname = player?.nickname || req.user.nickname || req.user.username;
    getLogger(room)?.logBuyIn(req.user.username, amount, { pending: true, ...result });
    sendToRoom(room, {
      type: 'buyin_pending',
      username: req.user.username,
      nickname,
      amount,
      pendingBuyIn: result.pendingBuyIn,
      pending: true,
    });
    broadcastRoundState(room);
    return res.json({ ok: true, ...result, nickname });
  }

  const seat = room.seats.find(s => s && s.username === req.user.username);
  if (!seat) return res.json({ ok: false, msg: '你还没坐下' });
  seat.buyIn = (seat.buyIn || 0) + amount;
  const nickname = seat.nickname || req.user.nickname || req.user.username;
  getLogger(room)?.logBuyIn(req.user.username, amount, { pending: false, applied: true, buyIn: seat.buyIn });
  sendToRoom(room, {
    type: 'buyin_pending',
    username: req.user.username,
    nickname,
    amount,
    buyIn: seat.buyIn,
    pending: false,
  });
  broadcastRoom(room);
  res.json({ ok: true, amount, buyIn: seat.buyIn, nickname });
});

/* ---------- WebSocket 游戏消息处理 ---------- */
wss.on('connection', (ws) => {
  ws.currentRoomCode = null;
  ws.username = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join_room') {
      const payload = verifyToken(msg.token);
      if (!payload) { ws.send(JSON.stringify({ type: 'error', msg: '认证失败' })); return; }
      const room = roomsByCode.get((msg.code || ''));
      if (!room) { ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' })); return; }
      if (!room.members.find(m => m.username === payload.username)) {
        ws.send(JSON.stringify({ type: 'error', msg: '你不在该房间' })); return;
      }
      if (ws.currentRoomCode && ws.currentRoomCode !== room.code) {
        const old = roomsByCode.get(ws.currentRoomCode);
        if (old) old.ws.delete(ws);
      }
      ws.currentRoomCode = room.code;
      ws.username = payload.username;
      room.ws.add(ws);

      // 清除断线标记
      const wasDisconnected = !!room.disconnected[payload.username];
      delete room.disconnected[payload.username];
      broadcastRoom(room);

      if (room.game && room.game.state && room.game.state.phase !== 'idle') {
        const priv = room.game.getPrivateState(payload.username);
        ws.send(JSON.stringify({ type: 'game_sync', state: priv }));
        // 如果是从断线恢复，通知其他玩家
        if (wasDisconnected) {
          getLogger(room)?.logDisconnect('reconnect', payload.username);
          sendToRoom(room, { type: 'player_reconnected', username: payload.username });
        }
      }
      // 重连时补发破产决策状态
      if (room.awaitingBuyInDecision) {
        const payloadDecision = buildBuyInDecisionPayload(room);
        if (payloadDecision) ws.send(JSON.stringify(payloadDecision));
      }
    }

    // 破产决策：加簸继续 / 立即退出（支持多人同时输光）
    if (msg.type === 'buyin_decision') {
      const room = roomsByCode.get(ws.currentRoomCode);
      if (!room || !room.game || !room.awaitingBuyInDecision) return;
      const result = handleBrokePlayerDecision(room, ws.username, msg.choice, msg.amount);
      if (!result.ok) sendError(ws, result.msg || '操作失败');
    }

    // 开始新局（自动触发，也可手动触发）
    if (msg.type === 'next_round') {
      const room = roomsByCode.get(ws.currentRoomCode);
      if (!room || !room.game) return;
      if (room.host !== ws.username) {
        sendError(ws, '只有房主可以开始下一局');
        return;
      }
      if (room.game.state.phase !== 'done') {
        sendError(ws, '当前阶段不能开始下一局');
        return;
      }
      if (room.nextRoundTimer) { clearTimeout(room.nextRoundTimer); room.nextRoundTimer = null; }
      startNextRoundAuto(room);
    }

    // 玩家下注操作
    if (msg.type === 'player_action') {
      const room = roomsByCode.get(ws.currentRoomCode);
      if (!room || !room.game) return;
      const engine = room.game;
      const s = engine.state;
      const p = engine.getPlayer(ws.username);
      if (!p) return;

      if (s.toAct.length === 0 || s.toAct[0] !== ws.username) {
        ws.send(JSON.stringify({ type: 'error', msg: '还没轮到你操作' }));
        return;
      }

      const { action, amount } = msg;
      let result;
      const currentBetBefore = s.currentBet;
      const before = { pot: p.pot, committed: p.committed, foldPaid: p.foldPaid || 0 };

      switch (action) {
        case 'rest':
          if (s.betStarted || s.currentBet > 0) { sendError(ws, '\u5206\u6570\u4e0d\u8db3\uff0c\u53ea\u80fd\u6572\u6216\u7529'); return; }
          result = engine.doRest(p);
          break;
        case 'fold':
          result = engine.doFold(p);
          break;
        case 'see':
          if (s.currentBet <= 0) { sendError(ws, '\u5f53\u524d\u6ca1\u6709\u53ef\u8ddf\u7684\u62db'); return; }
          if (p.committed + p.pot < s.currentBet) { sendError(ws, '\u5206\u6570\u4e0d\u8db3\uff0c\u53ea\u80fd\u6572\u6216\u7529'); return; }
          result = engine.doSee(p);
          break;
        case 'raise': {
          const betAmount = parseBetAmount(amount);
          if (betAmount === null) { sendError(ws, '\u8fd4\u62db\u91d1\u989d\u5fc5\u987b\u662f\u6b63\u6574\u6570'); return; }
          if (betAmount <= s.currentBet) { sendError(ws, '\u8fd4\u62db\u91d1\u989d\u5fc5\u987b\u5927\u4e8e\u5f53\u524d\u62db'); return; }
          if (!s.betStarted && betAmount < s.minBet) { sendError(ws, '\u672c\u8f6e\u6700\u4f4e\u4e0b\u6ce8\u4e3a ' + s.minBet); return; }
          if (betAmount - p.committed > p.pot) { sendError(ws, '\u5206\u6570\u4e0d\u8db3'); return; }
          result = engine.doRaise(p, betAmount);
          break;
        }
        case 'call': {
          const betAmount = parseBetAmount(amount);
          if (betAmount === null) { sendError(ws, '\u53eb\u5206\u91d1\u989d\u5fc5\u987b\u662f\u6b63\u6574\u6570'); return; }
          if (betAmount <= s.currentBet) { sendError(ws, '\u53eb\u5206\u91d1\u989d\u5fc5\u987b\u5927\u4e8e\u5f53\u524d\u62db'); return; }
          if (!s.betStarted && betAmount < s.minBet) { sendError(ws, '\u672c\u8f6e\u6700\u4f4e\u4e0b\u6ce8\u4e3a ' + s.minBet); return; }
          if (betAmount - p.committed > p.pot) { sendError(ws, '\u5206\u6570\u4e0d\u8db3'); return; }
          result = engine.doCall(p, betAmount);
          break;
        }
        case 'knock':
          result = engine.doKnock(p);
          break;
        case 'show_sanhua':
          result = engine.doShowSanhua(p);
          break;
      }

      if (!result) { sendError(ws, '\u65e0\u6548\u64cd\u4f5c'); return; }

      console.log(`[ACTION] ${ws.username} -> ${action}, betRound=${s.betRound}, betStarted=${s.betStarted}`);
      getLogger(room)?.logAction(engine, result, { before });

      // 玩家操作了，重置不活跃计时
      if (s.playerInactivity && s.playerInactivity[ws.username]) {
        delete s.playerInactivity[ws.username];
      }

      sendToRoom(room, { type: 'game_action', action: result });

      if ((action === 'raise' || action === 'call' || action === 'knock') && s.currentBet > currentBetBefore) {
        engine.rebuildQueueAfter(p);
      } else {
        if (s.toAct.length > 0 && s.toAct[0] === ws.username) s.toAct.shift();
      }

      engine.advanceToAct();
      console.log(`[ACTION] after advance: toAct=[${s.toAct.join(',')}], phase=${s.phase}`);
      broadcastRoundState(room);

      const done = engine.checkBettingDone();
      console.log(`[ACTION] checkBettingDone: done=${done.done}, reason=${done.reason || 'none'}`);
      if (done.done) {
        handleBettingDone(room, engine, done);
      }
    }

    // 配牌选择
    if (msg.type === 'player_split') {
      const room = roomsByCode.get(ws.currentRoomCode);
      if (!room || !room.game) return;
      const engine = room.game;
      const s = engine.state;
      if (s.phase !== 'selecting') return;
      const p = engine.getPlayer(ws.username);
      if (!p) return;

      const { headIdx } = msg;
      // 校验索引合法性（客户端传来的是点选的两张，后端自动判头尾）
      if (!Array.isArray(headIdx) || headIdx.length !== 2) return;
      const sortedIdx = [...headIdx].sort((a, b) => a - b);
      if (sortedIdx[0] < 0 || sortedIdx[1] > 3 || sortedIdx[0] === sortedIdx[1]) return;
      const chosen = engine.pickSplitByPair(p.hand, sortedIdx);
      if (!chosen) return;

      s.splits[ws.username] = chosen;
      getLogger(room)?.logSplit(ws.username, chosen);

      // 立即回推私有状态，让确认方立刻看到正确头尾
      try {
        ws.send(JSON.stringify({ type: 'game_private', state: engine.getPrivateState(ws.username) }));
      } catch (_) { /* ignore */ }

      const allDone = s.activeIds.every(id => {
        const pl = engine.getPlayer(id);
        return pl && (pl.folded || s.splits[id]);
      });

      if (allDone) {
        s.phase = 'comparing';
        broadcastRoundState(room);
        setTimeout(() => {
          const log = getLogger(room);
          const snapshotBefore = log?.snapshot(engine);
          const compareResult = engine.doCompare();
          log?.logCompare(engine, compareResult, snapshotBefore);
          log?.logRoundEnd(engine, 'compare');
          sendToRoom(room, { type: 'game_compare', result: compareResult });
          engine.syncSeatBuyIns();
          // 比牌后统一进 done，由 startNextRoundAuto 判断：满局数 / 输光决策 / 继续
          s.phase = 'done';
          // 比牌里标记的 eliminated 先清掉，留给局间决策处理
          engine.players.forEach(p => {
            if (p.pot <= 0) p.eliminated = false;
          });
          broadcastRoundState(room);
          if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
          room.nextRoundTimer = setTimeout(() => {
            room.nextRoundTimer = null;
            startNextRoundAuto(room);
          }, 900);
        }, 700);
      }
    }
  });

  ws.on('close', () => {
    if (ws.currentRoomCode && ws.username) {
      const room = roomsByCode.get(ws.currentRoomCode);
      if (room) {
        room.ws.delete(ws);
        // 标记断线而非直接移除
        markDisconnected(ws.currentRoomCode, ws.username);
        broadcastRoom(room);
      }
    }
  });
});

// 存储每局战绩
function saveRoundResults(room) {
  if (!room.game) return;
  const engine = room.game;
  const players = engine.players;
  const playerResults = players.map(p => {
    const seat = room.seats.find(s => s && s.username === p.username);
    return {
      username: p.username,
      buyIn: seat ? seat.buyIn : 0,
      finalPot: p.pot,
      delta: p.pot - (seat ? seat.buyIn : 0),
      isWinner: p.pot > (seat ? seat.buyIn : 0),
    };
  });
  saveGameRecord(room.code, playerResults);
}

// 广播当前回合状态给所有玩家
function broadcastRoundState(room) {
  if (!room.game) return;
  const engine = room.game;
  sendToRoom(room, { type: 'game_state', state: engine.getPublicState() });
  for (const ws of room.ws) {
    if (ws.readyState === 1 && ws.username) {
      const priv = engine.getPrivateState(ws.username);
      ws.send(JSON.stringify({ type: 'game_private', state: priv }));
    }
  }
  // 启动回合计时器
  startTurnTimer(room);
}

// 下注轮结束后处理
function buildLightCompareResult(engine, { winner, reason }) {
  const results = {};
  engine.players.forEach(p => {
    const start = p.roundStartPot != null ? p.roundStartPot : p.pot;
    p.lastDelta = p.pot - start;
    results[p.username] = {
      wins: 0,
      losses: 0,
      ties: 0,
      headName: '',
      tailName: '',
      lastDelta: p.lastDelta,
    };
  });
  return {
    winner: winner || null,
    alone: !!winner,
    reason,
    results,
    // 对局记录用：全员完整手牌（含弃牌者暗牌）
    hands: Object.fromEntries(engine.players.map(p => [p.username, [...(p.hand || [])]])),
    splits: {},
  };
}

function handleBettingDone(room, engine, done) {
  const s = engine.state;
  const log = getLogger(room);
  log?.logStreetEnd(engine, done);

  if (resolveAllInShowdown(engine, done)) {
    log?.logDeal(engine, 'showdown');
    broadcastRoundState(room);
    return;
  }

  // 所有人弃牌，直接结束本轮
  if (done.reason === 'all_folded') {
    s.phase = 'done';
    s.compareResult = buildLightCompareResult(engine, { winner: done.winner, reason: 'all_folded' });
    engine.syncSeatBuyIns();
    log?.logRoundEnd(engine, 'all_folded');
    broadcastRoundState(room);
    // 在座不足 2 人（掉线离座）→ 直接总结算
    const seatedCount = room.seats.filter(seat => seat !== null).length;
    if (seatedCount < 2 || room.pendingEndReason === 'players') {
      if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
      room.nextRoundTimer = setTimeout(() => {
        room.nextRoundTimer = null;
        endGameAndSendSettlement(room, room.pendingEndReason || 'players');
      }, 800);
      return;
    }
    // 短暂间隔后自动开始下一局（庄家轮转）
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = setTimeout(() => {
      room.nextRoundTimer = null;
      startNextRoundAuto(room);
    }, 800);
    return;
  }

  // 所有人都休（休芒），结束本轮，下一局所有玩家罚芒果
  if (done.reason === 'rest_cross') {
    s.phase = 'done';
    s.compareResult = buildLightCompareResult(engine, { winner: null, reason: 'rest_cross' });
    engine.syncSeatBuyIns();
    log?.logRoundEnd(engine, 'rest_cross');
    broadcastRoundState(room);
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = setTimeout(() => {
      room.nextRoundTimer = null;
      startNextRoundAuto(room);
    }, 800);
    return;
  }

  // 立即切换到发牌阶段，避免界面卡在无按钮的 betting 状态
  if (s.betRound < 3) {
    s.phase = 'dealing';
    broadcastRoundState(room);
  }

  if (s.betRound === 1) {
    setTimeout(() => {
      try {
        engine.dealThirdCard();
        getLogger(room)?.logDeal(engine, 2);
        broadcastRoundState(room);
      } catch (err) {
        console.error('[handleBettingDone] dealThirdCard error:', err);
      }
    }, 600);
  } else if (s.betRound === 2) {
    setTimeout(() => {
      try {
        engine.dealFourthCard();
        getLogger(room)?.logDeal(engine, 3);
        broadcastRoundState(room);
      } catch (err) {
        console.error('[handleBettingDone] dealFourthCard error:', err);
      }
    }, 600);
  } else {
    s.phase = 'selecting';
    broadcastRoundState(room);
  }
}

/* ---------- 启动 ---------- */
app.get(/^\/(?!api\/|ws$).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`扯旋服务器已启动: http://localhost:${PORT}`);
  console.log(`预设账号: user1 ~ user8 / 123456`);
});
