const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_QUICK_MESSAGES,
  DEFAULT_QUICK_MESSAGES,
  RoomMessageRateLimiter,
  createRoomMessageBroadcast,
  initialQuickMessages,
  validateQuickMessageList,
  validateRoomMessageContent,
} = require('./quick-messages');

test('room message normalization removes controls and preserves unicode', () => {
  assert.deepEqual(validateRoomMessageContent('  你好\n\t♠️  '), {
    ok: true,
    content: '你好 ♠️',
  });
});

test('room message rejects empty and overlong content', () => {
  assert.equal(validateRoomMessageContent('\n\t').ok, false);
  assert.equal(validateRoomMessageContent('好'.repeat(41)).ok, false);
  assert.equal(validateRoomMessageContent('😀'.repeat(40)).ok, true);
});

test('quick message list keeps order and validates limits', () => {
  const result = validateQuickMessageList([
    { id: 9, content: ' 第一条 ' },
    { content: '第二条' },
  ]);
  assert.deepEqual(result, {
    ok: true,
    messages: [{ content: '第一条' }, { content: '第二条' }],
  });
  assert.equal(
    validateQuickMessageList(Array.from({ length: MAX_QUICK_MESSAGES + 1 }, () => ({ content: 'x' }))).ok,
    false,
  );
  assert.deepEqual(
    validateQuickMessageList(['第一条', '第二条']).messages,
    [{ content: '第一条' }, { content: '第二条' }],
  );
});

test('default messages are seeded only for the first table creation', () => {
  assert.deepEqual(initialQuickMessages(false), [...DEFAULT_QUICK_MESSAGES]);
  assert.deepEqual(initialQuickMessages(true), []);
  assert.equal(DEFAULT_QUICK_MESSAGES.length, 6);
});

test('broadcast ignores spoofed identity and exposes only nickname and content', () => {
  const result = createRoomMessageBroadcast('服务端昵称', {
    nickname: '伪造昵称',
    username: 'hidden-account',
    userId: 42,
    sentAt: 123,
    content: '  大家好  ',
  });
  assert.deepEqual(result, {
    ok: true,
    payload: {
      type: 'room_message',
      nickname: '服务端昵称',
      content: '大家好',
    },
  });
  assert.deepEqual(Object.keys(result.payload), ['type', 'nickname', 'content']);
});

test('rate limiter is scoped by key and cannot be bypassed before cooldown', () => {
  const limiter = new RoomMessageRateLimiter(2000);
  assert.equal(limiter.check('123456:user1', 10000).ok, true);
  assert.equal(limiter.check('123456:user1', 11999).ok, false);
  assert.equal(limiter.check('123456:user2', 11999).ok, true);
  assert.equal(limiter.check('123456:user1', 12000).ok, true);
});
