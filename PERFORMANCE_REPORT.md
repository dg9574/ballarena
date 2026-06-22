# Ball Clash Arena Performance Report

This report covers the performance-focused release pass after the server-authoritative multiplayer update.

## Scope

The pass focused on frame pacing, CPU/GPU fallback behavior, Canvas draw cost, garbage-collection reduction, effect density, long-session cleanup, multiplayer traffic, and low-end/mobile scalability.

## Client rendering and simulation improvements

- Added graphics quality modes: **Low**, **Medium**, **High**, and **Ultra**.
- Added optional **Adaptive Performance** mode that monitors frame time/FPS and dynamically reduces effect density when frames become slow, then restores quality gradually when performance recovers.
- Added a developer profiler overlay showing FPS, frame time, update time, render time, active particles, active projectiles, active effects, hitboxes, ping, and pool sizes.
- Added object pools for particles, projectiles, hitboxes, rings, beams, slash arcs, floating text, zones, and telegraphs.
- Replaced hot-path visual allocations with pooled resets.
- Replaced per-frame visual-array `filter()` cleanup with in-place compaction for particles, projectiles, beams, rings, texts, zones, hitboxes, and telegraphs.
- Added effect caps per quality tier and adaptive scale.
- Added cached ball sprites to avoid creating radial gradients in every fighter draw.
- Reduced expensive shadows, text effects, fullscreen effects, portal rendering density, grid density, and death debris on lower quality levels.
- Throttled HUD/DOM updates and cached unchanged text/width writes.
- Replaced cooldown DOM queries inside update paths with cached child access.
- Added tracked game timers so delayed ability/super effects can be cleared on rematch, return-to-lobby, or leaving a match.
- Replaced many raw `setTimeout()` ability sequences with match-owned timers.
- Optimized FFA snapshot hydration to avoid rebuilding fighter lookup maps every snapshot.
- Avoided object spread allocations while applying multiplayer snapshots.
- Reworked player trail cleanup to avoid per-frame array filtering.

## Network and server improvements

- Broadcast WebSocket packets are JSON-encoded once per room broadcast instead of once per recipient.
- Snapshot rate reduced from 20 Hz to 18 Hz to reduce bandwidth while preserving responsiveness.
- Snapshot projectile/hitbox caps reduced from 80 to 64.
- Arena metadata is sent on join/start/forced snapshots instead of every normal snapshot.
- Snapshot numeric values are rounded where practical to reduce packet size.
- Client input sending is throttled and change-aware: unchanged non-action input is suppressed, while action input remains responsive.
- Server keeps stale room cleanup and lifecycle protections from the previous release-ready pass.
- Added test-only short-match environment flag `BCA_TEST_SHORT_MATCH=1` to make automated rematch/lifecycle tests fast without changing production defaults.

## Before vs after proxy comparison

These counts compare the pre-performance ZIP source to the optimized source. They are static hot-path proxies, not a substitute for browser profiling on target hardware.

| Metric | Before | After | Impact |
|---|---:|---:|---|
| `new Particle` call sites | 28 | 0 | Particle creation moved to pool resets |
| `new Projectile` call sites | 20 | 0 | Projectile creation moved to pool resets |
| `new Ring` call sites | 55 | 0 | Ring/effect creation moved to pools |
| `new FloatText` call sites | 44 | 0 | Floating combat text pooled and quality-gated |
| `new Beam` call sites | 33 | 0 | Beam effects pooled |
| `new Hitbox` call sites | 33 | 0 | Hitboxes pooled |
| `.filter()` call sites in client | 38 | 6 | Hot cleanup filters replaced with in-place compaction |
| cooldown `querySelector('.coolFill')` | 1 | 0 | HUD update path avoids repeated DOM queries |
| raw game `setTimeout()` sequences | 41 | 1 helper | Ability/super timers now match-owned and clearable |
| normal snapshot rate | 20 Hz | 18 Hz | ~10% fewer normal snapshot broadcasts |
| snapshot projectile/hitbox cap | 80/80 | 64/64 | Lower worst-case packet size |

## Automated performance/stability smoke results

The Node/WebSocket stress harness completed successfully with the optimized build:

- Local server startup: pass
- `/health`: pass
- Room creation: pass
- Join room: pass
- 1v1 start: pass
- FFA start: pass
- Long-session combat stress: pass
- Particle stress path: pass
- Projectile stress path: pass
- Portal/Warp stress path: pass
- Ultimate input spam stress path: pass
- Rematch waiting: pass
- Rematch acceptance/restart: pass
- Return-to-lobby: pass
- Leave cleanup: pass
- Disconnect cleanup: pass

Observed after-optimization network sample during the automated duel stress run:

```text
snapshots received: 205
average snapshot payload: ~1,278 bytes
```

## FPS and browser measurement note

This sandbox can run Node syntax/runtime/WebSocket tests. Headless Chromium screenshot/profile attempts against localhost timed out with sandbox/process-isolation errors, so real browser FPS numbers could not be honestly measured here.

The build now includes an in-game developer profiler for real hardware validation. For release validation, enable **Settings → Developer profiler**, test Low/Medium/High/Ultra plus Adaptive Performance, and record FPS/frame time on representative devices.

Recommended manual targets:

- High-end PC: High/Ultra, Adaptive optional, near-refresh-rate frame pacing.
- Average laptop/integrated GPU: Medium with Adaptive enabled.
- Older laptop/office PC: Low with Adaptive enabled.
- Mobile/tablet: Low or Medium with Adaptive enabled and reduced DPR cap.

## Expected runtime impact

Because hot-path visual allocation, per-frame filtering, frequent DOM mutation, repeated snapshot hydration allocation, and excessive effect density were reduced, the largest gains should appear as:

- fewer GC stalls during supers and particle-heavy moments,
- lower frame-time spikes during portal/death/fullscreen effects,
- better long-session stability,
- lower worst-case network bandwidth,
- better behavior on CPU-rendered Canvas or integrated graphics.

Real FPS depends heavily on browser, device, resolution, power mode, thermal throttling, and hardware acceleration state.
