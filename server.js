/*
Ball Clash Arena hosted room server.
- Serves index.html
- Provides /ws WebSocket room relay
- No external npm packages required
*/
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const ROOT_HTML = path.join(__dirname, 'index.html');
const rooms = new Map();

function sendFrame(sock, obj){
  if(sock.destroyed) return;
  const data = Buffer.from(JSON.stringify(obj));
  let header;
  if(data.length < 126){
    header = Buffer.from([0x81, data.length]);
  } else if(data.length < 65536){
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  sock.write(Buffer.concat([header, data]));
}

function decodeFrames(buffer){
  const messages = [];
  let offset = 0;
  while(offset + 2 <= buffer.length){
    const b1 = buffer[offset++];
    const b2 = buffer[offset++];
    const opcode = b1 & 0x0f;
    let len = b2 & 0x7f;
    const masked = !!(b2 & 0x80);
    if(len === 126){
      if(offset + 2 > buffer.length) break;
      len = buffer.readUInt16BE(offset); offset += 2;
    } else if(len === 127){
      if(offset + 8 > buffer.length) break;
      len = Number(buffer.readBigUInt64BE(offset)); offset += 8;
    }
    let mask = null;
    if(masked){
      if(offset + 4 > buffer.length) break;
      mask = buffer.subarray(offset, offset + 4); offset += 4;
    }
    if(offset + len > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(offset, offset + len));
    offset += len;
    if(mask){
      for(let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    }
    if(opcode === 0x8) messages.push({ close: true });
    if(opcode === 0x1) messages.push({ text: payload.toString('utf8') });
  }
  return messages;
}

function safeRoom(room){
  return String(room || 'arena').slice(0, 24).replace(/[^a-z0-9_-]/gi, '') || 'arena';
}

function removeClient(client){
  if(!client.room) return;
  const list = rooms.get(client.room);
  if(!list) return;
  const idx = list.indexOf(client);
  if(idx >= 0) list.splice(idx, 1);
  for(const c of list) sendFrame(c.sock, { type: 'peer_left' });
  if(list.length === 0) rooms.delete(client.room);
  client.room = null;
}

function joinRoom(client, room, char){
  room = safeRoom(room);
  let list = rooms.get(room);
  if(!list){ list = []; rooms.set(room, list); }
  if(list.length >= 2){
    sendFrame(client.sock, { type: 'full' });
    return;
  }
  client.room = room;
  client.char = char || 'stasis';
  client.role = list.length === 0 ? 'host' : 'guest';
  list.push(client);
  sendFrame(client.sock, { type: 'role', role: client.role, room });
  if(list.length === 2){
    const host = list.find(c => c.role === 'host');
    const guest = list.find(c => c.role === 'guest');
    sendFrame(host.sock, { type: 'start', role: 'host', hostChar: host.char, guestChar: guest.char });
    sendFrame(guest.sock, { type: 'start', role: 'guest', hostChar: host.char, guestChar: guest.char });
  }
}

function relay(client, msg){
  if(!client.room) return;
  const list = rooms.get(client.room);
  if(!list) return;
  for(const c of list){
    if(c !== client) sendFrame(c.sock, msg);
  }
}

const server = http.createServer((req, res) => {
  if(req.url === '/' || req.url === '/index.html' || req.url === '/ball_clash_arena_v10.html'){
    fs.readFile(ROOT_HTML, (err, data) => {
      if(err){
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('index.html missing.');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
    return;
  }
  if(req.url === '/health'){
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.on('upgrade', (req, sock) => {
  if(!req.url.startsWith('/ws')){ sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  if(!key){ sock.destroy(); return; }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  const client = { sock, room: null, role: null, char: 'stasis' };
  sock.on('data', buf => {
    for(const f of decodeFrames(buf)){
      if(f.close){ sock.end(); continue; }
      let msg;
      try { msg = JSON.parse(f.text); } catch { continue; }
      if(msg.type === 'join') joinRoom(client, msg.room, msg.char);
      else if(msg.type === 'input' || msg.type === 'state' || msg.type === 'ping') relay(client, msg);
    }
  });
  sock.on('close', () => removeClient(client));
  sock.on('error', () => removeClient(client));
});

server.listen(PORT, () => {
  console.log(`Ball Clash Arena running on http://localhost:${PORT}`);
});
