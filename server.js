/*
Ball Clash Arena release server.

This server deliberately keeps multiplayer authority on the server:
clients send inputs/intents only, while the server owns rooms, phases,
canonical arena coordinates, HP, cooldowns, projectiles, match results,
rematches, reconnects, and cleanup.

Zero runtime dependencies are used so Render deployment remains simple.
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const ROOT_HTML = path.join(__dirname, 'index.html');
const LEGACY_HTML = path.join(__dirname, 'ball_clash_arena_v10.html');

const PROTOCOL_VERSION = 2;
const MAX_FRAME = 64 * 1024;
const MAX_NAME = 18;
const MAX_ROOM_PLAYERS = 6;
const ROOM_TTL_MS = 1000 * 60 * 60 * 3;
const DISCONNECT_GRACE_MS = 15_000;
const COUNTDOWN_MS = 3000;
const RETURNING_MS = 900;
const TEST_SHORT_MATCH = process.env.BCA_TEST_SHORT_MATCH === '1';
const DUEL_DURATION = TEST_SHORT_MATCH ? 4 : 99;
const FFA_DURATION = TEST_SHORT_MATCH ? 4 : 125;
const TICK_RATE = 60;
const SNAPSHOT_RATE = 18;
const INPUT_RATE_LIMIT = { windowMs: 1000, max: 45 };
const MESSAGE_RATE_LIMIT = { windowMs: 1000, max: 80 };

const PHASES = Object.freeze({
  LOBBY: 'lobby',
  CHARACTER_SELECT: 'character_select',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  ROUND_OVER: 'round_over',
  REMATCH_WAIT: 'rematch_wait',
  RETURNING_TO_LOBBY: 'returning_to_lobby',
  CLOSED: 'closed'
});

const ARENA = Object.freeze({ width: 1920, height: 1080, x: 120, y: 120, w: 1680, h: 840, floor: 960 });

// Server-side roster subset: IDs and battle-relevant numbers mirror the client roster.
// The client can render richer effects, but these values are authoritative online.
const ROSTER = Object.freeze({
  stasis:   { name: 'Stasis',      hp: 108, speed: .92, jump: .96, dmg: 8,  reach: 86,  cd: .42, radius: 28, color: '#72e8ff', color2: '#d6fbff', projectile: 'knife' },
  monkey:   { name: 'Monkey King', hp: 98,  speed: 1.17, jump: 1.23, dmg: 9,  reach: 132, cd: .36, radius: 27, color: '#ffd45c', color2: '#ff8f2e' },
  magia:    { name: 'Magia',       hp: 88,  speed: .90, jump: .94, dmg: 8,  reach: 78,  cd: .55, radius: 27, color: '#ff8eea', color2: '#fff2fb', projectile: 'heart' },
  sword:    { name: 'Sword Saint', hp: 100, speed: 1.00, jump: 1.02, dmg: 14, reach: 96,  cd: .52, radius: 28, color: '#f0f7ff', color2: '#76a8ff' },
  spear:    { name: 'Spear',       hp: 112, speed: 1.04, jump: 1.05, dmg: 14, reach: 138, cd: .42, radius: 28, color: '#72ffb0', color2: '#d9ffe5' },
  katana:   { name: 'Katana',      hp: 90,  speed: 1.20, jump: 1.09, dmg: 10, reach: 86,  cd: .31, radius: 26, color: '#ff5c88', color2: '#ffe2ea' },
  mach:     { name: 'Mach',        hp: 94,  speed: 1.52, jump: 1.10, dmg: 9,  reach: 82,  cd: .30, radius: 27, color: '#73f7ff', color2: '#2f69ff' },
  axiom:    { name: 'Axiom',       hp: 104, speed: .96, jump: .97, dmg: 10, reach: 94,  cd: .50, radius: 28, color: '#9cff6a', color2: '#b277ff', projectile: 'red' },
  samurai:  { name: 'Samurai',     hp: 112, speed: 1.02, jump: 1.03, dmg: 13, reach: 95,  cd: .48, radius: 29, color: '#ff8c4a', color2: '#d8fff4' },
  lance:    { name: 'Lance',       hp: 106, speed: .92, jump: .94, dmg: 11, reach: 132, cd: .62, radius: 29, color: '#5cb8ff', color2: '#fff05c' },
  unarmed:  { name: 'Unarmed',     hp: 112, speed: 1.08, jump: 1.10, dmg: 10, reach: 58,  cd: .29, radius: 28, color: '#b9ff7c', color2: '#ffffff' },
  rapier:   { name: 'Rapier',      hp: 92,  speed: 1.13, jump: 1.05, dmg: 12, reach: 114, cd: .37, radius: 26, color: '#ff93df', color2: '#fff5fd' },
  goku:     { name: 'Monkey',      hp: 104, speed: 1.16, jump: 1.10, dmg: 11, reach: 62,  cd: .31, radius: 28, color: '#ff8d24', color2: '#2c86ff', projectile: 'kame' },
  thunder:  { name: 'Thundergod',  hp: 116, speed: .98, jump: 1.02, dmg: 14, reach: 86,  cd: .48, radius: 29, color: '#8bd8ff', color2: '#f7f9ff', projectile: 'lightning' },
  ninja:    { name: 'Ninja',       hp: 94,  speed: 1.22, jump: 1.12, dmg: 9,  reach: 92,  cd: .34, radius: 26, color: '#b7c6d9', color2: '#66d6ff', projectile: 'shuriken' },
  brute:    { name: 'Brute',       hp: 122, speed: .76, jump: .84, dmg: 11, reach: 100, cd: .82, radius: 30, color: '#d6573d', color2: '#ffc067' },
  magician: { name: 'Magician',    hp: 92,  speed: .91, jump: .96, dmg: 9,  reach: 92,  cd: .46, radius: 27, color: '#c084fc', color2: '#7dd3fc', projectile: 'glyph' },
  viking:   { name: 'Viking',      hp: 118, speed: .90, jump: .92, dmg: 13, reach: 108, cd: .56, radius: 30, color: '#f97316', color2: '#fde68a' },
  warp:     { name: 'Warp',        hp: 96,  speed: 1.07, jump: 1.05, dmg: 9,  reach: 86,  cd: .42, radius: 27, color: '#38bdf8', color2: '#c084fc', projectile: 'blue' },
  archer:   { name: 'Archer',      hp: 94,  speed: 1.02, jump: 1.03, dmg: 9,  reach: 94,  cd: .42, radius: 27, color: '#bef264', color2: '#f4d35e', projectile: 'arrow' },
  ai:       { name: 'A.I.',        hp: 104, speed: .98, jump: .98, dmg: 10, reach: 96,  cd: .48, radius: 28, color: '#28d7ff', color2: '#d946ef', projectile: 'glyph' },
  slayer:   { name: 'Slayer',      hp: 108, speed: 1.06, jump: 1.08, dmg: 12, reach: 102, cd: .45, radius: 28, color: '#ff4d4d', color2: '#ffd6a5' }
});
const VALID_CHARS = new Set(Object.keys(ROSTER));
const rooms = new Map();
const clients = new Set();

function nowMs() { return Date.now(); }
function randomId(bytes = 8) { return crypto.randomBytes(bytes).toString('hex'); }
function randomRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
function makeUniqueRoomCode() {
  for (let i = 0; i < 32; i++) {
    const code = randomRoomCode();
    if (!rooms.has(code)) return code;
  }
  return randomRoomCode() + randomRoomCode().slice(0, 2);
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function num(v, fallback = 0) { return Number.isFinite(Number(v)) ? Number(v) : fallback; }
function normAng(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
function safeName(name) { return String(name || 'Player').trim().replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, MAX_NAME) || 'Player'; }
function safeRoom(room) { return String(room || '').toUpperCase().slice(0, 24).replace(/[^A-Z0-9_-]/g, ''); }
function safeMode(mode) { return String(mode || 'duel').toLowerCase() === 'ffa' ? 'ffa' : 'duel'; }
function safeChar(char) { const id = String(char || '').slice(0, 32).replace(/[^a-z0-9_-]/gi, '').toLowerCase(); return VALID_CHARS.has(id) ? id : 'stasis'; }
function roleForIndex(i) { return i === 0 ? 'host' : `p${i + 1}`; }
function maxPlayersFor(mode) { return mode === 'ffa' ? 6 : 2; }
function minPlayersFor(mode) { return 2; }

function encodeFrameObject(obj) {
  const data = Buffer.from(JSON.stringify(obj));
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  return Buffer.concat([header, data]);
}
function writeFrame(sock, frame) {
  if (!sock || sock.destroyed || !frame) return;
  try { sock.write(frame); } catch (_) {}
}
function sendFrame(sock, obj) { writeFrame(sock, encodeFrameObject(obj)); }
function sendEncoded(client, frame) { if (client && client.sock && client.connected) writeFrame(client.sock, frame); }
function send(client, obj) { if (client && client.sock && client.connected) sendFrame(client.sock, obj); }
function closeClient(client, code = 'closed') {
  if (!client || !client.sock || client.sock.destroyed) return;
  try { send(client, { type: 'error', code, message: code }); } catch (_) {}
  try { client.sock.end(); } catch (_) {}
}

function parseFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const start = offset;
    const b1 = buffer[offset++];
    const b2 = buffer[offset++];
    const opcode = b1 & 0x0f;
    let len = b2 & 0x7f;
    const masked = !!(b2 & 0x80);
    if (len === 126) {
      if (offset + 2 > buffer.length) return { messages, rest: buffer.subarray(start) };
      len = buffer.readUInt16BE(offset); offset += 2;
    } else if (len === 127) {
      if (offset + 8 > buffer.length) return { messages, rest: buffer.subarray(start) };
      const bigLen = buffer.readBigUInt64BE(offset); offset += 8;
      if (bigLen > BigInt(MAX_FRAME)) return { messages: [{ close: true }], rest: Buffer.alloc(0) };
      len = Number(bigLen);
    }
    if (len > MAX_FRAME) return { messages: [{ close: true }], rest: Buffer.alloc(0) };
    let mask = null;
    if (masked) {
      if (offset + 4 > buffer.length) return { messages, rest: buffer.subarray(start) };
      mask = buffer.subarray(offset, offset + 4); offset += 4;
    }
    if (offset + len > buffer.length) return { messages, rest: buffer.subarray(start) };
    const payload = Buffer.from(buffer.subarray(offset, offset + len));
    offset += len;
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    if (opcode === 0x8) messages.push({ close: true });
    else if (opcode === 0x9) messages.push({ ping: true });
    else if (opcode === 0x1) messages.push({ text: payload.toString('utf8') });
  }
  return { messages, rest: buffer.subarray(offset) };
}

function rateHit(bucket, limit) {
  const t = nowMs();
  if (!bucket.start || t - bucket.start > limit.windowMs) { bucket.start = t; bucket.count = 0; }
  bucket.count++;
  return bucket.count > limit.max;
}

function createRoom(mode = 'duel') {
  const code = makeUniqueRoomCode();
  const room = {
    code,
    mode: safeMode(mode),
    phase: PHASES.LOBBY,
    createdAt: nowMs(),
    touchedAt: nowMs(),
    hostId: null,
    order: [],
    players: new Map(),
    rematch: new Set(),
    seq: 0,
    countdownEndsAt: 0,
    returningEndsAt: 0,
    match: null,
    closedReason: ''
  };
  rooms.set(code, room);
  return room;
}
function getJoinableRoom(code) {
  const clean = safeRoom(code);
  if (!clean) return null;
  const room = rooms.get(clean);
  if (!room || room.phase === PHASES.CLOSED) return null;
  return room;
}
function roomPlayers(room) { return room.order.map(id => room.players.get(id)).filter(Boolean); }
function activePlayers(room) { return roomPlayers(room).filter(p => !p.left); }
function connectedPlayers(room) { return activePlayers(room).filter(p => p.connected); }
function requiredPlayers(room) { return activePlayers(room).filter(p => !p.spectator); }
function isHost(room, player) { return !!room && !!player && room.hostId === player.id; }
function touch(room) { if (room) room.touchedAt = nowMs(); }
function setPhase(room, phase) { room.phase = phase; room.seq++; touch(room); }
function broadcast(room, obj, except = null) {
  touch(room);
  const frame = encodeFrameObject(obj); // one JSON stringify per broadcast, not per recipient
  for (const p of roomPlayers(room)) if (p !== except && p.connected) sendEncoded(p, frame);
}
function resetReadiness(room) { for (const p of roomPlayers(room)) p.ready = false; }
function assignRoles(room) {
  const players = activePlayers(room);
  room.order = players.map(p => p.id);
  if (!room.hostId || !room.players.has(room.hostId) || room.players.get(room.hostId).left) room.hostId = players[0] ? players[0].id : null;
  for (let i = 0; i < players.length; i++) players[i].role = roleForIndex(i);
}
function publicPlayer(p) {
  return {
    id: p.id,
    role: p.role,
    name: p.name,
    char: p.char,
    ready: !!p.ready,
    connected: !!p.connected,
    host: false,
    rematch: false
  };
}
function roomState(room, target = null) {
  const players = roomPlayers(room).filter(p => !p.left).map(p => {
    const out = publicPlayer(p);
    out.host = p.id === room.hostId;
    out.rematch = room.rematch.has(p.id);
    return out;
  });
  return {
    type: 'room_state',
    protocol: PROTOCOL_VERSION,
    room: room.code,
    phase: room.phase,
    mode: room.mode,
    maxPlayers: maxPlayersFor(room.mode),
    minPlayers: minPlayersFor(room.mode),
    hostId: room.hostId,
    you: target ? target.id : undefined,
    players,
    rematchNeeded: requiredPlayers(room).map(p => p.id),
    rematchAccepted: [...room.rematch],
    arena: ARENA
  };
}
function broadcastState(room) { for (const p of roomPlayers(room)) if (p.connected) send(p, roomState(room, p)); }
function error(client, code, message) { send(client, { type: 'error', code, message }); }

function attachPlayerToRoom(client, room, opts = {}) {
  const player = opts.existing || client;
  player.sock = client.sock;
  player.buffer = client.buffer;
  player.connected = true;
  player.disconnectedAt = 0;
  player.lastSeen = nowMs();
  player.ip = client.ip;
  player.rate = client.rate || { msg: {}, input: {} };
  player.left = false;
  player.room = room.code;
  player.spectator = false;
  clients.add(player);
  if (player !== client) clients.delete(client);
  return player;
}
function joinRoom(client, room, { name, char }) {
  if (client.room) leaveRoom(client, { silent: true });
  const max = maxPlayersFor(room.mode);
  if (![PHASES.LOBBY, PHASES.CHARACTER_SELECT, PHASES.RETURNING_TO_LOBBY].includes(room.phase)) {
    error(client, 'match_already_started', 'Match already started. Reconnect with a valid token or create another room.');
    return;
  }
  if (activePlayers(room).length >= max) { send(client, { type: 'full', maxPlayers: max, mode: room.mode }); return; }
  const player = attachPlayerToRoom(client, room);
  player.id = player.id || randomId(6);
  player.token = player.token || randomId(16);
  player.name = safeName(name);
  player.char = safeChar(char);
  player.ready = false;
  player.input = emptyInput();
  player.lastInputSeq = 0;
  player.strikes = 0;
  player.left = false;
  room.players.set(player.id, player);
  if (!room.order.includes(player.id)) room.order.push(player.id);
  if (!room.hostId) room.hostId = player.id;
  assignRoles(room);
  if (room.phase === PHASES.LOBBY) setPhase(room, PHASES.CHARACTER_SELECT);
  send(player, { type: 'joined', protocol: PROTOCOL_VERSION, role: player.role, id: player.id, sessionId: player.id, reconnectToken: player.token, room: room.code, mode: room.mode, maxPlayers: max, phase: room.phase, arena: ARENA });
  // Legacy compatibility for older client branches.
  send(player, { type: 'role', role: player.role, id: player.id, token: player.token, room: room.code, mode: room.mode, maxPlayers: max, phase: room.phase, arena: ARENA });
  broadcastState(room);
}
function createRoomForClient(client, msg) {
  const room = createRoom(msg.mode);
  joinRoom(client, room, { name: msg.name, char: msg.char });
}
function joinExistingForClient(client, msg) {
  const room = getJoinableRoom(msg.room || msg.code);
  if (!room) { error(client, 'invalid_room', 'Invalid room code. Create a room or check the invite link.'); return; }
  joinRoom(client, room, { name: msg.name, char: msg.char });
}
function reconnectClient(client, msg) {
  const room = getJoinableRoom(msg.room || msg.code);
  const id = String(msg.sessionId || msg.id || '');
  const token = String(msg.reconnectToken || msg.token || '');
  if (!room || !id || !token || !room.players.has(id)) { error(client, 'reconnect_failed', 'Reconnect failed. The room or session was not found.'); return; }
  const player = room.players.get(id);
  if (player.token !== token || player.left) { error(client, 'reconnect_failed', 'Reconnect failed. Session token was rejected.'); return; }
  if (player.connected && player.sock && !player.sock.destroyed) { try { player.sock.end(); } catch (_) {} }
  clients.delete(player);
  Object.assign(client, {
    id: player.id, token: player.token, room: room.code, role: player.role,
    name: player.name, char: player.char, ready: player.ready, input: player.input || emptyInput(),
    lastInputSeq: player.lastInputSeq || 0, connected: true, disconnectedAt: 0, left: false
  });
  room.players.set(client.id, client);
  assignRoles(room);
  send(client, { type: 'joined', protocol: PROTOCOL_VERSION, role: client.role, id: client.id, sessionId: client.id, reconnectToken: client.token, room: room.code, mode: room.mode, maxPlayers: maxPlayersFor(room.mode), phase: room.phase, arena: ARENA, reconnected: true });
  broadcast(room, { type: 'peer_reconnected', id: client.id, name: client.name });
  broadcastState(room);
  if (room.match) send(client, { type: 'start', mode: room.mode, role: client.role, id: client.id, seq: room.seq, players: statePlayers(room), phase: room.phase, arena: ARENA, reconnected: true });
}
function leaveRoom(client, opts = {}) {
  const room = client && client.room ? rooms.get(client.room) : null;
  if (!room) return;
  const player = room.players.get(client.id) || client;
  player.left = true;
  player.connected = false;
  player.sock = null;
  player.ready = false;
  player.room = null;
  room.rematch.delete(player.id);
  const wasPlaying = [PHASES.COUNTDOWN, PHASES.PLAYING].includes(room.phase);
  if (!opts.silent) broadcast(room, { type: 'peer_left', id: player.id, name: player.name });
  room.players.delete(player.id);
  room.order = room.order.filter(id => id !== player.id);
  if (room.hostId === player.id) room.hostId = room.order[0] || null;
  assignRoles(room);
  if (room.players.size === 0) { closeRoom(room, 'empty'); return; }
  if (wasPlaying) {
    const survivors = requiredPlayers(room).filter(p => p.connected);
    if (survivors.length === 1) endMatch(room, survivors[0].id, 'Opponent left');
    else returnToLobby(room, 'Player left');
  } else if ([PHASES.ROUND_OVER, PHASES.REMATCH_WAIT].includes(room.phase)) {
    if (requiredPlayers(room).length < minPlayersFor(room.mode)) returnToLobby(room, 'Opponent left');
  }
  broadcastState(room);
}
function markDisconnected(client) {
  const room = client && client.room ? rooms.get(client.room) : null;
  if (!room) return;
  const player = room.players.get(client.id);
  if (!player || player.left) return;
  player.connected = false;
  player.sock = null;
  player.disconnectedAt = nowMs();
  player.ready = false;
  broadcast(room, { type: 'peer_disconnected', id: player.id, name: player.name, reconnectMs: DISCONNECT_GRACE_MS });
  if ([PHASES.COUNTDOWN, PHASES.PLAYING].includes(room.phase) && room.match) {
    room.match.pausedForDisconnect = true;
    room.match.disconnectUntil = nowMs() + DISCONNECT_GRACE_MS;
  } else {
    assignRoles(room);
    broadcastState(room);
  }
}
function closeRoom(room, reason = 'closed') {
  if (!room || room.phase === PHASES.CLOSED) return;
  setPhase(room, PHASES.CLOSED);
  room.closedReason = reason;
  broadcast(room, { type: 'room_closed', reason });
  rooms.delete(room.code);
}

function setMode(client, msg) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room || !isHost(room, client)) { error(client, 'not_host', 'Only the host can change mode before a match.'); return; }
  if (![PHASES.LOBBY, PHASES.CHARACTER_SELECT].includes(room.phase)) { error(client, 'phase_locked', 'Mode cannot be changed after the match starts.'); return; }
  room.mode = safeMode(msg.mode);
  const max = maxPlayersFor(room.mode);
  const overflow = room.order.slice(max);
  for (const id of overflow) {
    const p = room.players.get(id);
    if (p) { send(p, { type: 'error', code: 'room_mode_capacity', message: 'Host changed mode and the room no longer has space.' }); leaveRoom(p, { silent: true }); }
  }
  room.order = room.order.slice(0, max);
  resetReadiness(room);
  assignRoles(room);
  setPhase(room, PHASES.CHARACTER_SELECT);
  broadcastState(room);
}
function setChar(client, msg) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room) return;
  if (![PHASES.LOBBY, PHASES.CHARACTER_SELECT].includes(room.phase)) { error(client, 'phase_locked', 'Character can only be changed before a match.'); return; }
  client.char = safeChar(msg.char);
  client.ready = false;
  setPhase(room, PHASES.CHARACTER_SELECT);
  broadcastState(room);
}
function setReady(client, msg) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room) return;
  if (![PHASES.LOBBY, PHASES.CHARACTER_SELECT].includes(room.phase)) { error(client, 'phase_locked', 'Ready is only allowed in the lobby.'); return; }
  client.char = safeChar(msg.char || client.char);
  client.ready = !!msg.ready;
  setPhase(room, PHASES.CHARACTER_SELECT);
  broadcastState(room);
  maybeStart(room);
}
function maybeStart(room) {
  if (![PHASES.LOBBY, PHASES.CHARACTER_SELECT].includes(room.phase)) return;
  const players = requiredPlayers(room);
  if (players.length < minPlayersFor(room.mode)) return;
  if (players.length > maxPlayersFor(room.mode)) return;
  if (room.mode === 'duel' && players.length !== 2) return;
  if (!players.every(p => p.ready && p.connected && VALID_CHARS.has(p.char))) return;
  beginCountdown(room);
}
function statePlayers(room) { return requiredPlayers(room).map(p => ({ id: p.id, role: p.role, name: p.name, char: p.char, ready: p.ready, connected: p.connected })); }
function beginCountdown(room) {
  room.rematch.clear();
  initMatch(room);
  setPhase(room, PHASES.COUNTDOWN);
  room.countdownEndsAt = nowMs() + COUNTDOWN_MS;
  const players = statePlayers(room);
  for (const p of requiredPlayers(room)) {
    const msg = { type: 'start', protocol: PROTOCOL_VERSION, mode: room.mode, role: p.role, id: p.id, seq: room.seq, players, phase: room.phase, countdownMs: COUNTDOWN_MS, arena: ARENA };
    if (room.mode === 'duel') { msg.hostChar = players[0].char; msg.guestChar = players[1].char; }
    send(p, msg);
  }
  broadcastState(room);
  broadcastSnapshot(room, true);
}
function returnToLobby(room, reason = 'Returned to lobby') {
  if (!room || room.phase === PHASES.CLOSED) return;
  room.match = null;
  room.countdownEndsAt = 0;
  room.rematch.clear();
  resetReadiness(room);
  setPhase(room, PHASES.RETURNING_TO_LOBBY);
  room.returningEndsAt = nowMs() + RETURNING_MS;
  broadcast(room, { type: 'returning_to_lobby', reason, delayMs: RETURNING_MS });
  broadcastState(room);
}
function finishReturnToLobby(room) {
  if (!room || room.phase !== PHASES.RETURNING_TO_LOBBY) return;
  setPhase(room, PHASES.CHARACTER_SELECT);
  room.returningEndsAt = 0;
  broadcastState(room);
}

function emptyInput() { return { move: 0, jump: false, attack: false, parry: false, a1: false, a2: false, super: false, aim: 0, seq: 0 }; }
function validateInput(raw, previous) {
  const lastAim = previous && Number.isFinite(previous.aim) ? previous.aim : 0;
  const aim = normAng(num(raw && raw.aim, lastAim));
  return {
    move: clamp(num(raw && raw.move, 0), -1, 1),
    jump: !!(raw && raw.jump),
    attack: !!(raw && raw.attack),
    parry: !!(raw && raw.parry),
    a1: !!(raw && raw.a1),
    a2: !!(raw && raw.a2),
    super: !!(raw && raw.super),
    aim,
    seq: clamp(Math.floor(num(raw && raw.seq, 0)), 0, 2_147_483_647)
  };
}
function receiveInput(client, msg) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room || room.phase !== PHASES.PLAYING || !room.match) return;
  if (rateHit(client.rate.input, INPUT_RATE_LIMIT)) { client.strikes = (client.strikes || 0) + 1; if (client.strikes > 6) closeClient(client, 'input_rate_limit'); return; }
  const input = validateInput(msg.input || msg, client.input);
  if (input.seq && input.seq < (client.lastInputSeq || 0)) return;
  client.input = input;
  client.lastInputSeq = input.seq || client.lastInputSeq || 0;
  client.lastSeen = nowMs();
}

function spawnMatchPlayer(p, i, n) {
  const ch = ROSTER[safeChar(p.char)];
  let x, y, vx, vy;
  if (n === 2) {
    x = i === 0 ? ARENA.x + ARENA.w * .25 : ARENA.x + ARENA.w * .75;
    y = ARENA.y + ARENA.h * .35;
    vx = i === 0 ? 160 : -160;
    vy = -60;
  } else {
    const ang = -Math.PI / 2 + i * Math.PI * 2 / Math.max(2, n);
    x = ARENA.x + ARENA.w / 2 + Math.cos(ang) * ARENA.w * .34;
    y = ARENA.y + ARENA.h / 2 + Math.sin(ang) * ARENA.h * .32;
    vx = Math.cos(ang + Math.PI / 2) * 360;
    vy = Math.sin(ang + Math.PI / 2) * 360;
  }
  return {
    id: p.id, name: p.name, role: p.role, char: p.char, ch,
    x, y, vx, vy, r: ch.radius, hp: ch.hp, maxHp: ch.hp, super: 0,
    aim: i === 0 ? 0 : Math.PI, face: i === 0 ? 0 : Math.PI, alive: true, onGround: false,
    attackCd: .45, a1Cd: 1.0, a2Cd: 1.2, superCd: 1.0, parryCd: 0, parryTime: 0, blockTime: 0, stun: 0,
    guard: 0, slow: 0, freeze: 0, flash: 0, lastHitBy: null, hitBy: new Map()
  };
}
function initMatch(room) {
  const players = requiredPlayers(room);
  const fighters = players.map((p, i) => spawnMatchPlayer(p, i, players.length));
  room.match = {
    startedAt: nowMs(), lastTick: nowMs(), lastSnapshot: 0,
    duration: room.mode === 'ffa' ? FFA_DURATION : DUEL_DURATION,
    time: room.mode === 'ffa' ? FFA_DURATION : DUEL_DURATION,
    fighters,
    projectiles: [],
    hitboxes: [],
    zones: [],
    finisher: null,
    winner: null,
    overReason: '',
    pausedForDisconnect: false,
    disconnectUntil: 0,
    seq: 0
  };
  for (const p of players) { p.input = emptyInput(); p.lastInputSeq = 0; p.ready = true; }
}
function fighterState(f) {
  return {
    id: f.id, char: f.char, name: f.name,
    x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy),
    hp: Math.max(0, Math.round(f.hp * 10) / 10), maxHp: f.maxHp,
    super: Math.round(f.super * 10) / 10, aim: Math.round(f.aim * 100) / 100, face: Math.round(f.face * 100) / 100,
    alive: f.alive, freeze: f.freeze, slow: f.slow, guard: f.guard,
    parry: f.parryTime, block: f.blockTime, flash: f.flash,
    a1Cd: Math.round(f.a1Cd * 100) / 100, a2Cd: Math.round(f.a2Cd * 100) / 100, attackCd: Math.round(f.attackCd * 100) / 100
  };
}
function projectileState(p) {
  return { owner: p.owner, x: Math.round(p.x), y: Math.round(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), r: p.r, dmg: p.dmg, color: p.color, type: p.type, life: Math.round(p.life * 100) / 100, ang: Math.round(p.ang * 100) / 100, released: true, delay: 0, flightSpeed: Math.hypot(p.vx, p.vy), noWeaponBlock: false, pierce: !!p.pierce };
}
function hitboxState(h) {
  return { owner: h.owner, kind: h.kind, x: h.x, y: h.y, x1: h.x1, y1: h.y1, x2: h.x2, y2: h.y2, r: h.r, width: h.width, damage: h.damage, knock: h.knock, life: Math.round(h.life * 100) / 100, max: Math.round(h.max * 100) / 100, color: h.color, heavy: !!h.heavy, moveName: h.moveName, parryable: true };
}
function fillStates(src, cap, mapper) {
  const n = Math.min(src.length, cap);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = mapper(src[i]);
  return out;
}
function matchSnapshot(room, includeArena = false) {
  const m = room.match;
  if (!m) return null;
  const t = nowMs();
  const base = {
    type: 'snapshot', protocol: PROTOCOL_VERSION, room: room.code, seq: m.seq, phase: room.phase,
    mode: room.mode, serverTime: t, time: Math.round(m.time * 10) / 10,
    countdown: room.phase === PHASES.COUNTDOWN ? Math.max(0, (room.countdownEndsAt - t) / 1000) : 0,
    projectiles: fillStates(m.projectiles, 64, projectileState),
    hitboxes: fillStates(m.hitboxes, 64, hitboxState),
    zones: [],
    over: [PHASES.ROUND_OVER, PHASES.REMATCH_WAIT].includes(room.phase),
    winner: m.winner,
    winnerId: m.winner,
    finisher: m.finisher,
    disconnectPause: !!m.pausedForDisconnect,
    disconnectRemaining: m.pausedForDisconnect ? Math.max(0, m.disconnectUntil - t) : 0
  };
  if (includeArena) base.arena = ARENA;
  if (room.mode === 'duel') {
    base.p = fighterState(m.fighters[0]);
    base.c = fighterState(m.fighters[1]);
  } else {
    base.fighters = fillStates(m.fighters, MAX_ROOM_PLAYERS, fighterState);
  }
  return base;
}

function broadcastSnapshot(room, force = false) {
  if (!room.match) return;
  const t = nowMs();
  if (!force && t - room.match.lastSnapshot < 1000 / SNAPSHOT_RATE) return;
  room.match.lastSnapshot = t;
  room.match.seq++;
  const snap = matchSnapshot(room, force);
  if (snap) broadcast(room, snap);
}

function tickRoom(room, dt) {
  const t = nowMs();
  if (room.phase === PHASES.RETURNING_TO_LOBBY && room.returningEndsAt && t >= room.returningEndsAt) finishReturnToLobby(room);
  if (!room.match) return;
  if (room.phase === PHASES.COUNTDOWN) {
    if (t >= room.countdownEndsAt) { setPhase(room, PHASES.PLAYING); broadcast(room, { type: 'phase', phase: PHASES.PLAYING }); broadcastState(room); }
    broadcastSnapshot(room);
    return;
  }
  if (room.phase !== PHASES.PLAYING) { broadcastSnapshot(room); return; }
  const m = room.match;
  if (m.pausedForDisconnect) {
    const disconnected = requiredPlayers(room).filter(p => !p.connected);
    if (disconnected.length === 0) { m.pausedForDisconnect = false; m.disconnectUntil = 0; broadcast(room, { type: 'phase', phase: PHASES.PLAYING, resumed: true }); }
    else if (t >= m.disconnectUntil) {
      const connected = requiredPlayers(room).filter(p => p.connected);
      if (connected.length === 1) endMatch(room, connected[0].id, 'Opponent disconnected');
      else returnToLobby(room, 'Players disconnected');
      return;
    } else { broadcastSnapshot(room); return; }
  }
  simulate(room, dt);
  broadcastSnapshot(room);
}

function simulate(room, dt) {
  const m = room.match;
  m.time = Math.max(0, m.time - dt);
  if (m.time <= 0) { endByHP(room, 'Time up'); return; }
  for (const f of m.fighters) updateFighter(room, f, dt);
  for (let i = 0; i < m.fighters.length; i++) for (let j = i + 1; j < m.fighters.length; j++) collideFighters(m.fighters[i], m.fighters[j]);
  updateProjectiles(room, dt);
  m.hitboxes = m.hitboxes.filter(h => (h.life -= dt) > 0);
  const alive = m.fighters.filter(f => f.alive && f.hp > 0);
  if (alive.length <= 1) endMatch(room, alive[0] ? alive[0].id : bestByHP(m.fighters).id, alive.length ? 'Last ball standing' : 'Double knockout');
}
function getPlayer(room, id) { return room.players.get(id); }
function playerInput(room, f) { const p = getPlayer(room, f.id); return p && p.connected ? (p.input || emptyInput()) : emptyInput(); }
function updateFighter(room, f, dt) {
  if (!f.alive || f.hp <= 0) return;
  const input = playerInput(room, f);
  const ch = f.ch;
  f.aim = normAng(input.aim);
  f.face = f.aim;
  f.attackCd = Math.max(0, f.attackCd - dt); f.a1Cd = Math.max(0, f.a1Cd - dt); f.a2Cd = Math.max(0, f.a2Cd - dt); f.superCd = Math.max(0, f.superCd - dt); f.parryCd = Math.max(0, f.parryCd - dt);
  f.parryTime = Math.max(0, f.parryTime - dt); f.blockTime = Math.max(0, f.blockTime - dt); f.guard = Math.max(0, f.guard - dt); f.slow = Math.max(0, f.slow - dt); f.freeze = Math.max(0, f.freeze - dt); f.stun = Math.max(0, f.stun - dt); f.flash = Math.max(0, f.flash - dt);
  if (input.parry && f.parryCd <= 0) { f.parryTime = .18; f.blockTime = .32; f.parryCd = .75; }
  if (f.stun <= 0 && f.freeze <= 0) {
    const speedMul = f.slow > 0 ? .62 : 1;
    const accel = 2600 * ch.speed * speedMul;
    f.vx += input.move * accel * dt;
    const maxVx = 540 * ch.speed * speedMul;
    f.vx = clamp(f.vx, -maxVx, maxVx);
    if (input.jump && f.onGround) { f.vy = -820 * ch.jump; f.onGround = false; }
    if (input.attack && f.attackCd <= 0) doAttack(room, f);
    if (input.a1 && f.a1Cd <= 0) doAbility(room, f, 1);
    if (input.a2 && f.a2Cd <= 0) doAbility(room, f, 2);
    if (input.super && f.super >= 100 && f.superCd <= 0) doSuper(room, f);
  }
  f.vy += 1850 * dt;
  if (f.onGround && Math.abs(playerInput(room, f).move) < .1) f.vx *= Math.pow(.12, dt);
  else f.vx *= Math.pow(.78, dt);
  f.vy *= Math.pow(.995, dt);
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  if (f.x < ARENA.x + f.r) { f.x = ARENA.x + f.r; f.vx = Math.abs(f.vx) * .72; }
  if (f.x > ARENA.x + ARENA.w - f.r) { f.x = ARENA.x + ARENA.w - f.r; f.vx = -Math.abs(f.vx) * .72; }
  if (f.y < ARENA.y + f.r) { f.y = ARENA.y + f.r; f.vy = Math.abs(f.vy) * .72; }
  if (f.y > ARENA.floor - f.r) { f.y = ARENA.floor - f.r; f.vy = Math.min(0, f.vy) * -.18; f.onGround = true; }
  else f.onGround = false;
}
function doAttack(room, f) {
  const ch = f.ch;
  f.attackCd = clamp(ch.cd, .24, .95);
  const type = ch.projectile;
  if (type && ['knife', 'heart', 'glyph', 'shuriken', 'arrow'].includes(type)) {
    spawnProjectile(room, f, type, ch.dmg, 720, ch.radius * .45);
    return;
  }
  const reach = ch.reach + f.r;
  const width = ch.radius * (f.char === 'rapier' ? .5 : .85);
  const x1 = f.x + Math.cos(f.aim) * f.r * .55;
  const y1 = f.y + Math.sin(f.aim) * f.r * .55;
  const x2 = f.x + Math.cos(f.aim) * reach;
  const y2 = f.y + Math.sin(f.aim) * reach;
  room.match.hitboxes.push({ owner: f.id, kind: 'segment', x1, y1, x2, y2, width, damage: ch.dmg, knock: 430, life: .08, max: .08, color: ch.color, moveName: 'Weapon Strike' });
  for (const target of enemies(room.match, f)) if (segmentCircle(x1, y1, x2, y2, target.x, target.y, target.r + width)) applyDamage(room, f, target, ch.dmg, 430, f.aim, 'Weapon Strike');
}
function doAbility(room, f, slot) {
  const ch = f.ch;
  const cd = slot === 1 ? abilityCooldown(f.char, 0) : abilityCooldown(f.char, 1);
  if (slot === 1) f.a1Cd = cd; else f.a2Cd = cd;
  if (slot === 1) {
    if (['katana', 'mach', 'monkey', 'spear', 'lance', 'rapier', 'samurai', 'ninja', 'slayer', 'goku'].includes(f.char)) {
      f.vx += Math.cos(f.aim) * 720 * ch.speed; f.vy += Math.sin(f.aim) * 390; f.flash = .18;
      for (const target of enemies(room.match, f)) if (distSq(f.x, f.y, target.x, target.y) < Math.pow(f.r + target.r + ch.reach * .7, 2)) applyDamage(room, f, target, Math.max(6, ch.dmg * .8), 520, f.aim, 'Ability Dash');
    } else if (['stasis', 'magician'].includes(f.char)) {
      for (const target of enemies(room.match, f)) if (distSq(f.x, f.y, target.x, target.y) < 260 * 260) { target.slow = 1.25; target.freeze = Math.max(target.freeze, .12); }
    } else if (f.char === 'magia') {
      f.hp = Math.min(f.maxHp, f.hp + 12); f.super = Math.min(100, f.super + 6);
    } else {
      spawnProjectile(room, f, ch.projectile || 'glyph', ch.dmg + 2, 760, ch.radius * .6);
    }
  } else {
    if (['spear', 'lance', 'viking', 'brute', 'thunder'].includes(f.char)) { f.guard = .65; f.blockTime = .55; }
    else if (['axiom', 'warp'].includes(f.char)) spawnProjectile(room, f, f.char === 'axiom' ? 'blue' : 'purple', ch.dmg + 4, 640, 28);
    else spawnProjectile(room, f, ch.projectile || 'wind', ch.dmg + 1, 780, 18);
  }
}
function doSuper(room, f) {
  f.super = 0; f.superCd = 1.5; f.flash = .4;
  const radius = f.char === 'archer' || f.char === 'magician' ? 360 : 260;
  const dmg = 24 + f.ch.dmg * .8;
  for (const target of enemies(room.match, f)) {
    const d = Math.sqrt(distSq(f.x, f.y, target.x, target.y));
    if (d <= radius) applyDamage(room, f, target, dmg * (1 - d / (radius * 1.8)), 900, Math.atan2(target.y - f.y, target.x - f.x), f.ch.name + ' Super');
  }
  room.match.hitboxes.push({ owner: f.id, kind: 'circle', x: f.x, y: f.y, r: radius, width: radius, damage: dmg, knock: 900, life: .22, max: .22, color: f.ch.color, heavy: true, moveName: f.ch.name + ' Super' });
}
function abilityCooldown(id, slot) {
  const table = {
    stasis:[5.0,3.1], monkey:[3.2,4.2], magia:[5.5,5.2], sword:[5.2,3.6], spear:[2.6,5.0], katana:[3.0,6.0], mach:[3.2,4.1], axiom:[5.0,5.0], samurai:[3.2,7.0], lance:[2.8,4.3], unarmed:[5.0,1.0], rapier:[3.2,3.8],
    goku:[5.0,10.5], thunder:[5.2,5.4], ninja:[5.0,2.2], brute:[6.2,7.4], magician:[4.7,4.8], viking:[4.6,5.8], warp:[4.2,5.0], archer:[3.9,5.7], ai:[3.8,5.2], slayer:[4.2,5.0]
  };
  const row = table[id] || [4.5, 5.0];
  return row[slot] || 4.5;
}
function spawnProjectile(room, f, type, dmg, speed, r) {
  const x = f.x + Math.cos(f.aim) * (f.r + 18);
  const y = f.y + Math.sin(f.aim) * (f.r + 18);
  const spread = type === 'shuriken' ? [-.12, 0, .12] : [0];
  for (const s of spread) {
    const a = f.aim + s;
    room.match.projectiles.push({ owner: f.id, type, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: r || 14, dmg, color: f.ch.color, life: type === 'lightning' ? .32 : 2.4, ang: a, pierce: type === 'purple' });
  }
}
function updateProjectiles(room, dt) {
  const m = room.match;
  for (const p of m.projectiles) {
    p.life -= dt;
    if (p.type === 'lightning') { p.vy += 650 * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.x < ARENA.x - 160 || p.x > ARENA.x + ARENA.w + 160 || p.y < ARENA.y - 160 || p.y > ARENA.floor + 160) p.life = 0;
    const owner = m.fighters.find(f => f.id === p.owner);
    if (!owner) continue;
    for (const target of enemies(m, owner)) {
      if (!target.alive || p.life <= 0) continue;
      if (distSq(p.x, p.y, target.x, target.y) <= Math.pow(p.r + target.r, 2)) {
        applyDamage(room, owner, target, p.dmg, projectileKnock(p.type), Math.atan2(p.vy, p.vx), projectileMove(typeName(p.type)));
        if (!p.pierce) p.life = 0;
      }
    }
  }
  m.projectiles = m.projectiles.filter(p => p.life > 0).slice(-100);
}
function typeName(t) { return t || 'projectile'; }
function projectileMove(type) { return ({ knife:'Knife Volley', heart:'Heart Shot', glyph:'Glyph Bolt', shuriken:'Shuriken', arrow:'Arrow Shot', red:'Red Push', blue:'Blue Pull', purple:'Hollow Purple', kame:'Kamehameha', lightning:'Lightning Strike', wind:'Wind Cut' })[type] || 'Projectile'; }
function projectileKnock(type) { return ({ purple: 1100, red: 950, blue: -820, kame: 980, lightning: 680, arrow: 420, shuriken: 360, heart: 340, glyph: 540, knife: 360 })[type] || 420; }
function applyDamage(room, att, def, amount, knock, angle, move) {
  if (!att || !def || !def.alive || amount <= 0) return;
  let dmg = amount;
  if (def.parryTime > 0) { dmg *= .15; knock *= -.35; def.super = Math.min(100, def.super + 18); att.stun = Math.max(att.stun, .18); }
  else if (def.blockTime > 0 || def.guard > 0) { dmg *= .38; knock *= .38; def.super = Math.min(100, def.super + 8); }
  const hpBefore = def.hp;
  def.hp = Math.max(0, def.hp - dmg);
  def.vx += Math.cos(angle) * knock;
  def.vy += Math.sin(angle) * knock - 80;
  def.flash = .15;
  def.lastHitBy = att.id;
  att.super = Math.min(100, att.super + dmg * 1.35);
  if (def.hp <= 0 && hpBefore > 0) {
    def.alive = false;
    room.match.finisher = {
      attacker: resultData(att), defender: resultData(def), move: move || 'Final Strike', damage: Math.ceil(dmg), hpBefore: Math.ceil(hpBefore), hpAfter: 0,
      heavy: dmg >= 20, kind: 'server-hit', cause: 'Knockout', x: Math.round(def.x), y: Math.round(def.y), color: att.ch.color, t: nowMs()
    };
  }
}
function resultData(f) { return { id: f.id, name: f.name, char: f.ch.name, charId: f.char, color: f.ch.color, color2: f.ch.color2, hp: Math.ceil(Math.max(0, f.hp)), maxHp: f.maxHp, initial: (f.name || '?')[0].toUpperCase() }; }
function enemies(m, f) { return m.fighters.filter(o => o !== f && o.alive && o.hp > 0); }
function distSq(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function segmentCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((cx - x1) * dx + (cy - y1) * dy) / l2, 0, 1);
  const px = x1 + dx * t, py = y1 + dy * t;
  return distSq(px, py, cx, cy) <= r * r;
}
function collideFighters(a, b) {
  if (!a.alive || !b.alive) return;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy) || 1;
  const min = a.r + b.r;
  if (d >= min) return;
  const nx = dx / d, ny = dy / d;
  const push = (min - d) * .5;
  a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const rel = rvx * nx + rvy * ny;
  if (rel < 0) {
    const imp = -rel * .56;
    a.vx -= nx * imp; a.vy -= ny * imp; b.vx += nx * imp; b.vy += ny * imp;
  }
}
function bestByHP(fighters) { return fighters.reduce((best, f) => !best || f.hp > best.hp ? f : best, null); }
function endByHP(room, reason) { const best = bestByHP(room.match.fighters); endMatch(room, best ? best.id : null, reason); }
function endMatch(room, winnerId, reason) {
  if (!room.match || [PHASES.ROUND_OVER, PHASES.REMATCH_WAIT].includes(room.phase)) return;
  room.match.winner = winnerId;
  room.match.overReason = reason;
  setPhase(room, PHASES.ROUND_OVER);
  resetReadiness(room);
  room.rematch.clear();
  broadcastSnapshot(room, true);
  broadcast(room, { type: 'round_over', winnerId, reason, snapshot: matchSnapshot(room) });
  broadcastState(room);
}
function requestRematch(client) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room || ![PHASES.ROUND_OVER, PHASES.REMATCH_WAIT].includes(room.phase)) { error(client, 'phase_locked', 'Rematch is only available after the round.'); return; }
  if (!requiredPlayers(room).some(p => p.id === client.id)) return;
  if (requiredPlayers(room).length < minPlayersFor(room.mode)) { error(client, 'not_enough_players', 'Waiting for another player before rematch.'); return; }
  room.rematch.add(client.id);
  setPhase(room, PHASES.REMATCH_WAIT);
  broadcast(room, { type: 'rematch_wait', requestedBy: client.id, accepted: [...room.rematch], needed: requiredPlayers(room).map(p => p.id) });
  broadcastState(room);
  if (requiredPlayers(room).every(p => room.rematch.has(p.id) && p.connected)) beginCountdown(room);
}
function requestReturnLobby(client) {
  const room = client.room ? rooms.get(client.room) : null;
  if (!room) return;
  if ([PHASES.ROUND_OVER, PHASES.REMATCH_WAIT, PHASES.COUNTDOWN, PHASES.PLAYING].includes(room.phase)) returnToLobby(room, `${client.name} returned to lobby`);
  else { resetReadiness(room); setPhase(room, PHASES.CHARACTER_SELECT); broadcastState(room); }
}

function handleClientMessage(client, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (rateHit(client.rate.msg, MESSAGE_RATE_LIMIT)) { closeClient(client, 'message_rate_limit'); return; }
  const type = String(msg.type || '').slice(0, 40);
  if (type !== 'ping' && type !== 'pong' && type !== 'reconnect' && type !== 'join' && type !== 'create_room' && Number(msg.protocol || PROTOCOL_VERSION) !== PROTOCOL_VERSION) {
    error(client, 'old_version', `Client/server protocol mismatch. Refresh the page. Server protocol ${PROTOCOL_VERSION}.`);
    return;
  }
  if (type === 'ping') { send(client, { type: 'pong', t: msg.t || nowMs(), serverTime: nowMs(), protocol: PROTOCOL_VERSION }); return; }
  if (type === 'create_room') { createRoomForClient(client, msg); return; }
  if (type === 'join_room') { joinExistingForClient(client, msg); return; }
  if (type === 'reconnect') { reconnectClient(client, msg); return; }
  // Legacy `join` behavior: if a room code exists, join it; otherwise create a server-generated room.
  if (type === 'join') {
    const code = safeRoom(msg.room);
    if (code && rooms.has(code)) joinExistingForClient(client, msg);
    else if (code && msg.mode === 'join') joinExistingForClient(client, msg);
    else createRoomForClient(client, msg);
    return;
  }
  if (!client.room) { error(client, 'not_in_room', 'Join or create a room first.'); return; }
  if (type === 'leave') { leaveRoom(client); return; }
  if (type === 'set_mode') { setMode(client, msg); return; }
  if (type === 'set_char') { setChar(client, msg); return; }
  if (type === 'ready') { setReady(client, msg); return; }
  if (type === 'input') { receiveInput(client, msg); return; }
  if (type === 'rematch_request') { requestRematch(client); return; }
  if (type === 'return_lobby') { requestReturnLobby(client); return; }
  // Security: never accept client-authoritative state, HP, damage, cooldowns, or winners.
  if (['state', 'damage', 'winner', 'hp', 'cooldown'].includes(type)) { error(client, 'ignored_untrusted_state', 'Client-authoritative gameplay state is not accepted.'); return; }
}

const server = http.createServer((req, res) => {
  const cleanUrl = String(req.url || '/').split('?')[0];
  if (cleanUrl === '/' || cleanUrl === '/index.html' || cleanUrl === '/ball_clash_arena_v10.html') {
    fs.readFile(ROOT_HTML, (err, data) => {
      if (err) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('index.html missing.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(data);
    });
    return;
  }
  if (cleanUrl === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, protocol: PROTOCOL_VERSION, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + activePlayers(r).length, 0), phases: [...rooms.values()].reduce((acc, r) => { acc[r.phase] = (acc[r.phase] || 0) + 1; return acc; }, {}) }));
    return;
  }
  if (cleanUrl === '/version') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ name: 'Ball Clash Arena', protocol: PROTOCOL_VERSION, arena: ARENA }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.on('upgrade', (req, sock) => {
  if (!String(req.url || '').startsWith('/ws')) { sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const client = {
    sock,
    id: randomId(6), token: randomId(16), room: null, role: null,
    name: 'Player', char: 'stasis', ready: false, connected: true, left: false,
    buffer: Buffer.alloc(0), rate: { msg: {}, input: {} }, input: emptyInput(), lastSeen: nowMs(), ip: req.socket.remoteAddress
  };
  clients.add(client);
  sock.on('data', buf => {
    if (buf.length > MAX_FRAME) { closeClient(client, 'frame_too_large'); return; }
    client.buffer = Buffer.concat([client.buffer, buf]);
    if (client.buffer.length > MAX_FRAME) { closeClient(client, 'frame_too_large'); return; }
    const parsed = parseFrames(client.buffer);
    client.buffer = parsed.rest;
    for (const f of parsed.messages) {
      if (f.close) { try { sock.end(); } catch (_) {} continue; }
      if (f.ping) { sendFrame(sock, { type: 'pong', serverTime: nowMs(), protocol: PROTOCOL_VERSION }); continue; }
      let msg;
      try { msg = JSON.parse(f.text); } catch (_) { error(client, 'malformed_json', 'Malformed message ignored.'); continue; }
      handleClientMessage(client, msg);
    }
  });
  sock.on('close', () => { client.connected = false; clients.delete(client); markDisconnected(client); });
  sock.on('error', () => { client.connected = false; clients.delete(client); markDisconnected(client); });
});

setInterval(() => {
  const t = nowMs();
  for (const [code, room] of rooms) {
    if (room.phase === PHASES.CLOSED) { rooms.delete(code); continue; }
    for (const p of roomPlayers(room)) {
      if (!p.connected && p.disconnectedAt && t - p.disconnectedAt > DISCONNECT_GRACE_MS && ![PHASES.COUNTDOWN, PHASES.PLAYING].includes(room.phase)) {
        room.players.delete(p.id);
        room.order = room.order.filter(id => id !== p.id);
      }
    }
    assignRoles(room);
    if (room.players.size === 0 || t - room.touchedAt > ROOM_TTL_MS) closeRoom(room, room.players.size === 0 ? 'empty' : 'stale');
  }
}, 60_000).unref();

let lastTick = nowMs();
setInterval(() => {
  const t = nowMs();
  const dt = clamp((t - lastTick) / 1000, 0, 1 / 20);
  lastTick = t;
  for (const room of rooms.values()) tickRoom(room, dt || (1 / TICK_RATE));
}, 1000 / TICK_RATE).unref();

server.listen(PORT, () => console.log(`Ball Clash Arena running on http://localhost:${PORT} (protocol ${PROTOCOL_VERSION})`));

module.exports = { server, rooms, PROTOCOL_VERSION, ARENA, PHASES, _test: { endMatch, returnToLobby, requestRematch } };
