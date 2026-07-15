/* ========== SQLite 数据库：用户 + 对局会话/手牌 + 统计 ========== */
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { initialQuickMessages } = require('./quick-messages');

const DB_PATH = path.join(__dirname, '..', 'data', 'chekai.db');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const shouldSeedQuickMessages = !db.prepare(
  "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'quick_messages'"
).get();

// ========== 建表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_path TEXT DEFAULT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    disabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS game_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    game_type TEXT NOT NULL,
    played_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS player_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES game_records(id),
    username TEXT NOT NULL,
    buy_in INTEGER NOT NULL,
    final_pot INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    is_winner INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_stats (
    username TEXT PRIMARY KEY,
    total_games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    total_profit INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    room_name TEXT NOT NULL,
    host_username TEXT NOT NULL,
    round_limit INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    ends_at INTEGER,
    extended_minutes INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    end_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS hand_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    hand_no INTEGER NOT NULL,
    played_at INTEGER NOT NULL DEFAULT (unixepoch()),
    end_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS hand_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hand_id INTEGER NOT NULL REFERENCES hand_records(id),
    username TEXT NOT NULL,
    nickname TEXT NOT NULL,
    cards TEXT NOT NULL DEFAULT '',
    cards_head TEXT NOT NULL DEFAULT '',
    cards_tail TEXT NOT NULL DEFAULT '',
    delta INTEGER NOT NULL DEFAULT 0,
    result TEXT NOT NULL DEFAULT 'tie'
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    username TEXT PRIMARY KEY,
    total_hands INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    ties INTEGER NOT NULL DEFAULT 0,
    total_profit INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS session_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id),
    username TEXT NOT NULL,
    nickname TEXT NOT NULL,
    buy_in INTEGER NOT NULL DEFAULT 0,
    final_pot INTEGER NOT NULL DEFAULT 0,
    delta INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS quick_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const defaultQuickMessages = initialQuickMessages(!shouldSeedQuickMessages);
if (defaultQuickMessages.length) {
  const insert = db.prepare(
    'INSERT INTO quick_messages (content, sort_order) VALUES (?, ?)'
  );
  const seed = db.transaction(() => {
    defaultQuickMessages.forEach((content, index) => insert.run(content, index));
  });
  seed();
}

// ========== 迁移：补列 ==========
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('users', 'role', "role TEXT NOT NULL DEFAULT 'player'");
ensureColumn('users', 'disabled', 'disabled INTEGER NOT NULL DEFAULT 0');
ensureColumn('hand_players', 'cards_head', "cards_head TEXT NOT NULL DEFAULT ''");
ensureColumn('hand_players', 'cards_tail', "cards_tail TEXT NOT NULL DEFAULT ''");
ensureColumn('hand_players', 'folded', 'folded INTEGER NOT NULL DEFAULT 0');
ensureColumn('hand_players', 'rested', 'rested INTEGER NOT NULL DEFAULT 0');
ensureColumn('hand_records', 'banker_username', 'banker_username TEXT');
ensureColumn('game_sessions', 'duration_minutes', 'duration_minutes INTEGER NOT NULL DEFAULT 0');
ensureColumn('game_sessions', 'ends_at', 'ends_at INTEGER');
ensureColumn('game_sessions', 'extended_minutes', 'extended_minutes INTEGER NOT NULL DEFAULT 0');
ensureColumn('game_sessions', 'pot_split_json', 'pot_split_json TEXT');

// ========== 牌紧凑编码 ==========
/** @param {Array<{id?: string}|string>} cards */
function encodeCards(cards) {
  if (!cards || !cards.length) return '';
  return cards.map((c) => (typeof c === 'string' ? c : c.id)).filter(Boolean).join('|');
}

function decodeCards(str) {
  if (!str) return [];
  return String(str).split('|').filter(Boolean);
}

// ========== 预设账号 ==========
const PRESET_USERS = [
  { username: 'admin', nickname: '管理员', password: 'admin123', role: 'admin' },
  { username: 'zhr', nickname: '小然二', password: '123456', role: 'player' },
  { username: 'wrz', nickname: '抖师傅', password: '123456', role: 'player' },
  { username: 'my', nickname: '毛老师', password: '123456', role: 'player' },
  { username: 'zml', nickname: '板师', password: '123456', role: 'player' },
  { username: 'zyp', nickname: '周哥', password: '123456', role: 'player' },
  { username: 'mxc', nickname: '毛兴池', password: '123456', role: 'player' },
  { username: 'syf', nickname: '宋老么', password: '123456', role: 'player' },
  { username: 'lql', nickname: '678', password: '123456', role: 'player' },
];

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (username, nickname, password_hash, role) VALUES (?, ?, ?, ?)'
);
const insertPlayerStats = db.prepare(
  'INSERT OR IGNORE INTO player_stats (username) VALUES (?)'
);
const insertLegacyStats = db.prepare(
  'INSERT OR IGNORE INTO user_stats (username) VALUES (?)'
);

PRESET_USERS.forEach((u) => {
  const hash = bcrypt.hashSync(u.password, 10);
  insertUser.run(u.username, u.nickname, hash, u.role);
  if (u.role === 'player') {
    insertPlayerStats.run(u.username);
    insertLegacyStats.run(u.username);
  }
});

db.prepare("UPDATE users SET role = 'player' WHERE role IS NULL OR role = ''").run();
db.prepare("UPDATE users SET role = 'admin' WHERE username = 'admin'").run();
const allUserRows = db.prepare('SELECT username, role FROM users').all();
allUserRows.forEach((u) => {
  if (u.role === 'player') {
    insertPlayerStats.run(u.username);
    insertLegacyStats.run(u.username);
  }
});

console.log('[db] SQLite 初始化完成（含 admin / 对局会话表）');

// ========== 用户 ==========
function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getAllUsers({ includeAdmin = true, includeDisabled = true } = {}) {
  let sql = 'SELECT id, username, nickname, avatar_path, role, disabled, created_at FROM users WHERE 1=1';
  if (!includeAdmin) sql += " AND role != 'admin'";
  if (!includeDisabled) sql += ' AND disabled = 0';
  sql += ' ORDER BY role DESC, id ASC';
  return db.prepare(sql).all();
}

function getPlayerUsers() {
  return getAllUsers({ includeAdmin: false, includeDisabled: false });
}

function createUser({ username, nickname, password, role = 'player' }) {
  const existing = findUserByUsername(username);
  if (existing) return { ok: false, msg: '账号已存在' };
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (username, nickname, password_hash, role) VALUES (?, ?, ?, ?)'
  ).run(username, nickname || username, hash, role);
  if (role === 'player') {
    insertPlayerStats.run(username);
    insertLegacyStats.run(username);
  }
  return { ok: true, user: findUserByUsername(username) };
}

function updateUser(username, fields) {
  const user = findUserByUsername(username);
  if (!user) return { ok: false, msg: '用户不存在' };

  let currentUsername = username;
  if (fields.newUsername != null) {
    const next = String(fields.newUsername).trim();
    if (next !== username) {
      if (username === 'admin') return { ok: false, msg: '不能修改默认管理员账号' };
      if (!/^[a-zA-Z0-9_]{2,20}$/.test(next)) {
        return { ok: false, msg: '账号仅限 2–20 位字母数字下划线' };
      }
      if (findUserByUsername(next)) return { ok: false, msg: '账号已存在' };
      try {
        renameUsername(username, next);
        currentUsername = next;
      } catch (e) {
        console.error('[db] renameUsername failed', e);
        return { ok: false, msg: '修改账号失败' };
      }
    }
  }

  if (fields.nickname != null) {
    db.prepare('UPDATE users SET nickname = ? WHERE username = ?').run(fields.nickname, currentUsername);
  }
  if (fields.password) {
    const hash = bcrypt.hashSync(fields.password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, currentUsername);
  }
  if (fields.disabled != null) {
    db.prepare('UPDATE users SET disabled = ? WHERE username = ?').run(fields.disabled ? 1 : 0, currentUsername);
  }
  if (fields.role != null && (fields.role === 'admin' || fields.role === 'player')) {
    db.prepare('UPDATE users SET role = ? WHERE username = ?').run(fields.role, currentUsername);
  }
  return { ok: true, user: findUserByUsername(currentUsername) };
}

/** 同步改写所有引用该账号的记录（统计 / 战绩 / 庄家等） */
function renameUsername(oldUsername, newUsername) {
  const tx = db.transaction(() => {
    // 先插新主键行，再迁数据、删旧行（SQLite 主键无法直接 UPDATE 时更稳妥）
    const stats = db.prepare('SELECT * FROM player_stats WHERE username = ?').get(oldUsername);
    if (stats) {
      db.prepare(`
        INSERT INTO player_stats (username, total_hands, wins, losses, ties, total_profit, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newUsername,
        stats.total_hands,
        stats.wins,
        stats.losses,
        stats.ties,
        stats.total_profit,
        stats.updated_at
      );
      db.prepare('DELETE FROM player_stats WHERE username = ?').run(oldUsername);
    }

    const legacy = db.prepare('SELECT * FROM user_stats WHERE username = ?').get(oldUsername);
    if (legacy) {
      db.prepare(`
        INSERT INTO user_stats (username, total_games, wins, losses, total_profit, best_streak, current_streak)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        newUsername,
        legacy.total_games,
        legacy.wins,
        legacy.losses,
        legacy.total_profit,
        legacy.best_streak,
        legacy.current_streak
      );
      db.prepare('DELETE FROM user_stats WHERE username = ?').run(oldUsername);
    }

    db.prepare('UPDATE users SET username = ? WHERE username = ?').run(newUsername, oldUsername);
    db.prepare('UPDATE hand_players SET username = ? WHERE username = ?').run(newUsername, oldUsername);
    db.prepare('UPDATE session_players SET username = ? WHERE username = ?').run(newUsername, oldUsername);
    db.prepare('UPDATE player_records SET username = ? WHERE username = ?').run(newUsername, oldUsername);
    db.prepare('UPDATE game_sessions SET host_username = ? WHERE host_username = ?').run(newUsername, oldUsername);
    db.prepare('UPDATE hand_records SET banker_username = ? WHERE banker_username = ?').run(newUsername, oldUsername);
  });
  tx();

  // 头像文件名常与账号同名，尽量跟随改名
  try {
    const user = findUserByUsername(newUsername);
    if (user?.avatar_path) {
      const avatarsDir = path.join(__dirname, '..', 'public', 'avatars');
      const oldBase = path.basename(user.avatar_path);
      if (oldBase.startsWith(oldUsername + '.') || oldBase === oldUsername) {
        const ext = path.extname(oldBase) || '.png';
        const nextName = `${newUsername}${ext}`;
        const from = path.join(avatarsDir, oldBase);
        const to = path.join(avatarsDir, nextName);
        if (fs.existsSync(from) && from !== to) {
          fs.renameSync(from, to);
          const nextPath = `/avatars/${nextName}`;
          db.prepare('UPDATE users SET avatar_path = ? WHERE username = ?').run(nextPath, newUsername);
        }
      }
    }
  } catch (e) {
    console.error('[db] rename avatar failed', e);
  }
}

function deleteUser(username) {
  if (username === 'admin') return { ok: false, msg: '不能删除默认管理员' };
  const user = findUserByUsername(username);
  if (!user) return { ok: false, msg: '用户不存在' };
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM player_stats WHERE username = ?').run(username);
    db.prepare('DELETE FROM user_stats WHERE username = ?').run(username);
    db.prepare('DELETE FROM users WHERE username = ?').run(username);
  });
  tx();
  return { ok: true };
}

function updateNickname(username, nickname) {
  db.prepare('UPDATE users SET nickname = ? WHERE username = ?').run(nickname, username);
}

function updateAvatar(username, avatarPath) {
  db.prepare('UPDATE users SET avatar_path = ? WHERE username = ?').run(avatarPath, username);
}

function updatePassword(username, newPassword) {
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(hash, username);
}

// ========== 对局会话 / 手牌 ==========
const ALLOWED_DURATIONS = [30, 60, 120, 180, 240];
const ALLOWED_EXTEND = [15, 30, 60];

function normalizeDurationMinutes(value, fallback = 120) {
  const n = Number(value);
  if (ALLOWED_DURATIONS.includes(n)) return n;
  return fallback;
}

function createGameSession(room) {
  const duration = normalizeDurationMinutes(room.durationMinutes, 120);
  const endsAtSec = room.endsAt ? Math.floor(room.endsAt / 1000) : null;
  const result = db.prepare(
    `INSERT INTO game_sessions (
       room_code, room_name, host_username, round_limit,
       duration_minutes, ends_at, extended_minutes, started_at
     ) VALUES (?, ?, ?, 0, ?, ?, ?, unixepoch())`
  ).run(
    room.code,
    room.name || '扯旋房间',
    room.host || room.creator,
    duration,
    endsAtSec,
    room.extendedMinutes || 0
  );
  return result.lastInsertRowid;
}

function updateSessionSchedule(sessionId, { endsAtMs, extendedMinutes }) {
  if (!sessionId) return;
  const endsAtSec = endsAtMs ? Math.floor(endsAtMs / 1000) : null;
  db.prepare(
    'UPDATE game_sessions SET ends_at = ?, extended_minutes = ? WHERE id = ?'
  ).run(endsAtSec, extendedMinutes || 0, sessionId);
}

function finishGameSession(sessionId, endReason) {
  if (!sessionId) return;
  db.prepare(
    'UPDATE game_sessions SET ended_at = unixepoch(), end_reason = ? WHERE id = ?'
  ).run(endReason || 'unknown', sessionId);
}

function saveHandRecord(sessionId, handNo, players, endReason, bankerUsername = null) {
  if (!sessionId) return null;
  const insertHand = db.prepare(
    'INSERT INTO hand_records (session_id, hand_no, end_reason, banker_username) VALUES (?, ?, ?, ?)'
  );
  const insertPlayer = db.prepare(
    `INSERT INTO hand_players (hand_id, username, nickname, cards, cards_head, cards_tail, delta, result, folded, rested)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  // 胜负场次按手牌统计；净输赢只记终局结算（session_players），避免底池跨手导致总和≠0
  const upsertStats = db.prepare(`
    INSERT INTO player_stats (username, total_hands, wins, losses, ties, total_profit, updated_at)
    VALUES (@username, 1, @wins, @losses, @ties, 0, unixepoch())
    ON CONFLICT(username) DO UPDATE SET
      total_hands = total_hands + 1,
      wins = wins + @wins,
      losses = losses + @losses,
      ties = ties + @ties,
      updated_at = unixepoch()
  `);

  const tx = db.transaction(() => {
    const handId = insertHand.run(sessionId, handNo, endReason || null, bankerUsername || null).lastInsertRowid;
    for (const p of players) {
      const delta = p.delta || 0;
      const result = delta > 0 ? 'win' : delta < 0 ? 'loss' : 'tie';
      const folded = p.folded ? 1 : 0;
      // 全休局：未弃牌者记为休
      const rested = p.rested || (endReason === 'rest_cross' && !folded) ? 1 : 0;
      insertPlayer.run(
        handId,
        p.username,
        p.nickname || p.username,
        encodeCards(p.cards || []),
        encodeCards(p.cardsHead || []),
        encodeCards(p.cardsTail || []),
        delta,
        result,
        folded,
        rested
      );
      upsertStats.run({
        username: p.username,
        wins: result === 'win' ? 1 : 0,
        losses: result === 'loss' ? 1 : 0,
        ties: result === 'tie' ? 1 : 0,
      });
    }
    return handId;
  });
  return tx();
}

/** 写入本场终局结算，并按 session_players 重算排行榜净输赢 */
function saveSessionSettlement(sessionId, settlement, potSplit = null) {
  if (!sessionId || !Array.isArray(settlement) || settlement.length === 0) return;
  const del = db.prepare('DELETE FROM session_players WHERE session_id = ?');
  const insert = db.prepare(`
    INSERT INTO session_players (session_id, username, nickname, buy_in, final_pot, delta)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const savePot = db.prepare('UPDATE game_sessions SET pot_split_json = ? WHERE id = ?');
  const tx = db.transaction(() => {
    del.run(sessionId);
    for (const p of settlement) {
      insert.run(
        sessionId,
        p.username,
        p.nickname || p.username,
        p.initial ?? p.buyIn ?? 0,
        p.final ?? p.finalPot ?? 0,
        p.delta || 0
      );
      insertPlayerStats.run(p.username);
    }
    const json = potSplit && potSplit.pot > 0 ? JSON.stringify(potSplit) : null;
    savePot.run(json, sessionId);
  });
  tx();
  recomputeTotalProfits();
}

function parsePotSplitJson(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || !(parsed.pot > 0)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 历史场次：用「终局 delta − 各手 delta 之和」反推每人拿到的底池平分份额。
 * 仅在份额均为非负且总和>0、场次净输赢守恒时写入。
 */
function backfillPotSplitFromHands() {
  const sessions = db.prepare(`
    SELECT id FROM game_sessions
    WHERE ended_at IS NOT NULL
      AND (pot_split_json IS NULL OR pot_split_json = '')
      AND EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = game_sessions.id)
  `).all();
  if (!sessions.length) return;

  const loadSettlement = db.prepare(
    'SELECT username, delta FROM session_players WHERE session_id = ?'
  );
  const loadHandDeltas = db.prepare(`
    SELECT hp.username, COALESCE(SUM(hp.delta), 0) AS hand_delta
    FROM hand_players hp
    JOIN hand_records h ON h.id = hp.hand_id
    WHERE h.session_id = ?
    GROUP BY hp.username
  `);
  const upd = db.prepare('UPDATE game_sessions SET pot_split_json = ? WHERE id = ?');

  let filled = 0;
  const tx = db.transaction(() => {
    for (const s of sessions) {
      const settlement = loadSettlement.all(s.id);
      if (settlement.length < 1) continue;
      const sumDelta = settlement.reduce((acc, p) => acc + (p.delta || 0), 0);
      if (sumDelta !== 0) continue;

      const handMap = new Map(loadHandDeltas.all(s.id).map((r) => [r.username, r.hand_delta || 0]));
      /** @type {Record<string, number>} */
      const shares = {};
      let pot = 0;
      let ok = true;
      for (const p of settlement) {
        const handDelta = handMap.has(p.username) ? handMap.get(p.username) : 0;
        const share = (p.delta || 0) - handDelta;
        if (share < 0) { ok = false; break; }
        if (share > 0) shares[p.username] = share;
        pot += share;
      }
      if (!ok || pot <= 0) continue;

      const n = settlement.length;
      const base = Math.floor(pot / n);
      const rem = pot - base * n;
      upd.run(JSON.stringify({
        pot,
        shares,
        bankerUsername: null,
        recipientCount: n,
        base,
        remainder: rem,
        inferred: true,
      }), s.id);
      filled += 1;
    }
  });
  tx();
  if (filled > 0) {
    console.log(`[db] 已回填 ${filled} 场终局底池平分记录`);
  }
}

function recomputeTotalProfits() {
  db.prepare('UPDATE player_stats SET total_profit = 0').run();
  const rows = db.prepare(
    'SELECT username, COALESCE(SUM(delta), 0) AS profit FROM session_players GROUP BY username'
  ).all();
  const upd = db.prepare(
    'UPDATE player_stats SET total_profit = ?, updated_at = unixepoch() WHERE username = ?'
  );
  for (const r of rows) {
    insertPlayerStats.run(r.username);
    upd.run(r.profit || 0, r.username);
  }
}

/** 历史场次：若终局筹码未守恒（旧版遗留底池），均分给本场玩家，余数归房主 */
function repairSessionConservation(sessionId, hostUsername) {
  const players = db.prepare('SELECT * FROM session_players WHERE session_id = ?').all(sessionId);
  if (players.length === 0) return false;
  const sum = players.reduce((acc, p) => acc + (p.delta || 0), 0);
  if (sum >= 0) return false;
  const pot = -sum;
  const n = players.length;
  const base = Math.floor(pot / n);
  const rem = pot - base * n;
  const host = players.find((p) => p.username === hostUsername) || players[0];
  const upd = db.prepare(
    'UPDATE session_players SET final_pot = final_pot + ?, delta = delta + ? WHERE id = ?'
  );
  for (const p of players) {
    const add = base + (p.id === host.id ? rem : 0);
    if (add > 0) upd.run(add, add, p.id);
  }
  return true;
}

function backfillSessionSettlements() {
  const sessions = db.prepare(`
    SELECT s.* FROM game_sessions s
    WHERE s.ended_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM session_players sp WHERE sp.session_id = s.id)
  `).all();

  const findGame = db.prepare(`
    SELECT id FROM game_records
    WHERE room_code = ?
    ORDER BY ABS(played_at - ?) ASC
    LIMIT 1
  `);
  const loadPlayers = db.prepare(
    'SELECT username, buy_in, final_pot, delta FROM player_records WHERE game_id = ?'
  );
  const findNick = db.prepare('SELECT nickname FROM users WHERE username = ?');
  const insert = db.prepare(`
    INSERT INTO session_players (session_id, username, nickname, buy_in, final_pot, delta)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let filled = 0;
  const tx = db.transaction(() => {
    for (const s of sessions) {
      const gr = findGame.get(s.room_code, s.ended_at || s.started_at);
      if (!gr) continue;
      const rows = loadPlayers.all(gr.id);
      if (!rows.length) continue;
      for (const r of rows) {
        const nick = findNick.get(r.username)?.nickname || r.username;
        insert.run(s.id, r.username, nick, r.buy_in, r.final_pot, r.delta);
        insertPlayerStats.run(r.username);
      }
      repairSessionConservation(s.id, s.host_username);
      filled += 1;
    }
  });
  tx();

  const statsSum = db.prepare('SELECT COALESCE(SUM(total_profit), 0) AS s FROM player_stats').get().s;
  const sessionSum = db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM session_players').get().s;
  if (filled > 0 || statsSum !== sessionSum) {
    recomputeTotalProfits();
  }
  if (filled > 0) {
    console.log(`[db] 已回填 ${filled} 场终局结算并重算净输赢`);
  }
}

backfillSessionSettlements();
backfillPotSplitFromHands();

function listGameSessions({ username = null, limit = 50, offset = 0 } = {}) {
  if (username) {
    return db.prepare(`
      SELECT DISTINCT s.*
      FROM game_sessions s
      JOIN hand_records h ON h.session_id = s.id
      JOIN hand_players hp ON hp.hand_id = h.id
      WHERE hp.username = ?
      ORDER BY s.started_at DESC
      LIMIT ? OFFSET ?
    `).all(username, limit, offset);
  }
  return db.prepare(`
    SELECT * FROM game_sessions
    ORDER BY started_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

function getSessionDetail(sessionId) {
  const session = db.prepare('SELECT * FROM game_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  const settlement = db.prepare(`
    SELECT username, nickname, buy_in AS initial, final_pot AS final, delta
    FROM session_players
    WHERE session_id = ?
    ORDER BY delta DESC, username ASC
  `).all(sessionId);
  const hands = db.prepare(
    'SELECT * FROM hand_records WHERE session_id = ? ORDER BY hand_no ASC'
  ).all(sessionId);
  const handDetails = hands.map((h) => {
    const players = db.prepare(
      'SELECT username, nickname, cards, cards_head, cards_tail, delta, result, folded, rested FROM hand_players WHERE hand_id = ?'
    ).all(h.id).map((p) => ({
      ...p,
      folded: !!p.folded,
      rested: !!p.rested || (h.end_reason === 'rest_cross' && !p.folded),
      cardIds: decodeCards(p.cards),
      headIds: decodeCards(p.cards_head),
      tailIds: decodeCards(p.cards_tail),
    }));
    return { ...h, players };
  });
  const { pot_split_json: potSplitRaw, ...rest } = session;
  return {
    ...rest,
    potSplit: parsePotSplitJson(potSplitRaw),
    settlement,
    hands: handDetails,
  };
}

/** 本场已结束各手，供房间对局记录抽屉恢复（仅 card id） */
function listSessionHandsForHistory(sessionId) {
  if (!sessionId) return [];
  const hands = db.prepare(
    'SELECT id, hand_no, end_reason, banker_username FROM hand_records WHERE session_id = ? ORDER BY hand_no ASC'
  ).all(sessionId);
  const loadPlayers = db.prepare(
    `SELECT username, nickname, cards, cards_head, cards_tail, delta, folded, rested
     FROM hand_players WHERE hand_id = ?`
  );
  return hands.map((h) => ({
    handNo: h.hand_no,
    endReason: h.end_reason || null,
    bankerUsername: h.banker_username || '',
    players: loadPlayers.all(h.id).map((p) => ({
      username: p.username,
      nickname: p.nickname,
      cardIds: decodeCards(p.cards),
      headIds: decodeCards(p.cards_head),
      tailIds: decodeCards(p.cards_tail),
      delta: p.delta || 0,
      folded: !!p.folded,
      rested: !!p.rested || (h.end_reason === 'rest_cross' && !p.folded),
    })),
  }));
}

// ========== 统计 / 排行榜 ==========
function getPlayerStats(username) {
  return db.prepare('SELECT * FROM player_stats WHERE username = ?').get(username);
}

function getLeaderboard(type = 'profit') {
  const base = `
    SELECT u.username, u.nickname, u.avatar_path,
           COALESCE(s.total_hands, 0) AS total_hands,
           COALESCE(s.wins, 0) AS wins,
           COALESCE(s.losses, 0) AS losses,
           COALESCE(s.ties, 0) AS ties,
           COALESCE(s.total_profit, 0) AS total_profit,
           CASE WHEN COALESCE(s.total_hands, 0) = 0 THEN 0.0
                ELSE CAST(s.wins AS REAL) / s.total_hands END AS winrate
    FROM users u
    LEFT JOIN player_stats s ON u.username = s.username
    WHERE u.role = 'player' AND u.disabled = 0
  `;
  let order = 'ORDER BY total_profit DESC, total_hands DESC';
  if (type === 'record') {
    order = 'ORDER BY wins DESC, losses ASC, total_hands DESC';
  } else if (type === 'winrate') {
    order = 'ORDER BY winrate DESC, total_hands DESC, wins DESC';
  }
  return db.prepare(`${base} ${order}`).all();
}

/** 清空胜率相关累计（胜/负/平/手数），保留净输赢 */
function resetWinrateStats() {
  db.prepare(`
    UPDATE player_stats
    SET total_hands = 0, wins = 0, losses = 0, ties = 0,
        updated_at = unixepoch()
  `).run();
  try {
    db.prepare(`
      UPDATE user_stats
      SET total_games = 0, wins = 0, losses = 0,
          best_streak = 0, current_streak = 0
    `).run();
  } catch { /* 旧表可能不存在 */ }
  return { ok: true };
}

/** 清空所有玩家净输赢，不影响胜率样本 */
function resetProfitStats() {
  db.prepare(`
    UPDATE player_stats
    SET total_profit = 0, updated_at = unixepoch()
  `).run();
  try {
    db.prepare(`UPDATE user_stats SET total_profit = 0`).run();
  } catch { /* 旧表可能不存在 */ }
  return { ok: true };
}

/** @deprecated 使用 resetWinrateStats / resetProfitStats */
function resetAllPlayerStats() {
  resetWinrateStats();
  resetProfitStats();
  return { ok: true };
}

/** 删除单场对局会话及相关手牌记录 */
function deleteGameSession(sessionId) {
  const id = Number(sessionId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, msg: '无效的记录 ID' };
  const session = db.prepare('SELECT id FROM game_sessions WHERE id = ?').get(id);
  if (!session) return { ok: false, msg: '记录不存在' };

  const tx = db.transaction(() => {
    const handIds = db.prepare('SELECT id FROM hand_records WHERE session_id = ?').all(id).map((h) => h.id);
    const delHandPlayers = db.prepare('DELETE FROM hand_players WHERE hand_id = ?');
    for (const hid of handIds) delHandPlayers.run(hid);
    db.prepare('DELETE FROM hand_records WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM session_players WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM game_sessions WHERE id = ?').run(id);
  });
  tx();
  return { ok: true };
}

/** 删除全部对局会话记录（不影响排行累计） */
function deleteAllGameSessions() {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM hand_players').run();
    db.prepare('DELETE FROM hand_records').run();
    db.prepare('DELETE FROM session_players').run();
    db.prepare('DELETE FROM game_sessions').run();
  });
  tx();
  return { ok: true };
}

// ========== 快捷消息 ==========
function listQuickMessages() {
  return db.prepare(`
    SELECT id, content, sort_order AS sortOrder
    FROM quick_messages
    ORDER BY sort_order ASC, id ASC
  `).all();
}

function replaceQuickMessages(messages) {
  const remove = db.prepare('DELETE FROM quick_messages');
  const insert = db.prepare(
    'INSERT INTO quick_messages (content, sort_order, updated_at) VALUES (?, ?, unixepoch())'
  );
  const tx = db.transaction(() => {
    remove.run();
    messages.forEach((message, index) => insert.run(message.content, index));
  });
  tx();
  return listQuickMessages();
}

// ========== 旧接口兼容 ==========
function saveGameRecord(roomCode, playerResults) {
  const insertGame = db.prepare(
    'INSERT INTO game_records (room_code, game_type) VALUES (?, ?)'
  );
  const insertPlayer = db.prepare(
    'INSERT INTO player_records (game_id, username, buy_in, final_pot, delta, is_winner) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    const result = insertGame.run(roomCode, 'chekai');
    const gameId = result.lastInsertRowid;
    for (const p of playerResults) {
      insertPlayer.run(gameId, p.username, p.buyIn || 0, p.finalPot || 0, p.delta || 0, p.isWinner ? 1 : 0);
    }
  });
  tx();
}

function getUserStats(username) {
  const ps = getPlayerStats(username);
  if (ps) {
    return {
      username,
      total_games: ps.total_hands,
      wins: ps.wins,
      losses: ps.losses,
      ties: ps.ties,
      total_profit: ps.total_profit,
      best_streak: 0,
      current_streak: 0,
    };
  }
  return db.prepare('SELECT * FROM user_stats WHERE username = ?').get(username);
}

function getAllUserStats() {
  return getLeaderboard('profit');
}

function getUserGameHistory(username, limit = 20) {
  return db.prepare(`
    SELECT s.room_code, s.room_name, s.started_at AS played_at,
           hp.delta, hp.result, h.hand_no
    FROM hand_players hp
    JOIN hand_records h ON hp.hand_id = h.id
    JOIN game_sessions s ON h.session_id = s.id
    WHERE hp.username = ?
    ORDER BY h.played_at DESC
    LIMIT ?
  `).all(username, limit);
}

module.exports = {
  db,
  encodeCards,
  decodeCards,
  findUserByUsername,
  getAllUsers,
  getPlayerUsers,
  createUser,
  updateUser,
  deleteUser,
  updateNickname,
  updateAvatar,
  updatePassword,
  createGameSession,
  finishGameSession,
  updateSessionSchedule,
  normalizeDurationMinutes,
  ALLOWED_DURATIONS,
  ALLOWED_EXTEND,
  saveHandRecord,
  saveSessionSettlement,
  listGameSessions,
  getSessionDetail,
  listSessionHandsForHistory,
  getPlayerStats,
  getLeaderboard,
  resetAllPlayerStats,
  resetWinrateStats,
  resetProfitStats,
  deleteGameSession,
  deleteAllGameSessions,
  listQuickMessages,
  replaceQuickMessages,
  saveGameRecord,
  getUserStats,
  getAllUserStats,
  getUserGameHistory,
};
