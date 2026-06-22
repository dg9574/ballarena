# Ball Clash Arena

Ball Clash Arena is a browser-based physics arena fighter. Players control weaponized balls in a neon arena, clash weapons, parry/block, use character abilities, and charge supers.

This project is deployable as a GitHub + Render Node web service. It uses a single HTML5 Canvas client and a zero-dependency Node HTTP/WebSocket server.

## Release status

This build moves online multiplayer from host-authoritative relay to server-authoritative public-test netcode. The server now owns room lifecycle, match phases, canonical arena coordinates, match simulation, HP, cooldowns, projectiles, hit validation, winner selection, rematch state, reconnect windows, and cleanup. Clients send inputs/intents only and render server snapshots.

This performance update adds pooled effects, quality tiers, adaptive performance scaling, reduced DOM churn, optimized Canvas draw paths, lower network snapshot overhead, and developer profiling tools while preserving the roster, abilities, supers, UI identity, single-player, and multiplayer.

Single-player remains local in the browser and keeps the existing roster, UI, CPU play, particles, abilities, supers, and settings.

## File structure

```text
ball-clash-arena/
├── index.html                  # Main game client, UI, Canvas renderer, local single-player
├── ball_clash_arena_v10.html   # Mirror of index.html for direct/local testing
├── server.js                   # Node HTTP + authoritative WebSocket multiplayer server
├── package.json                # Node metadata and start script
├── render.yaml                 # Render web service config
├── .gitignore                  # Local/dev files excluded from Git
├── README.md                   # Setup, architecture, deployment, controls, security notes
├── PERFORMANCE_REPORT.md       # Performance audit, before/after proxy metrics, test notes
└── CHANGELOG.md                # Release notes
```

## Run locally

Requires Node 18 or newer.

```bash
npm start
```

Open:

```text
http://localhost:8080
```

Health check:

```text
http://localhost:8080/health
```

Version endpoint:

```text
http://localhost:8080/version
```

## Deploy on Render

Create a Render **Web Service** from your GitHub repository.

Recommended settings:

```text
Environment: Node
Build command: npm install
Start command: npm start
Region: choose the region closest to players
Plan: Free for testing, paid/small instance for better cold-start behavior
```

The included `render.yaml` starts the service with:

```yaml
startCommand: "node server.js"
```

No paid database, Redis instance, native dependency, or external asset host is required.

## Multiplayer architecture

### Protocol

- WebSocket endpoint: `/ws`
- Current protocol version: `2`
- Clients must include `protocol: 2` in gameplay messages.
- Old/malformed messages are rejected safely and do not mutate room or match state.

### Room and match state machine

Rooms use explicit phases:

```text
lobby
character_select
countdown
playing
round_over
rematch_wait
returning_to_lobby
closed
```

Rules enforced by the server:

- A room has only one active match state at a time.
- Duel rooms require exactly 2 players.
- FFA rooms support 2 to 6 players.
- The host can change mode only before the match starts.
- Non-hosts cannot force mode changes or starts.
- Match start requires valid connected players and everyone ready.
- Rematch requires consent from all required players.
- One rematch request shows a clear waiting state.
- Return to lobby clears match state, timers, projectiles, hitboxes, cooldowns, ready flags, and rematch flags.
- Empty and stale rooms are deleted.

### Server authority

The server owns all trust-sensitive multiplayer state:

- room code, host, roster, readiness, phase, and lifecycle
- canonical arena dimensions and physics coordinates
- player positions, velocity, HP, super meter, alive/dead state
- cooldown validation, parry/block windows, ability validation, projectile hits, and knockback
- countdown, match timer, round-over result, winner/loser, and rematch state
- input rate limits, malformed message rejection, permission checks, and reconnect tokens

Clients send only input snapshots such as movement, jump, aim, attack, parry, Q/E, and super. Clients do **not** send trusted HP, damage, cooldowns, final positions, winners, or match results.

## Performance features

Impact frames now use color shock glow, radial hit bursts, speed rays, and expanding rings instead of only plain white flashes. Lower quality settings automatically reduce ray density while keeping the hit readable.

### Graphics quality

Settings include four quality levels:

- **Low**: reduced particles, debris, shadows, text effects, screen effects, portal density, trails, DPR cap, and background detail for weak CPUs/GPUs.
- **Medium**: balanced effect density for integrated graphics and older laptops.
- **High**: default visual quality for average modern laptops/desktops.
- **Ultra**: highest visual density for stronger machines.

Quality affects particles, debris, trails, shadows, bloom-like glow, portal visuals, death visuals, fullscreen effects, text effects, and canvas DPR cap. Gameplay math is unchanged by quality.

### Adaptive Performance

Adaptive Performance can be enabled in Settings. It monitors frame time/FPS and dynamically scales expensive effects down when performance drops, then restores visual density gradually when frame pacing recovers. It does not change hitboxes, HP, cooldowns, physics, damage, winners, or server authority.

### Developer profiler

The Developer profiler toggle shows an overlay with:

- FPS and average frame time
- update and render time
- active particles, projectiles, effects, and hitboxes
- network ping
- current quality/adaptive scale
- pool sizes

Leave it disabled for normal production play.

### Memory and garbage collection

The client now pools particles, projectiles, hitboxes, rings, beams, slash arcs, floating text, zones, and telegraphs. Hot cleanup loops use in-place compaction instead of allocating new arrays. Match-owned ability timers are cleared when leaving, returning to lobby, or rematching, which reduces long-session leaks and stale delayed effects.

### Network efficiency

The client sends changed/throttled input intents instead of full trusted state. The server broadcasts snapshots at a fixed rate, encodes each room broadcast once, caps projectile/hitbox snapshot size, rounds non-critical numeric values, and avoids resending arena metadata in every normal snapshot.

See `PERFORMANCE_REPORT.md` for before/after proxy metrics and automated test results.

## Arena scaling

Multiplayer gameplay uses a canonical logical arena:

```text
1920 x 1080 world
arena rectangle: x=120, y=120, w=1680, h=840, floor=960
```

The client letterboxes/scales this world into the local canvas. Viewport size affects presentation only, not physics, hitboxes, projectiles, cooldowns, or collisions. HUD and menus remain responsive.

Viewport scaling targets reviewed in static/responsive logic and intended for manual browser smoke testing:

- 1920×1080 desktop
- 1366×768 laptop
- 2560×1080 ultrawide
- narrow/mobile-style viewport

### HUD-safe enlarged gameplay viewport

The canvas reserves dynamic safe space for the top HUD and bottom hint, then fits the camera around the playable arena plus a small world margin instead of shrinking the entire 1920x1080 logical canvas into the remaining area. Health bars, timer panels, and controls should not cover the arena, while fighters, projectiles, portals, grid lines, and impact effects are larger and easier to read on laptop/desktop screens.

Gameplay physics still uses the same canonical 1920x1080 coordinate space and arena rectangle. The change is presentation-only: pointer conversion, grid drawing, impacts, fullscreen effects, and multiplayer snapshots all share the same camera transform, so input and visuals stay aligned.


## Multiplayer flow

1. Open **Multiplayer**.
2. Enter a username.
3. Select **Duel 1v1** or **Free For All**.
4. Click **Create Room**. The server generates the room code.
5. Copy the invite link and send it to friends.
6. Everyone chooses a fighter and clicks **Ready**.
7. The server starts a countdown, then begins the authoritative match.

After a round:

- **Rematch**: requests a rematch. If the opponent has not accepted yet, the UI shows waiting-for-opponent.
- **Return to Lobby**: resets the room to character select and clears old match state.
- **Leave Room / Main Menu**: removes the player and notifies others.

Disconnects during a match trigger a short server-side reconnect hold. A reconnecting player can resume using the locally stored session ID and reconnect token. If the reconnect window expires, the connected opponent wins by disconnect or the room returns safely to lobby.

## Pause behavior

Single-player can still pause locally.

Multiplayer cannot be paused by one client. Pressing Escape/Pause opens a local-only match menu with:

- Resume
- Return to Lobby
- Settings
- Leave Match

The server simulation continues unless the server itself is temporarily holding the match for a disconnect/reconnect window.

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
Pause/menu: Esc
```

Mobile/tablet:

```text
Left stick: movement
Right pad: aim
Buttons: Jump, Attack, Parry, Q, E, R
```

## Browser code visibility and source protection limits

Browser-delivered JavaScript, HTML, CSS, and assets can be viewed by determined users through DevTools, browser caches, network tools, or saved page files. Right-click blocking and shortcut blocking are only casual deterrents; they do not provide real protection and should not be treated as DRM.

This release handles that reality by:

- moving multiplayer authority to the server
- keeping secrets out of client code
- rejecting client-reported HP, damage, cooldowns, and winners
- validating all message types, phases, mode permissions, characters, room codes, usernames, numeric values, and input rates
- using session IDs and reconnect tokens for reconnects
- disabling casual context-menu/source-view shortcuts without claiming full protection
- documenting that public browser code cannot be fully hidden

For stronger asset/code protection, use private source control, server-side authority for competitive state, and legal/licensing controls. Do not put API keys, passwords, paid-service secrets, or authoritative anti-cheat secrets in the client.

## Anti-cheat protections in this build

Implemented for public testing:

- server-side room/match state machine
- server-side HP, cooldown, hit, projectile, and winner authority
- input-only client protocol
- input/message rate limiting
- malformed JSON/frame size handling
- room/full/old-version/permission errors
- host-only pre-match mode control
- character selection whitelist
- username and room-code sanitization
- canonical arena clamp and server-side impossible-position prevention
- reconnect token/session handling
- rejection of client `state`, `damage`, `winner`, `hp`, and `cooldown` messages

Not included:

- persistent accounts
- matchmaking queue
- rankings/leaderboards
- replay review tooling
- commercial-grade cheat detection
- multi-instance room sharing across several Render instances

## Render/scaling notes

This server keeps room state in process memory. It is suitable for one Render web service instance and public testing. Horizontal scaling across multiple instances would require shared room state or sticky sessions, which are intentionally not included to keep deployment free/simple.

Free Render instances may sleep when idle. First visit after sleep can be slow.

## Testing performed for this release

- `npm install --ignore-scripts --no-audit --no-fund`
- `node --check server.js`
- extracted client JavaScript syntax check with `node --check`
- `npm run check:all`
- local server startup on a test port
- `/health` response check
- WebSocket create-room test
- WebSocket join-room test
- multiplayer 1v1 start and authoritative snapshot test
- multiplayer FFA start and authoritative snapshot test
- long-session combat/network stability stress test
- particle stress path through sustained combat input
- projectile stress path through sustained combat input
- portal/Warp stress path through Warp selection and ability input
- ultimate spam stress path through repeated super intents
- rematch waiting test
- rematch all-accepted restart test
- return-to-lobby test
- leave-room cleanup test
- disconnect cleanup test
- low-end/adaptive-performance static smoke check
- viewport scaling logic check for 1920×1080, 1366×768, 2560×1080, and narrow/mobile-style dimensions

Headless Chromium screenshot/profile execution was attempted but timed out in this sandbox with Chromium process-isolation errors. Use the in-game Developer profiler for real browser FPS/frame-time validation on target devices.
