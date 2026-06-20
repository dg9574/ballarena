# Ball Clash Arena

Deploy this folder to Render as a Node Web Service.

## Files
- `index.html` - game client and UI
- `ball_clash_arena_v10.html` - same game file, kept for local opening/testing
- `server.js` - no-dependency Node.js WebSocket room server
- `package.json` / `render.yaml` - Render deployment metadata

## Render
Start command:

```bash
node server.js
```

Use Frankfurt region for lower EU ping.

## Multiplayer
- Create or join a room.
- Choose mode: Duel 1v1 or Free For All 2-6 players.
- Share the invite link or room code.
- Everyone chooses a fighter and presses Ready.

FFA is host-authoritative: the first player in the room simulates the match and other players send inputs to the host through the server.
