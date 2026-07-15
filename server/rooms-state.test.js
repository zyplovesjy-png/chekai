const test = require('node:test');
const assert = require('node:assert/strict');
const {
  roomsByCode,
  getRoomInfo,
  cleanupDisconnectedLobbyMemberships,
  updateRoomUserAvatar,
} = require('./rooms');

function makeRoom(code, username = 'player1') {
  return {
    code,
    name: '测试房间',
    host: username,
    creator: username,
    durationMinutes: 120,
    endsAt: null,
    extendedMinutes: 0,
    minBuyIn: 100,
    members: [{ username, nickname: '玩家一', ready: false, avatar_path: null }],
    seats: [
      { username, nickname: '玩家一', ready: false, buyIn: 100, avatar_path: null },
      ...Array(7).fill(null),
    ],
    gameStarted: false,
    gameRound: 0,
    paused: false,
    endAfterHand: false,
    disbanded: false,
    createdAt: Date.now(),
    ws: new Set(),
    disconnected: {},
  };
}

test('room snapshots and broadcasts include the latest uploaded avatar', () => {
  const code = 'AVT';
  const room = makeRoom(code);
  const sent = [];
  room.ws.add({
    username: 'player1',
    readyState: 1,
    send: (payload) => sent.push(JSON.parse(payload)),
  });
  roomsByCode.set(code, room);

  try {
    assert.equal(updateRoomUserAvatar('player1', '/avatars/player1.png?v=2'), 1);
    assert.equal(room.seats[0].avatar_path, '/avatars/player1.png?v=2');
    assert.equal(getRoomInfo(code, { username: 'player1' }).members[0].avatar_path, '/avatars/player1.png?v=2');
    assert.equal(sent[sent.length - 1].room.members[0].avatar_path, '/avatars/player1.png?v=2');
  } finally {
    roomsByCode.delete(code);
  }
});

test('a disconnected member confirmed back in the lobby is removed and an empty pregame room is destroyed', () => {
  const code = 'GST';
  const room = makeRoom(code);
  room.disconnected.player1 = Date.now();
  roomsByCode.set(code, room);

  assert.equal(cleanupDisconnectedLobbyMemberships('player1', Date.now() - 10_000), 0);
  assert.equal(roomsByCode.has(code), true);
  assert.equal(cleanupDisconnectedLobbyMemberships('player1', Date.now()), 1);
  assert.equal(roomsByCode.has(code), false);
});
