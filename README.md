# Ball Clash Arena

Single-file HTML5 game packaged with a tiny built-in Node.js WebSocket lobby server for Render/GitHub deployment.

## Files

- `index.html` — game client, single-player, and multiplayer lobby UI
- `ball_clash_arena_v10.html` — same game file kept for version backup
- `server.js` — no-dependency Node.js HTTP/WebSocket room server
- `package.json` — Render/Node start script
- `render.yaml` — Render blueprint using the Frankfurt region

## Local test

```bash
node server.js
```

Open:

```text
http://localhost:8080
```

## Render deploy

1. Upload this folder to a GitHub repo.
2. Create a Render Web Service from the repo.
3. Use Node environment.
4. Region: Frankfurt.
5. Start command:

```bash
node server.js
```

The game page will be available at your Render URL.

## Multiplayer flow

1. Open Multiplayer Lobby.
2. Enter username.
3. Create or join a room code.
4. Copy invite link and send it to your friend.
5. Both players choose fighters and press Ready.
6. Match starts when both players are ready.

The invite link includes `?room=ROOMCODE`, so opening it auto-fills the room and opens the multiplayer lobby.
