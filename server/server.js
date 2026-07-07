﻿﻿﻿﻿﻿/* ========== 扯旋游戏服务器：Express + WebSocket + GameEngine ========== */
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
  sitDown, standUp, setGameType, finishRound,
  getRoomByCode, getRoomsByCreator,
  markDisconnected, handleReconnect,
} = require('./rooms');
const { GameEngine } = require('./game');
const { resolveAllInShowdown } = require('./betting-flow');
const { saveGameRecord, getUserStats, getAllUserStats, getUserGameHistory } = require('./db');

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

  // 60秒自动弃牌
  const main = setTimeout(() => {
    turnTimers.delete(room.code);
    if (!room.game) return;
    const engine2 = room.game;
    const s2 = engine2.state;
    if (!s2.toAct || s2.toAct.length === 0 || s2.toAct[0] !== actor) return;

    const p = engine2.getPlayer(actor);
    if (!p || p.folded) return;

    const result = engine2.doFold(p);
    sendToRoom(room, { type: 'game_action', action: { ...result, timeout: true } });
    s2.toAct.shift();
    engine2.advanceToAct();

    // 记录不活跃时间
    if (!s2.playerInactivity) s2.playerInactivity = {};
    if (!s2.playerInactivity[actor]) s2.playerInactivity[actor] = Date.now();

    // 检查是否超过3分钟无操作
    if (Date.now() - s2.playerInactivity[actor] >= INACTIVITY_LIMIT) {
      const seatIdx = room.seats.findIndex(seat => seat && seat.username === actor);
      if (seatIdx >= 0) {
        room.seats[seatIdx] = null;
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
        broadcastRoundState(room);
      }
    }, 1500);
  }, 3000);
}

// 游戏结束并发送结算
function endGameAndSendSettlement(room, reason) {
  if (!room.game) return;
  const engine = room.game;
  engine.state.phase = 'gameover';
  engine.syncSeatBuyIns();
  saveRoundResults(room);

  const initialBuyIns = room.initialBuyIns || [];
  const playerMap = new Map(engine.players.map(p => [p.username, p]));
  const settlement = initialBuyIns.map(initial => {
    const p = playerMap.get(initial.username);
    const finalPot = p ? p.pot : initial.buyIn;
    return {
      username: initial.username,
      nickname: initial.nickname,
      initial: initial.buyIn,
      final: finalPot,
      delta: finalPot - initial.buyIn,
    };
  });

  sendToRoom(room, { type: 'game_settlement', settlement, reason });

  room.game = null;
  room.gameStarted = false;
  room.gameRound = 0;
  // 游戏全局结束后在后台解散房间，玩家点击关闭时各自离开
  room.disbanded = true;
  broadcastRoom(room);
}

// 庄家轮转并开始下一局
function startNextRoundAuto(room) {
  if (!room.game) return;
  if (room.nextRoundTimer) { clearTimeout(room.nextRoundTimer); room.nextRoundTimer = null; }

  // 达到总局数，结束游戏
  if (room.gameRound >= room.roundLimit) {
    endGameAndSendSettlement(room, 'round_limit');
    return;
  }

  const engine = room.game;
  engine.rotateBanker();
  const banker = engine.players[engine.state.bankerIdx];
  sendToRoom(room, {
    type: 'banker_rotated',
    banker: banker.username,
    bankerIdx: engine.state.bankerIdx,
    bankerName: banker.nickname,
  });
  // 2秒后开始发牌
  room.gameRound++;
  setTimeout(() => {
    if (!room.game) return;
    if (engine.startNewRound()) {
      broadcastRoundState(room);
    } else {
      // 游戏结束
      endGameAndSendSettlement(room, 'players');
    }
  }, 2000);
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
    sendToRoom(room, { type: 'game_init', gameType: room.gameType, gameRound: room.gameRound });
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

  // 如果游戏正在进行且该玩家是参与者，先自动弃牌
  if (room.game && room.game.state) {
    const engine = room.game;
    const s = engine.state;
    const p = engine.getPlayer(username);
    if (p && !p.folded && s.activeIds.includes(username) &&
        !['idle','done','gameover'].includes(s.phase)) {
      // 自动弃牌
      const result = engine.doFold(p);
      if (result) {
        sendToRoom(room, { type: 'game_action', action: { ...result, leave: true } });
        // 从 toAct 中移除
        s.toAct = s.toAct.filter(u => u !== username);
        engine.advanceToAct();
        broadcastRoundState(room);
        const done = engine.checkBettingDone();
        if (done.done) {
          handleBettingDone(room, engine, done);
        }
      }
    }
  }

  // 执行退出
  const result = leaveRoom(req.params.code, username);
  if (result) broadcastRoom(result);
  res.json({ ok: true });
});

app.post('/api/rooms/:code/sit', authMiddleware, (req, res) => {
  const { seatId, buyIn } = req.body || {};
  if (!seatId) return res.json({ ok: false, msg: '请选择座位' });
  const result = sitDown(req.params.code, req.user.username, req.user.nickname, seatId, buyIn);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  broadcastRoom(room);
  res.json(result);
});

app.post('/api/rooms/:code/stand', authMiddleware, (req, res) => {
  const result = standUp(req.params.code, req.user.username);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  broadcastRoom(room);
  res.json(result);
});

app.post('/api/rooms/:code/gametype', authMiddleware, (req, res) => {
  const { gameType } = req.body || {};
  const result = setGameType(req.params.code, req.user.username, gameType);
  if (!result.ok) return res.json(result);
  const room = roomsByCode.get(req.params.code);
  broadcastRoom(room);
  res.json(result);
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
          sendToRoom(room, { type: 'player_reconnected', username: payload.username });
        }
      }
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
          if (p.roundCommitted + p.pot < s.currentBet) { sendError(ws, '\u5206\u6570\u4e0d\u8db3\uff0c\u53ea\u80fd\u6572\u6216\u7529'); return; }
          result = engine.doSee(p);
          break;
        case 'raise': {
          const betAmount = parseBetAmount(amount);
          if (betAmount === null) { sendError(ws, '\u8fd4\u62db\u91d1\u989d\u5fc5\u987b\u662f\u6b63\u6574\u6570'); return; }
          if (betAmount <= s.currentBet) { sendError(ws, '\u8fd4\u62db\u91d1\u989d\u5fc5\u987b\u5927\u4e8e\u5f53\u524d\u62db'); return; }
          if (betAmount < s.minBet) { sendError(ws, '\u672c\u8f6e\u6700\u4f4e\u4e0b\u6ce8\u4e3a ' + s.minBet); return; }
          if (betAmount - p.roundCommitted > p.pot) { sendError(ws, '\u5206\u6570\u4e0d\u8db3'); return; }
          result = engine.doRaise(p, betAmount);
          break;
        }
        case 'call': {
          const betAmount = parseBetAmount(amount);
          if (betAmount === null) { sendError(ws, '\u53eb\u5206\u91d1\u989d\u5fc5\u987b\u662f\u6b63\u6574\u6570'); return; }
          if (betAmount <= s.currentBet) { sendError(ws, '\u53eb\u5206\u91d1\u989d\u5fc5\u987b\u5927\u4e8e\u5f53\u524d\u62db'); return; }
          if (betAmount < s.minBet) { sendError(ws, '\u672c\u8f6e\u6700\u4f4e\u4e0b\u6ce8\u4e3a ' + s.minBet); return; }
          if (betAmount - p.roundCommitted > p.pot) { sendError(ws, '\u5206\u6570\u4e0d\u8db3'); return; }
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
      if (!result) return;

      console.log(`[ACTION] ${ws.username} -> ${action}, betRound=${s.betRound}, betStarted=${s.betStarted}`);

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
      // 校验索引合法性
      if (!Array.isArray(headIdx) || headIdx.length !== 2) return;
      const sortedIdx = [...headIdx].sort((a, b) => a - b);
      if (sortedIdx[0] < 0 || sortedIdx[1] > 3 || sortedIdx[0] === sortedIdx[1]) return;
      // 从所有配法中找到匹配的配牌（自动分配头尾）
      const splits = engine.getAllSplits(p.hand);
      const chosen = splits.find(sp =>
        sp.headIdx[0] === sortedIdx[0] && sp.headIdx[1] === sortedIdx[1]
      );
      if (!chosen) return;

      s.splits[ws.username] = chosen;

      const allDone = s.activeIds.every(id => {
        const pl = engine.getPlayer(id);
        return pl && (pl.folded || s.splits[id]);
      });

      if (allDone) {
        s.phase = 'comparing';
        broadcastRoundState(room);
        setTimeout(() => {
          const compareResult = engine.doCompare();
          sendToRoom(room, { type: 'game_compare', result: compareResult });
          engine.syncSeatBuyIns();
          broadcastRoundState(room);
          const alive = engine.alivePlayers();
          if (alive.length < 2) {
            // 游戏结束，发送结算
            endGameAndSendSettlement(room, 'players');
          } else {
            s.phase = 'done';
            sendToRoom(room, { type: 'game_state', state: engine.getPublicState() });
            // 4秒后自动开始下一局（庄家轮转）
            if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
            room.nextRoundTimer = setTimeout(() => {
              room.nextRoundTimer = null;
              startNextRoundAuto(room);
            }, 4000);
          }
        }, 1500);
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
  saveGameRecord(room.code, room.gameType, playerResults);
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
function handleBettingDone(room, engine, done) {
  const s = engine.state;

  if (resolveAllInShowdown(engine, done)) {
    broadcastRoundState(room);
    return;
  }

  // 所有人弃牌，直接结束本轮
  if (done.reason === 'all_folded') {
    s.phase = 'done';
    engine.syncSeatBuyIns();
    broadcastRoundState(room);
    // 4秒后自动开始下一局（庄家轮转）
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = setTimeout(() => {
      room.nextRoundTimer = null;
      startNextRoundAuto(room);
    }, 4000);
    return;
  }

  // 所有人都休（休芒），结束本轮，下一局所有玩家罚芒果
  if (done.reason === 'rest_cross') {
    s.phase = 'done';
    engine.syncSeatBuyIns();
    broadcastRoundState(room);
    if (room.nextRoundTimer) clearTimeout(room.nextRoundTimer);
    room.nextRoundTimer = setTimeout(() => {
      room.nextRoundTimer = null;
      startNextRoundAuto(room);
    }, 4000);
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
        broadcastRoundState(room);
      } catch (err) {
        console.error('[handleBettingDone] dealThirdCard error:', err);
      }
    }, 600);
  } else if (s.betRound === 2) {
    setTimeout(() => {
      try {
        engine.dealFourthCard();
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
