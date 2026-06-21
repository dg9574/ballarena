# Changelog

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
