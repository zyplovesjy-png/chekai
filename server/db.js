/* ========== SQLite 数据库：用户 + 对战记录 + 统计 ========== */
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'chekai.db');

// 确保 data 目录存在
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ========== 建表 ==========
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_path TEXT DEFAULT NULL,
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
`);

// ========== 预设账号初始化 ==========
const PRESET_USERS = [
  { username: 'user1', nickname: '玩家1', password: '123456' },
  { username: 'user2', nickname: '玩家2', password: '123456' },
  { username: 'user3', nickname: '玩家3', password: '123456' },
  { username: 'user4', nickname: '玩家4', password: '123456' },
  { username: 'user5', nickname: '玩家5', password: '123456' },
  { username: 'user6', nickname: '玩家6', password: '123456' },
  { username: 'user7', nickname: '玩家7', password: '123456' },
  { username: 'user8', nickname: '玩家8', password: '123456' },
];

const insertUser = db.prepare(
  'INSERT OR IGNORE INTO users (username, nickname, password_hash) VALUES (?, ?, ?)'
);

const insertStats = db.prepare(
  'INSERT OR IGNORE INTO user_stats (username) VALUES (?)'
);

PRESET_USERS.forEach(u => {
  const hash = bcrypt.hashSync(u.password, 10);
  insertUser.run(u.username, u.nickname, hash);
  insertStats.run(u.username);
});

console.log('[db] SQLite 数据库初始化完成，预设账号已就绪');

// ========== 用户查询方法 ==========
function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getAllUsers() {
  return db.prepare('SELECT id, username, nickname, avatar_path, created_at FROM users').all();
}

function updateNickname(username, nickname) {
  db.prepare('UPDATE users SET nickname = ? WHERE username = ?').run(nickname, username);
}

function updateAvatar(username, avatarPath) {
  db.prepare('UPDATE users SET avatar_path = ? WHERE username = ?').run(avatarPath, username);
}

// ========== 对战记录 ==========
function saveGameRecord(roomCode, playerResults) {
  const insertGame = db.prepare(
    'INSERT INTO game_records (room_code, game_type) VALUES (?, ?)'
  );
  const insertPlayer = db.prepare(
    'INSERT INTO player_records (game_id, username, buy_in, final_pot, delta, is_winner) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    // game_type 列保留兼容旧库，统一写入固定值
    const result = insertGame.run(roomCode, 'chekai');
    const gameId = result.lastInsertRowid;

    for (const p of playerResults) {
      insertPlayer.run(gameId, p.username, p.buyIn || 0, p.finalPot || 0, p.delta || 0, p.isWinner ? 1 : 0);
    }

    // 更新统计
    for (const p of playerResults) {
      const stats = db.prepare('SELECT * FROM user_stats WHERE username = ?').get(p.username);
      if (stats) {
        const totalGames = stats.total_games + 1;
        const wins = stats.wins + (p.isWinner ? 1 : 0);
        const losses = stats.losses + (p.isWinner ? 0 : 1);
        const totalProfit = stats.total_profit + (p.delta || 0);
        const currentStreak = p.isWinner ? stats.current_streak + 1 : 0;
        const bestStreak = Math.max(stats.best_streak, currentStreak);

        db.prepare(
          'UPDATE user_stats SET total_games=?, wins=?, losses=?, total_profit=?, best_streak=?, current_streak=? WHERE username=?'
        ).run(totalGames, wins, losses, totalProfit, bestStreak, currentStreak, p.username);
      }
    }
  });

  tx();
}

function getUserStats(username) {
  return db.prepare('SELECT * FROM user_stats WHERE username = ?').get(username);
}

function getAllUserStats() {
  return db.prepare(`
    SELECT u.username, u.nickname, u.avatar_path,
           s.total_games, s.wins, s.losses, s.total_profit, s.best_streak
    FROM users u
    LEFT JOIN user_stats s ON u.username = s.username
    ORDER BY s.total_profit DESC
  `).all();
}

function getUserGameHistory(username, limit = 20) {
  return db.prepare(`
    SELECT g.room_code, g.game_type, g.played_at,
           p.buy_in, p.final_pot, p.delta, p.is_winner
    FROM player_records p
    JOIN game_records g ON p.game_id = g.id
    WHERE p.username = ?
    ORDER BY g.played_at DESC
    LIMIT ?
  `).all(username, limit);
}

module.exports = {
  db,
  findUserByUsername,
  getAllUsers,
  updateNickname,
  updateAvatar,
  saveGameRecord,
  getUserStats,
  getAllUserStats,
  getUserGameHistory,
};
