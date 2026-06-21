# Changelog

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
