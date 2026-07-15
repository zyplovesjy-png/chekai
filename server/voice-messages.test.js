const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VoiceMessageManager,
  detectVoiceMime,
  normalizeVoiceDuration,
} = require('./voice-messages');

function ready(manager, reservation, overrides = {}) {
  return manager.complete({
    id: reservation.id,
    roomCode: reservation.roomCode,
    username: reservation.username,
    filePath: `/tmp/${reservation.id}`,
    fileSize: 1024,
    mimeType: 'audio/webm',
    durationMs: 1200,
    now: 1001,
    ...overrides,
  });
}

test('detects supported browser recording containers by signature', () => {
  assert.equal(detectVoiceMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), 'audio/webm');
  assert.equal(detectVoiceMime(Buffer.from('OggSvoice')), 'audio/ogg');
  assert.equal(detectVoiceMime(Buffer.from([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20])), 'audio/mp4');
  assert.equal(detectVoiceMime(Buffer.from('not audio')), null);
});

test('normalizes duration and rejects clips outside the allowed range', () => {
  assert.equal(normalizeVoiceDuration(499), null);
  assert.equal(normalizeVoiceDuration(500.4), 500);
  assert.equal(normalizeVoiceDuration(15020), 15000);
  assert.equal(normalizeVoiceDuration(16000), null);
});

test('broadcast order follows reservations rather than upload completion', () => {
  let nextId = 0;
  const manager = new VoiceMessageManager({ idFactory: () => `v${++nextId}` });
  const first = manager.reserve({ roomCode: '123', username: 'a', nickname: '甲', now: 1000 }).record;
  const second = manager.reserve({ roomCode: '123', username: 'b', nickname: '乙', now: 1000 }).record;

  assert.equal(ready(manager, second).ok, true);
  assert.deepEqual(manager.drainBroadcastable('123', 1002).ready, []);

  assert.equal(ready(manager, first).ok, true);
  assert.deepEqual(
    manager.drainBroadcastable('123', 1003).ready.map((record) => record.id),
    ['v1', 'v2'],
  );
});

test('expired reservation is skipped so later voice messages are not blocked', () => {
  let nextId = 0;
  const manager = new VoiceMessageManager({ reservationTtlMs: 50, idFactory: () => `v${++nextId}` });
  manager.reserve({ roomCode: '123', username: 'a', nickname: '甲', now: 1000 });
  const second = manager.reserve({ roomCode: '123', username: 'b', nickname: '乙', now: 1000 }).record;
  assert.equal(ready(manager, second).ok, true);

  const drained = manager.drainBroadcastable('123', 1051);
  assert.deepEqual(drained.expired.map((record) => record.id), ['v1']);
  assert.deepEqual(drained.ready.map((record) => record.id), ['v2']);
});

test('playback acknowledgements complete only after every recipient responds', () => {
  const manager = new VoiceMessageManager({ idFactory: () => 'voice' });
  const record = manager.reserve({ roomCode: '123', username: 'sender', nickname: '发送者', now: 1000 }).record;
  ready(manager, record);
  manager.markRecipients(record.id, ['sender', 'one', 'two']);

  assert.equal(manager.acknowledgePlayed(record.id, 'sender').ok, false);
  assert.equal(manager.acknowledgePlayed(record.id, 'one').complete, false);
  assert.equal(manager.acknowledgePlayed(record.id, 'two').complete, true);
});
