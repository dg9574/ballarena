# Ball Clash Arena

Upload this folder to a GitHub repository, then deploy it on Render as a Node Web Service.

## Files

- `index.html` - the game client
- `ball_clash_arena_v10.html` - same game file kept with the project version name
- `server.js` - tiny no-dependency Node.js HTTP + WebSocket room server
- `package.json` - Render/Node start script
- `render.yaml` - optional Render Blueprint using the Frankfurt region

## Local test

```bash
node server.js
```

Open:

```text
http://localhost:8080
```

Online rooms use:

```text
ws://localhost:8080/ws
```

## Render deploy

1. Push this folder to GitHub.
2. On Render, create a new Web Service from the repo.
3. Region: Frankfurt.
4. Build command: leave empty.
5. Start command: `node server.js`.
6. Open the Render URL.

The game auto-fills the server field to:

```text
wss://YOUR-RENDER-APP.onrender.com/ws
```

Use the same room code with your friend.
