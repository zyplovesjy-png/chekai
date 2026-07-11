/* ========== 用户系统：SQLite + bcrypt + JWT（单端登录） ========== */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {
  findUserByUsername,
  getAllUsers,
  getPlayerUsers,
  updateAvatar,
  updateNickname,
  updatePassword,
  createUser,
  updateUser,
  deleteUser,
  getPlayerStats,
} = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'chekai_secret_2024_change_me';
const JWT_EXPIRES_IN = '7d';

/** username -> 当前有效 session id（新登录会替换并踢掉旧端） */
const activeSessionByUser = new Map();

/** 旧会话被顶替时的回调（由 server 注册：关 WS） */
let onSessionReplaced = null;

function setSessionReplacedHandler(fn) {
  onSessionReplaced = typeof fn === 'function' ? fn : null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    username: user.username,
    nickname: user.nickname,
    avatar_path: user.avatar_path,
    role: user.role || 'player',
    disabled: !!user.disabled,
  };
}

function login(username, password) {
  const user = findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { ok: false, msg: '账号或密码错误' };
  }
  if (user.disabled) {
    return { ok: false, msg: '账号已被禁用' };
  }
  const sid = crypto.randomBytes(16).toString('hex');
  const prevSid = activeSessionByUser.get(user.username) || null;
  activeSessionByUser.set(user.username, sid);

  const token = jwt.sign(
    {
      username: user.username,
      nickname: user.nickname,
      avatar_path: user.avatar_path,
      role: user.role || 'player',
      sid,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );

  if (prevSid && prevSid !== sid && onSessionReplaced) {
    try {
      onSessionReplaced(user.username, prevSid);
    } catch (e) {
      console.error('[auth] onSessionReplaced failed', e);
    }
  }

  return {
    ok: true,
    token,
    user: publicUser(user),
    sessionReplaced: !!prevSid,
  };
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/** 校验 JWT 是否仍为该账号当前会话（防多端） */
function isSessionActive(payload) {
  if (!payload?.username || !payload?.sid) return false;
  const current = activeSessionByUser.get(payload.username);
  // 服务端重启后内存会话清空：允许首个合法 token 认领，避免全体被迫重登
  if (!current) {
    activeSessionByUser.set(payload.username, payload.sid);
    return true;
  }
  return current === payload.sid;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ ok: false, msg: '未登录或登录已过期' });
  }
  if (!isSessionActive(payload)) {
    return res.status(401).json({
      ok: false,
      code: 'SESSION_REPLACED',
      msg: '账号已在其他设备登录',
    });
  }
  const fresh = findUserByUsername(payload.username);
  if (!fresh || fresh.disabled) {
    return res.status(401).json({ ok: false, msg: '账号不可用' });
  }
  req.user = {
    username: fresh.username,
    nickname: fresh.nickname,
    avatar_path: fresh.avatar_path,
    role: fresh.role || 'player',
    sid: payload.sid,
  };
  next();
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, msg: '需要管理员权限' });
    }
    next();
  });
}

function getProfile(username) {
  const user = findUserByUsername(username);
  if (!user) return null;
  const stats = getPlayerStats(username);
  return {
    ...publicUser(user),
    stats: stats || { total_hands: 0, wins: 0, losses: 0, ties: 0, total_profit: 0 },
  };
}

function setAvatar(username, avatarPath) {
  updateAvatar(username, avatarPath);
}

function changeProfile(username, { nickname, oldPassword, newPassword }) {
  // 玩家仅可改昵称/密码/头像；账号 username 由管理员创建，此处永不改写
  const user = findUserByUsername(username);
  if (!user) return { ok: false, msg: '用户不存在' };
  if (nickname != null && nickname.trim()) {
    updateNickname(username, nickname.trim().slice(0, 20));
  }
  if (newPassword) {
    if (!oldPassword || !bcrypt.compareSync(oldPassword, user.password_hash)) {
      return { ok: false, msg: '原密码不正确' };
    }
    if (String(newPassword).length < 4) {
      return { ok: false, msg: '新密码至少 4 位' };
    }
    updatePassword(username, newPassword);
  }
  return { ok: true, profile: getProfile(username) };
}

function listUsers() {
  return getAllUsers({ includeAdmin: true, includeDisabled: true });
}

function listPlayers() {
  return getPlayerUsers();
}

/** 主动注销当前会话（可选） */
function clearSession(username, sid) {
  const current = activeSessionByUser.get(username);
  if (current && (!sid || current === sid)) {
    activeSessionByUser.delete(username);
  }
}

module.exports = {
  login,
  verifyToken,
  isSessionActive,
  setSessionReplacedHandler,
  clearSession,
  authMiddleware,
  adminMiddleware,
  getProfile,
  setAvatar,
  changeProfile,
  listUsers,
  listPlayers,
  createUser,
  updateUser,
  deleteUser,
  publicUser,
  JWT_SECRET,
};
