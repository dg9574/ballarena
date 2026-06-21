# Ball Clash Arena

Ball Clash Arena is a browser-based physics arena fighter. Players control weaponized balls that bounce through a neon arena, clash weapons, parry/block, use character abilities, and charge cinematic supers.

This release is designed to be dropped into a GitHub repository and deployed on Render as a small/free Node web service. It uses one HTML5 Canvas client and a zero-dependency Node WebSocket room server.

## File structure

```text
ball-clash-arena-render/
├── index.html                  # Main game client, UI, Canvas renderer, gameplay logic
├── ball_clash_arena_v10.html   # Mirror of index.html for direct/local testing
├── server.js                   # Node HTTP + WebSocket room server, no npm packages
├── package.json                # Node metadata and start script
├── render.yaml                 # Render web service config
├── README.md                   # Setup/deploy/play guide
├── CHANGELOG.md                # Release notes
└── .gitignore
```

## Run locally

Requires Node 18 or newer.

```bash
npm start
```

Then open:

```text
http://localhost:8080
```

Health check:

```text
http://localhost:8080/health
```

## Deploy on Render

Create a **Web Service** from your GitHub repository.

Recommended settings:

```text
Environment: Node
Region: Frankfurt, Germany for Europe-to-Europe latency
Build command: leave blank or use npm install
Start command: node server.js
Plan: Free or small paid plan
```

The included `render.yaml` uses:

```yaml
startCommand: "node server.js"
```

No paid database, Redis instance, external asset host, or native dependency is required.

## How to invite friends

1. Open the deployed Render URL.
2. Choose **Multiplayer**.
3. Enter a username.
4. Choose **Duel 1v1** or **Free For All 2-6 players**.
5. Click **Create Room**.
6. Copy the invitation link from the lobby and send it to friends.
7. Everyone picks a fighter and clicks **Ready**.

Invite links include the room code and mode, for example `?room=ABC123&mode=ffa`. The lobby also accepts pasted invite links.

## Multiplayer room model

- The Node server owns room membership, ready state, mode selection, host assignment, disconnect handling, and ping/pong.
- The first player in the room is the host.
- The host simulates the match and sends compact state snapshots.
- Other players send inputs to the host through the server.
- This host-authoritative model is intentionally simple and Render-free friendly.
- Duel rooms allow exactly 2 players.
- FFA rooms allow 2 to 6 players.
- If a player leaves, the room returns to lobby-safe state and ready flags reset.

For best multiplayer feel, use the same Render region as the players. For Europe-to-Europe testing, Frankfurt is the intended region.

## Controls

Desktop:

```text
Move: A/D or Left/Right arrows
Jump / bounce redirect: W, Space, or Up arrow
Aim: mouse
Attack: left mouse button
Parry / block: right mouse button or Shift
Q ability: Q
E ability: E
Super: R
Pause: Esc
```

Mobile:

```text
Left stick: movement
Right pad: aim
Buttons: Jump, Attack, Parry, Q, E, R
```

## Current game modes

- **Single Player**: character select, optional opponent select/random, CPU opponent.
- **Multiplayer 1v1**: two-player host-authoritative duel.
- **Multiplayer FFA**: 2 to 6 players, spawned around the arena, with names and health shown.

## Public-test notes

This build includes the release-ready UI flow, tutorial, settings, richer character selection, host-authoritative rooms, ping display, invite link support, disconnect recovery, capped VFX arrays, delayed speed ramp, improved parry/block/clash readability, and character rework tuning.

UI notes for this release:

- Character Select is now a full-screen, opaque arcade interface with independent roster/details scrolling, responsive fighter cards, selected/opponent states, and no accidental canvas bleed-through.
- Single Player and Multiplayer use the same fighter-card visual language for names, avatars, weapon/difficulty chips, playstyle, and Q/E/R move chips.
- Menus, Tutorial, Settings, Credits/Controls, lobby panels, buttons, inputs, and status pills share a dark glass/neon design system.
- In-game HP bars use high-contrast green/yellow/red remaining-health gradients with clear HP numbers.
- Camera shake defaults to 25% and is labeled as conservative in Settings; VFX, ping, sound, and touch controls remain configurable.

Known limitations:

- The multiplayer model prioritizes small friend-group matches over massive scaling.
- Host advantage can exist because the host simulates the game.
- Free Render instances may sleep when idle; the first visitor after sleep can experience a cold start.
- No persistent accounts, matchmaking queue, leaderboard, or server-side anti-cheat is included.

## Cinematic Finish Screen

The end-of-match flow now records the hit that reduces a fighter to zero HP and presents it in a full-screen animated victory/defeat scene. The result screen shows the finisher, eliminated fighter, move/source, damage, and final HP swing. Time-limit results fall back to a clear decision screen when no killing hit exists.


## Character Balance Update

This build adds two new fighters and updates several existing kits:

- **Magician**: rune/letter/root caster with Rune Root, Letter Blast, glyph projectiles, and a full-screen **Grand Rune Cataclysm** ultimate effect.
- **Viking**: shield-and-axe bruiser with visible shield + axe, Shield Rush knockback/bounce pressure, Axe Smack, and **Valhalla Rebirth**. Viking has no normal manual R attack; when super is fully charged, lethal damage automatically revives him at half HP.
- **Axiom**: Red, Blue, and Purple abilities are now dodge-checks that cannot be blocked, parried, or swatted by weapons.
- **Unarmed**: E is now a true passive growth effect rather than an activated ability.
- **Brute**: Berserk lifesteal is stronger, and E now locks into an actual axe spin that ignores mouse aim changes until the spin finishes.

## Warp / Archer and Death Sequence Update

This build expands the roster and changes match endings so the final hit remains visible in the arena before the cinematic result screen appears.

- **Lance nerf**: Lance keeps his long poke identity, but the Q + E shield/dash loop has reduced damage, knockback, shield uptime, dash speed, and reach so it no longer deletes opponents by repeatedly running into them.
- **Death breakdown**: lethal hits now trigger an in-arena KO breakdown first. The defeated ball shatters, falls, splats on the floor, stops bouncing, and only then transitions into the animated victory/defeat screen.
- **Warp**: portal trickster with double-cast Twin Portals that either fighter can use, a blue water-like Drift Blast, and a close-range Portal Loop super that throws the enemy through two facing portals for several seconds of cinematic damage.
- **Archer**: ranged sharpshooter whose basic attack fires arrows. Q is a mouse-aimed grappling hook, E fires an explosive arrow, and R launches a barrage of arrows.

