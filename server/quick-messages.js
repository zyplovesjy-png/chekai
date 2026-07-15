const MAX_QUICK_MESSAGES = 50;
const MAX_ROOM_MESSAGE_CHARS = 40;
const ROOM_MESSAGE_COOLDOWN_MS = 2000;
const DEFAULT_QUICK_MESSAGES = Object.freeze([
  '大家好，祝大家手气好！',
  '快点吧，等得花儿都谢了',
  '这手打得漂亮！',
  '别急，我想一下',
  '手气不错哦',
  '承让承让',
]);

function initialQuickMessages(tableAlreadyExists) {
  return tableAlreadyExists ? [] : [...DEFAULT_QUICK_MESSAGES];
}

function normalizeRoomMessageContent(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function codePointLength(value) {
  return Array.from(value || '').length;
}

function validateRoomMessageContent(value) {
  const content = normalizeRoomMessageContent(value);
  if (!content) return { ok: false, msg: '消息不能为空' };
  if (codePointLength(content) > MAX_ROOM_MESSAGE_CHARS) {
    return { ok: false, msg: `消息最多 ${MAX_ROOM_MESSAGE_CHARS} 个字` };
  }
  return { ok: true, content };
}

function validateQuickMessageList(value) {
  if (!Array.isArray(value)) return { ok: false, msg: '快捷消息格式错误' };
  if (value.length > MAX_QUICK_MESSAGES) {
    return { ok: false, msg: `快捷消息最多 ${MAX_QUICK_MESSAGES} 条` };
  }
  const messages = [];
  for (const item of value) {
    const checked = validateRoomMessageContent(typeof item === 'string' ? item : item?.content);
    if (!checked.ok) return checked;
    messages.push({ content: checked.content });
  }
  return { ok: true, messages };
}

function createRoomMessageBroadcast(serverNickname, clientPayload) {
  const checked = validateRoomMessageContent(clientPayload?.content);
  if (!checked.ok) return checked;
  return {
    ok: true,
    payload: {
      type: 'room_message',
      nickname: String(serverNickname || '玩家'),
      content: checked.content,
    },
  };
}

class RoomMessageRateLimiter {
  constructor(cooldownMs = ROOM_MESSAGE_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs;
    this.lastSentAt = new Map();
  }

  check(key, now = Date.now()) {
    const last = this.lastSentAt.get(key) || 0;
    const retryAfterMs = this.cooldownMs - (now - last);
    if (retryAfterMs > 0) return { ok: false, retryAfterMs };
    this.lastSentAt.set(key, now);
    return { ok: true, retryAfterMs: 0 };
  }

  clear(key) {
    this.lastSentAt.delete(key);
  }
}

module.exports = {
  MAX_QUICK_MESSAGES,
  MAX_ROOM_MESSAGE_CHARS,
  ROOM_MESSAGE_COOLDOWN_MS,
  DEFAULT_QUICK_MESSAGES,
  initialQuickMessages,
  normalizeRoomMessageContent,
  codePointLength,
  validateRoomMessageContent,
  validateQuickMessageList,
  createRoomMessageBroadcast,
  RoomMessageRateLimiter,
};
