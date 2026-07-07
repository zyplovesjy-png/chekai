/* ========== 用户系统：SQLite + bcrypt + JWT ========== */
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { findUserByUsername, getAllUsers, updateAvatar } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'chekai_secret_2024_change_me';
const JWT_EXPIRES_IN = '7d';

function login(username, password) {
  const user = findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { ok: false, msg: '账号或密码错误' };
  }
  const token = jwt.sign(
    { username: user.username, nickname: user.nickname, avatar_path: user.avatar_path },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
  return {
    ok: true,
    token,
    user: {
      username: user.username,
      nickname: user.nickname,
      avatar_path: user.avatar_path,
    }
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ ok: false, msg: '未登录或登录已过期' });
  }
  req.user = payload;
  next();
}

function getProfile(username) {
  const user = findUserByUsername(username);
  if (!user) return null;
  return {
    username: user.username,
    nickname: user.nickname,
    avatar_path: user.avatar_path,
  };
}

function setAvatar(username, avatarPath) {
  updateAvatar(username, avatarPath);
}

function listUsers() {
  return getAllUsers();
}

module.exports = {
  login,
  verifyToken,
  authMiddleware,
  getProfile,
  setAvatar,
  listUsers,
  JWT_SECRET,
};
