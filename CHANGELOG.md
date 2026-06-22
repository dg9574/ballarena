# Changelog

## Performance and scalability release update

### Client frame pacing and rendering

- Added graphics quality settings: Low, Medium, High, and Ultra.
- Added Adaptive Performance mode that dynamically trims expensive effects when FPS/frame time drops and restores density gradually when performance recovers.
- Added a Developer profiler overlay for FPS, frame time, update time, render time, active particles, projectiles, effects, hitboxes, ping, adaptive scale, and pool sizes.
- Added object pooling for particles, projectiles, hitboxes, rings, beams, slash arcs, floating text, zones, and telegraphs.
- Replaced hot-path visual allocations with pooled reset paths.
- Replaced hot visual-array cleanup filters with in-place compaction to reduce garbage-collection stalls.
- Cached ball sprites to avoid recreating radial gradients during fighter rendering.
- Reduced expensive shadows, fullscreen effects, portal density, grid detail, text effects, and death debris on lower quality levels.
- Throttled HUD updates and avoided repeated cooldown DOM queries.
- Avoided object-spread allocations when applying multiplayer snapshots.
- Optimized FFA snapshot hydration by caching fighter lookup maps.
- Reworked player trail cleanup to avoid per-frame filter allocations.

### Effects, abilities, and long-session stability

- Scaled particle/debris bursts by quality and adaptive performance level while preserving gameplay behavior.
- Added caps for particles, projectiles, hitboxes, beams, zones, and other transient effects.
- Replaced delayed ability/super timers with match-owned timers that are cleared on rematch, return-to-lobby, leave, and new game.
- Reduced Warp portal visual density on low quality and reduced portal ultimate visual load without changing server authority.
- Reduced Magician fullscreen/rune visual load on low/adaptive settings.
- Reduced AI/System Override visual density on low/adaptive settings.

### Multiplayer and server performance

- Encoded each room broadcast WebSocket frame once instead of once per connected recipient.
- Reduced normal snapshot rate from 20 Hz to 18 Hz.
- Reduced projectile/hitbox snapshot caps from 80 to 64.
- Stopped sending arena metadata in every normal snapshot; it is sent on join/start/forced snapshots.
- Rounded snapshot numeric fields where practical to reduce payload size.
- Added change-aware/throttled client input sending to reduce bandwidth while keeping action inputs responsive.
- Added a test-only `BCA_TEST_SHORT_MATCH=1` server flag for faster automated lifecycle/rematch tests; production defaults are unchanged.

### Performance report

- Added `PERFORMANCE_REPORT.md` with before/after source metrics, network stress sample, implementation notes, and browser-FPS measurement limits.
- Static hot-path proxy comparison from the previous ZIP to this ZIP:
  - visual constructor call sites for Particle/Projectile/Ring/FloatText/Beam/Hitbox: reduced to zero direct hot-path `new` calls.
  - client `.filter()` call sites: reduced from 38 to 6.
  - raw gameplay `setTimeout()` sequences: reduced from 41 to one tracked helper.
  - cooldown `querySelector('.coolFill')`: removed from update path.

### Validation

- Verified `npm install --ignore-scripts --no-audit --no-fund`.
- Verified `node --check server.js`.
- Verified extracted client JavaScript syntax with `node --check`.
- Verified `npm run check:all`.
- Verified local server startup and `/health`.
- Verified WebSocket create-room, join-room, 1v1 start, FFA start, long-session stress, particle/projectile/portal/ultimate stress paths, rematch waiting, rematch acceptance, return-to-lobby, leave cleanup, and disconnect cleanup.
- Headless Chromium visual profiling was attempted but timed out in the sandbox; the in-game profiler is included for real hardware FPS validation.

## Multiplayer release-readiness update

### Server-authoritative multiplayer

- Replaced host-authoritative WebSocket relay with an authoritative server match engine for public testing.
- Added explicit room phases: `lobby`, `character_select`, `countdown`, `playing`, `round_over`, `rematch_wait`, `returning_to_lobby`, and `closed`.
- Server now owns room lifecycle, host assignment, player roster, readiness, countdown, match timer, HP, cooldowns, projectile/hit validation, winner selection, and match reset.
- Clients now send inputs/intents only; client-reported damage, HP, cooldowns, positions, winners, and full match state are rejected.
- Added canonical 1920×1080 arena coordinates on the server and client letterboxing so viewport size no longer changes multiplayer physics.
- Added fixed-rate server snapshots for duel and FFA.
- Added protocol version checks and structured room/full/invalid/old-version/permission errors.

### Lobby, rematch, and lifecycle

- Server-generated room codes for new rooms.
- Host-only mode changes before match start.
- Ready/start validation for 1v1 and FFA.
- Clear rematch consent tracking with waiting-for-opponent state.
- All-player rematch acceptance cleanly resets and restarts countdown.
- Return-to-lobby now clears match state, timers, projectiles, hitboxes, cooldowns, death/result state, ready flags, and rematch flags.
- Leave-room and empty-room cleanup now remove stale state and notify remaining players.
- Stale rooms expire automatically.

### Disconnects and reconnects

- Added session IDs and reconnect tokens.
- Added reconnect handling that restores the player when the room/session/token are still valid.
- Added short server-side disconnect hold during active matches.
- Expired disconnect windows resolve to opponent win or safe lobby return.
- Host migration is supported in lobby/character-select; active match host loss is handled by reconnect hold/forfeit instead of allowing a corrupt match.

### Pause and UX

- Multiplayer pause no longer freezes simulation or desyncs the opponent.
- Added local-only multiplayer match menu with Resume, Return to Lobby, Settings, and Leave Match.
- Updated online status text for waiting player, countdown, round over, rematch wait, reconnect hold, return-to-lobby, opponent leave, and room-close cases.

### Security / anti-cheat

- Added message and input rate limiting.
- Added numeric clamps, character whitelist, username/room-code sanitization, and phase-based action validation.
- Added explicit rejection of untrusted client state messages.
- Added no-secrets-in-client/code-protection documentation.
- Added casual context-menu/source-view shortcut deterrents while documenting that browser-delivered code cannot be fully hidden.

### Validation

- Verified `node --check server.js`.
- Verified extracted client JavaScript syntax with `node --check`.
- Verified local server startup and `/health`.
- Verified WebSocket create-room, join-room, 1v1 start, FFA start, authoritative snapshots, rematch waiting, rematch acceptance, return-to-lobby, disconnect notification, and leave cleanup with Node WebSocket clients.
- Smoke-checked canonical viewport scaling logic for 1920×1080, 1366×768, 2560×1080, and narrow/mobile-style sizes.


## Viking balance, bot difficulty, and AI fighter update

### Balance

- Rebalanced **Viking** to be much less oppressive: lower HP, speed, jump, damage, reach, passive knockback, shield-rush power, and axe-smack damage.
- Viking **Valhalla Rebirth** now triggers only once per round. After revival, R/Valhalla is marked spent and cannot revive him again.
- Archer arrows no longer advance spin animation, and Archer's in-hand arrow/bow presentation is smaller and cleaner.

### Single-player bots

- Added bot difficulty selection in Single Player: **Easy**, **Normal**, **Hard**, **Expert**, and **Master**.
- **Normal** intentionally keeps the previous bot timing/aim/action behavior as the baseline.
- Easier and harder tiers scale thinking speed, aim error, action frequency, bravery, and parry reliability around that baseline.

### New fighter

- Added **AI**, a digital prediction fighter with:
  - Basic neon glyph shots.
  - Q: Predictive Dash toward the enemy's projected path.
  - E: Data Lock slow plus homing code shards.
  - R: System Override full-arena scan beams and adaptive pulse.

## Warp / Archer and death-sequence update

### Combat flow

- Added a delayed KO breakdown before the result screen: the final lethal hit now leaves the losing ball visible, broken down, falling, splatting, and settling before the animated Victory/Defeat overlay appears.
- Preserved finisher tracking so the result screen still names the player, victim, move, damage, and HP swing after the visible death sequence.
- Nerfed Lance's Q/E/R pressure loop by reducing poke damage, shield duration, dash speed, hit width, reach, damage, and knockback while keeping the jousting identity intact.

### New fighters

- Added **Warp**, a portal-based cartoon fighter with double-cast Twin Portals, a blue floaty Drift Blast, and a close-range Portal Loop ultimate that runs a multi-second two-portal damage animation.
- Added **Archer**, a ranged bow fighter with arrow basic attacks, mouse-aimed Grappling Hook mobility, Explosive Arrow, and Arrow Barrage super.

### Visuals / networking

- Added portal, water blast, arrow, explosive arrow, grapple, and KO splat visuals.
- Added portal/death visual state packing so multiplayer clients receive the new end-of-match and portal effects from the host.

## Release UI overhaul - public-test polish

### UI / UX

- Replaced the layered hotfix styling with one cohesive dark neon arcade UI system across Main Menu, Single Player, Multiplayer, Tutorial, Settings, Credits/Controls, Character Select, lobby screens, and HUD.
- Fully redesigned Character Select as an opaque full-screen app shell with a clear header, Back/Opponent/Start actions, large fighter cards, strong selected/opponent states, independent roster/details scrolling, and balanced desktop/mobile layouts.
- Removed the giant background “FIGHTER SELECT” watermark and prevented gameplay canvas bleed-through on menu/select screens.
- Updated fighter cards to show a large avatar/weapon silhouette, name, weapon and difficulty chips, short playstyle, HP/Speed/Jump/Reach bars, and Q/E/R move chips.
- Rebuilt the selected fighter details panel with a large preview, theme, weapon, HP/reach metadata, Q/E/R ability descriptions, passive, strength, weakness, and difficulty.
- Brought multiplayer setup/lobby fighter grids into the same polished fighter-card system used by Single Player.
- Improved buttons, inputs, cards, tutorial sections, setting controls, status pills, room panels, player slots, and responsive spacing for desktop, laptop, tablet, and mobile.
- Added keyboard focus handling for fighter cards and guarded localStorage access so UI smoke tests and local/embedded contexts do not fail on restricted storage.

### HUD / accessibility

- Improved HUD contrast and readability with stronger glass panels, larger HP bars, clear HP numbers, colored HP states, readable cooldown boxes, super meter styling, and less intrusive pause/menu buttons.
- Reduced default camera shake to 25% and labeled conservative shake values in Settings.

### Validation

- Verified server JavaScript syntax with `node --check server.js`.
- Verified extracted client JavaScript syntax with `node --check`.
- Verified local server `/health` startup response.
- Smoke-tested UI flows in Chromium/Playwright using loaded client HTML: Main Menu, Single Player Character Select, opponent-pick state, Multiplayer setup/fighter select, Settings, Tutorial, and in-game HUD.
- Verified WebSocket room start flow for Multiplayer Duel and FFA with Node WebSocket clients.

## Hotfix: character select and projectile blocking

### UI / UX

- Reworked Character Select into a fixed app-style layout with an opaque panel, readable cards, visible action buttons, and independent scrolling for the roster/details columns.
- Improved desktop and mobile responsiveness so the showcase panel no longer visually washes out the header or traps the player at the bottom of a tall page.

### Combat balance

- Projectiles are no longer erased by idle/passive weapon colliders.
- Active attacks, active block/parry windows, and precise weapon timing can still stop projectiles.
- Heavy projectiles now require a perfect parry or active weapon contact for a full deflect; late blocking causes guard pressure instead of trivial full denial.

## Release public-test update

### UI / UX

- Rebuilt main menu into clear flows: Single Player, Multiplayer, Tutorial, Settings, Credits/Controls, and Quick Random Match.
- Added full tutorial screen covering movement, bounce timing, attacks, passive melee, parry, blocking, weapon clashes, abilities, supers, rooms, and mobile controls.
- Added Settings screen for sound, VFX intensity, camera shake, ping visibility, mobile controls, and touch sensitivity.
- Added Credits/Controls screen with keyboard/mobile controls and hosting notes.
- Added Back buttons to menu flows where appropriate.
- Expanded character select with detailed cards and a selected-character detail panel.
- Added fighter showcase canvas with animated weapon/ability preview.
- Improved lobby flow with clearer mode, ready state, invite link, paste-invite support, and ping indicator.

### Multiplayer / netcode

- Hardened WebSocket server frame parsing so partial frames are buffered instead of dropped.
- Added server ping/pong support and client ping display.
- Added host-only state relay protection.
- Improved room cleanup and idle-room pruning.
- Improved disconnect handling: rooms return to safe lobby state and ready flags reset.
- Kept the no-dependency Node server compatible with Render free/small instances.

### Gameplay / feel

- Slowed the early match pace and delayed the chaos ramp.
- Retained eventual high-speed gameplay while making openings more readable.
- Kept dash damage active during dash travel rather than front-loaded.
- Preserved passive melee weapon/hands collisions and weapon/projectile block interactions.
- Set Samurai Soul Return to a five-second path record/rewind behavior.
- Made Unarmed E behave as passive growth instead of a meaningful activated power spike.
- Retuned character-selection descriptions to expose weapon, playstyle, Q, E, R, passive, strengths, weakness, and difficulty.

### Performance / stability

- Added configurable VFX cap scaling.
- Added camera shake scaling and safety clamp.
- Preserved particle, beam, hitbox, and clone caps to avoid unbounded arrays.
- Verified server and client JavaScript syntax with Node checks.
- Verified local HTTP `/health` and multiplayer WebSocket ready/start/pong flow.

## Hotfix 2 - Character select, sync, Samurai E, shake, HP visibility

- Rebuilt single-player character select as an opaque fixed app layout with independent roster/details scrolling, mobile stacking, readable header buttons, and no canvas bleed-through.
- Applied the same fighter-card readability pass to multiplayer setup/lobby character selection.
- Fixed duel multiplayer input mapping so the host receives the guest input correctly instead of reading an empty remote input slot.
- Changed duel online play to host-authoritative rendering for guests, with fighter/projectile/hitbox snapshots relayed from the host to prevent each client seeing different gameplay.
- Added network serialization for projectile/hitbox visuals and Samurai Soul Return state.
- Reworked Samurai E into a reliable recorded-path rewind: a clear return point is shown, a path is drawn, E can trigger early return, and automatic return occurs after the timer.
- Reduced default camera shake from 75% to 30%, capped maximum shake, increased shake decay, and reduced applied shake amplitude.
- Recolored and enlarged health bars with high-contrast HP text and dynamic green/yellow/red remaining-health colors.
## UI Finisher Screen Update

- Added a cinematic animated victory/defeat screen with League-style final-result presentation.
- Captured the actual killing hit from combat resolution and carried it into duel and FFA result screens.
- Result screen now shows finisher, eliminated fighter, move/source, damage amount, and final HP swing.
- Synchronized finisher data through multiplayer host state packets so guests see the same end result.
- Added a decision fallback for time-limit endings where no killing blow exists.


## Character Balance and New Fighters Update

### New fighters

- Added **Magician**, a rune caster with glyph projectiles, Rune Root, Letter Blast, and a full-screen Grand Rune Cataclysm ultimate presentation.
- Added **Viking**, a shield-and-axe bruiser with two visible weapons, Shield Rush, Axe Smack, and Valhalla Rebirth.
- Viking R is not a normal casted attack: if super is full when Viking takes lethal damage, he is automatically reborn at half HP and consumes the super meter.

### Balance / mechanics

- Buffed **Axiom** so Q, E, and R projectiles cannot be blocked, parried, weapon-clashed, or swatted by weapon hitboxes. They must be dodged.
- Converted **Unarmed E** into passive growth only; pressing E no longer triggers an interactable ability.
- Increased **Brute** Berserk lifesteal and passive berserk damage value.
- Reworked **Brute E** into a real spinning axe state with locked weapon direction and repeated cyclone hitboxes. Mouse aim no longer cancels or redirects the spin before it finishes.

### Visuals / sync

- Added Magician glyph projectile rendering, rune root bursts, letter blast particles, and full-screen rune overlay.
- Added Viking shield/axe weapon drawing, Valhalla screen effect, rebirth rings, and rebirth-ready aura.
- Synced screen effects, no-block projectile metadata, Viking rebirth status, and Brute spin status through multiplayer state packets.

### Validation

- Verified server JavaScript syntax with `node --check server.js`.
- Verified extracted client JavaScript syntax with `node --check`.
- Verified local server `/health` startup response.
- Smoke-tested client runtime in Chromium using loaded HTML: Magician start + ultimate effect, Viking lethal-damage rebirth, Brute E spin lock, and Axiom weapon-block bypass.

## Fix patch - AI/Viking/Warp tuning
- Fixed AI missing cooldown registration so selecting AI no longer breaks match startup or ability handling.
- Made Viking Valhalla Rebirth a true once-per-round revive using a permanent per-fighter `valhallaUsed` flag instead of a decaying status timer.
- Reduced Warp Portal Loop ultimate damage from lethal burst territory to a controlled multi-hit cinematic combo.
