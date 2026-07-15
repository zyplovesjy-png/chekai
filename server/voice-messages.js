const crypto = require('crypto');

const MIN_VOICE_DURATION_MS = 500;
const MAX_VOICE_DURATION_MS = 15_000;
const MAX_VOICE_FILE_BYTES = 256 * 1024;
const VOICE_RESERVATION_TTL_MS = 20_000;
const VOICE_FILE_TTL_MS = 10 * 60 * 1000;

const MIME_EXTENSIONS = Object.freeze({
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/ogg': '.ogg',
});

function normalizeVoiceDuration(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs)) return null;
  const rounded = Math.round(durationMs);
  if (rounded < MIN_VOICE_DURATION_MS || rounded > MAX_VOICE_DURATION_MS + 750) return null;
  return Math.min(rounded, MAX_VOICE_DURATION_MS);
}

function detectVoiceMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (
    buffer[0] === 0x1a
    && buffer[1] === 0x45
    && buffer[2] === 0xdf
    && buffer[3] === 0xa3
  ) return 'audio/webm';
  if (buffer.subarray(0, 4).toString('ascii') === 'OggS') return 'audio/ogg';
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') return 'audio/mp4';
  return null;
}

class VoiceMessageManager {
  constructor({
    reservationTtlMs = VOICE_RESERVATION_TTL_MS,
    fileTtlMs = VOICE_FILE_TTL_MS,
    idFactory = () => crypto.randomUUID(),
  } = {}) {
    this.reservationTtlMs = reservationTtlMs;
    this.fileTtlMs = fileTtlMs;
    this.idFactory = idFactory;
    this.records = new Map();
    this.rooms = new Map();
  }

  roomState(roomCode) {
    let state = this.rooms.get(roomCode);
    if (!state) {
      state = { nextSequence: 1, nextBroadcastSequence: 1, bySequence: new Map() };
      this.rooms.set(roomCode, state);
    }
    return state;
  }

  reserve({ roomCode, username, nickname, now = Date.now() }) {
    if (!roomCode || !username) return { ok: false, msg: '语音预约信息不完整' };
    const state = this.roomState(roomCode);
    const sequence = state.nextSequence++;
    const record = {
      id: this.idFactory(),
      roomCode,
      username,
      nickname: String(nickname || '玩家'),
      sequence,
      status: 'reserved',
      createdAt: now,
      reservationExpiresAt: now + this.reservationTtlMs,
      expiresAt: null,
      filePath: null,
      fileSize: 0,
      mimeType: null,
      durationMs: null,
      broadcasted: false,
      expectedRecipients: new Set(),
      playedBy: new Set(),
    };
    this.records.set(record.id, record);
    state.bySequence.set(sequence, record.id);
    return { ok: true, record };
  }

  complete({ id, roomCode, username, filePath, fileSize, mimeType, durationMs, now = Date.now() }) {
    const record = this.records.get(id);
    if (!record || record.status !== 'reserved') return { ok: false, msg: '语音预约已失效' };
    if (record.roomCode !== roomCode || record.username !== username) {
      return { ok: false, msg: '语音预约与当前用户或房间不匹配' };
    }
    if (record.reservationExpiresAt < now) return { ok: false, msg: '语音上传超时，请重试' };
    if (!MIME_EXTENSIONS[mimeType]) return { ok: false, msg: '不支持的语音格式' };
    if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_VOICE_FILE_BYTES) {
      return { ok: false, msg: '语音文件大小不合法' };
    }
    const checkedDuration = normalizeVoiceDuration(durationMs);
    if (checkedDuration == null) return { ok: false, msg: '语音时长应为 0.5 至 15 秒' };

    Object.assign(record, {
      status: 'ready',
      filePath,
      fileSize,
      mimeType,
      durationMs: checkedDuration,
      expiresAt: now + this.fileTtlMs,
    });
    return { ok: true, record };
  }

  drainBroadcastable(roomCode, now = Date.now()) {
    const state = this.rooms.get(roomCode);
    if (!state) return { ready: [], expired: [] };
    const ready = [];
    const expired = [];

    while (state.nextBroadcastSequence < state.nextSequence) {
      const sequence = state.nextBroadcastSequence;
      const id = state.bySequence.get(sequence);
      const record = id ? this.records.get(id) : null;

      if (!record) {
        state.nextBroadcastSequence++;
        continue;
      }
      if (record.status === 'ready') {
        if (!record.broadcasted) {
          record.broadcasted = true;
          ready.push(record);
        }
        state.nextBroadcastSequence++;
        continue;
      }
      if (record.reservationExpiresAt <= now) {
        expired.push(record);
        this.remove(record.id);
        state.nextBroadcastSequence++;
        continue;
      }
      break;
    }
    return { ready, expired };
  }

  markRecipients(id, usernames) {
    const record = this.records.get(id);
    if (!record || record.status !== 'ready') return null;
    record.expectedRecipients = new Set(
      [...(usernames || [])].filter((username) => username && username !== record.username),
    );
    return record;
  }

  acknowledgePlayed(id, username) {
    const record = this.records.get(id);
    if (!record || record.status !== 'ready' || !record.expectedRecipients.has(username)) {
      return { ok: false, complete: false, record: record || null };
    }
    record.playedBy.add(username);
    const complete = [...record.expectedRecipients].every((name) => record.playedBy.has(name));
    return { ok: true, complete, record };
  }

  get(id) {
    return this.records.get(id) || null;
  }

  remove(id) {
    const record = this.records.get(id);
    if (!record) return null;
    this.records.delete(id);
    const state = this.rooms.get(record.roomCode);
    state?.bySequence.delete(record.sequence);
    return record;
  }

  cleanupExpired(now = Date.now()) {
    const removed = [];
    for (const record of this.records.values()) {
      const expired = record.status === 'reserved'
        ? record.reservationExpiresAt <= now
        : record.expiresAt <= now;
      if (!expired) continue;
      const deleted = this.remove(record.id);
      if (deleted) removed.push(deleted);
    }
    return removed;
  }

  removeRoom(roomCode) {
    const removed = [];
    for (const record of [...this.records.values()]) {
      if (record.roomCode !== roomCode) continue;
      const deleted = this.remove(record.id);
      if (deleted) removed.push(deleted);
    }
    this.rooms.delete(roomCode);
    return removed;
  }
}

module.exports = {
  MIN_VOICE_DURATION_MS,
  MAX_VOICE_DURATION_MS,
  MAX_VOICE_FILE_BYTES,
  VOICE_RESERVATION_TTL_MS,
  VOICE_FILE_TTL_MS,
  MIME_EXTENSIONS,
  normalizeVoiceDuration,
  detectVoiceMime,
  VoiceMessageManager,
};
