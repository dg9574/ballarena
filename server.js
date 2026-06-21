/*
Ball Clash Arena release server.
- Serves index.html and health endpoint
- Zero-dependency WebSocket rooms for Render free/small instances
- Host-authoritative relay for 1v1 and FFA small-room multiplayer
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const ROOT_HTML = path.join(__dirname, 'index.html');
const rooms = new Map();
const MAX_FRAME = 64 * 1024;
const ROOM_TTL_MS = 1000 * 60 * 60 * 3;

function sendFrame(sock, obj) {
  if (!sock || sock.destroyed) return;
  const data = Buffer.from(JSON.stringify(obj));
  let header;
  if (data.length < 126) {
    header = Buffer.from([0x81, data.length]);
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  try { sock.write(Buffer.concat([header, data])); } catch (_) {}
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

function safeRoom(room) {
  return String(room || 'ARENA').toUpperCase().slice(0, 24).replace(/[^A-Z0-9_-]/g, '') || 'ARENA';
}
function safeName(name) {
  return String(name || 'Player').trim().slice(0, 18).replace(/[<>]/g, '') || 'Player';
}
function safeChar(char) {
  return String(char || 'stasis').slice(0, 32).replace(/[^a-z0-9_-]/gi, '') || 'stasis';
}
function safeMode(mode) {
  return String(mode || 'duel').toLowerCase() === 'ffa' ? 'ffa' : 'duel';
}
function roleForIndex(i) { return i === 0 ? 'host' : `p${i + 1}`; }
function getRoom(code) {
  code = safeRoom(code);
  let room = rooms.get(code);
  if (!room) {
    room = { code, clients: [], createdAt: Date.now(), touchedAt: Date.now(), started: false, mode: 'duel', seq: 0 };
    rooms.set(code, room);
  }
  room.touchedAt = Date.now();
  return room;
}
function roomState(room) {
  return {
    type: 'room_state',
    room: room.code,
    mode: room.mode || 'duel',
    started: !!room.started,
    maxPlayers: room.mode === 'ffa' ? 6 : 2,
    hostId: room.clients[0] ? room.clients[0].id : null,
    players: room.clients.map(c => ({ id: c.id, role: c.role, name: c.name, char: c.char, ready: !!c.ready }))
  };
}
function broadcast(room, obj, except = null) {
  room.touchedAt = Date.now();
  for (const c of room.clients) if (c !== except) sendFrame(c.sock, obj);
}
function broadcastState(room) { broadcast(room, roomState(room)); }

function maybeStart(room) {
  if (room.started) return;
  const mode = room.mode || 'duel';
  const minPlayers = 2;
  const maxPlayers = mode === 'ffa' ? 6 : 2;
  if (room.clients.length < minPlayers) return;
  if (room.clients.length > maxPlayers) return;
  if (mode === 'duel' && room.clients.length !== 2) return;
  if (!room.clients.every(c => c.ready)) return;
  room.started = true;
  room.seq++;
  const players = room.clients.map(c => ({ id: c.id, role: c.role, name: c.name, char: c.char, ready: !!c.ready }));
  if (mode === 'duel') {
    const [host, guest] = room.clients;
    sendFrame(host.sock, { type: 'start', mode: 'duel', role: 'host', id: host.id, seq: room.seq, hostChar: host.char, guestChar: guest.char, players });
    sendFrame(guest.sock, { type: 'start', mode: 'duel', role: 'guest', id: guest.id, seq: room.seq, hostChar: host.char, guestChar: guest.char, players });
  } else {
    for (const c of room.clients) sendFrame(c.sock, { type: 'start', mode: 'ffa', role: c.role, id: c.id, seq: room.seq, players });
  }
}

function removeClient(client, silent = false) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (!room) return;
  const idx = room.clients.indexOf(client);
  if (idx >= 0) room.clients.splice(idx, 1);
  if (!silent) broadcast(room, { type: 'peer_left', id: client.id, name: client.name });
  room.started = false;
  for (let i = 0; i < room.clients.length; i++) {
    const c = room.clients[i];
    c.ready = false;
    c.role = roleForIndex(i);
  }
  if (room.clients.length === 0) rooms.delete(room.code);
  else broadcastState(room);
  client.room = null;
}

function joinRoom(client, msg) {
  if (client.room) removeClient(client, true);
  const room = getRoom(msg.room);
  const requestedMode = safeMode(msg.mode);
  if (room.clients.length === 0) room.mode = requestedMode;
  if (room.started) { sendFrame(client.sock, { type: 'error', message: 'Match already started. Create another room or wait for the lobby.' }); return; }
  const maxPlayers = room.mode === 'ffa' ? 6 : 2;
  if (room.clients.length >= maxPlayers) { sendFrame(client.sock, { type: 'full', maxPlayers, mode: room.mode }); return; }
  client.room = room.code;
  client.name = safeName(msg.name);
  client.char = safeChar(msg.char);
  client.ready = false;
  client.role = roleForIndex(room.clients.length);
  room.clients.push(client);
  sendFrame(client.sock, { type: 'role', role: client.role, id: client.id, room: room.code, mode: room.mode, maxPlayers });
  broadcastState(room);
}

function relay(client, msg) {
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (!room) return;
  room.touchedAt = Date.now();
  const host = room.clients[0];
  if (msg.type === 'state' && client !== host) return;
  broadcast(room, { ...msg, from: client.id }, client);
}

function handleClientMessage(client, msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.type === 'ping') { sendFrame(client.sock, { type: 'pong', t: msg.t || Date.now(), serverTime: Date.now() }); return; }
  if (msg.type === 'join') { joinRoom(client, msg); return; }
  if (msg.type === 'leave') { removeClient(client); return; }
  if (!client.room) return;
  const room = rooms.get(client.room);
  if (!room) return;
  if (msg.type === 'set_mode') {
    if (room.clients[0] === client && !room.started) {
      room.mode = safeMode(msg.mode);
      const max = room.mode === 'ffa' ? 6 : 2;
      room.clients = room.clients.slice(0, max);
      for (let i = 0; i < room.clients.length; i++) { room.clients[i].role = roleForIndex(i); room.clients[i].ready = false; }
      broadcastState(room);
    }
    return;
  }
  if (msg.type === 'set_char') {
    if (room.started) return;
    client.char = safeChar(msg.char);
    client.ready = false;
    broadcastState(room);
    return;
  }
  if (msg.type === 'ready') {
    if (room.started) return;
    client.char = safeChar(msg.char || client.char);
    client.ready = !!msg.ready;
    broadcastState(room);
    maybeStart(room);
    return;
  }
  if (msg.type === 'input' || msg.type === 'state') relay(client, msg);
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.clients.length, 0) }));
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
  const client = { sock, id: crypto.randomBytes(4).toString('hex'), room: null, role: null, name: 'Player', char: 'stasis', ready: false, buffer: Buffer.alloc(0) };
  sock.on('data', buf => {
    client.buffer = Buffer.concat([client.buffer, buf]);
    const parsed = parseFrames(client.buffer);
    client.buffer = parsed.rest;
    for (const f of parsed.messages) {
      if (f.close) { sock.end(); continue; }
      if (f.ping) { sendFrame(sock, { type: 'pong', serverTime: Date.now() }); continue; }
      let msg;
      try { msg = JSON.parse(f.text); } catch (_) { continue; }
      handleClientMessage(client, msg);
    }
  });
  sock.on('close', () => removeClient(client));
  sock.on('error', () => removeClient(client));
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    room.clients = room.clients.filter(c => c.sock && !c.sock.destroyed);
    if (room.clients.length === 0 || now - room.touchedAt > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60_000).unref();

server.listen(PORT, () => console.log(`Ball Clash Arena running on http://localhost:${PORT}`));
