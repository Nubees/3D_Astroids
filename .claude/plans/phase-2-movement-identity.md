---
name: phase-2-movement-identity
description: Phase 2 implementation plan — drift-vs-arena movement identity with into-the-screen streaming, pooled asteroids, soft camera follow, and static planet beacon.
---

# Phase 2 — Movement Identity Implementation Plan

**Date:** 2026-06-17
**Goal:** Validate soft forward drift against arena movement and pick the permanent model.
**Approach:** Into-the-screen drift with soft camera follow, pooled asteroids, layered streaming starfield, static distant planet beacon. Arena remains as a `Tab` toggle baseline.

## 1. Overview

Phase 1 proved the sacred loop in arena mode. Phase 2 tests whether the spec's intended "soft forward drift" feel works before building planet alignment and other drift-dependent systems.

## 2. Scope

**In scope:**
- Add `MovementMode.ARENA` and `MovementMode.DRIFT` enum.
- Extract movement logic into pure functions in `src/movement.ts`.
- Implement drift mode:
  - World streams toward the player along +Z.
  - Ship strafes in X/Y.
  - Soft camera follow: camera lags behind ship movement so the ship leads on screen.
  - Asteroids spawn far ahead, scale visually by Z, and respawn ahead if they pass behind the player.
- Add layered streaming starfield with parallax.
- Add static distant planet beacon for alignment legibility (drift mode only).
- Add `Tab` mode toggle with on-screen label.
- Keep arena mode exactly as Phase 1 for comparison.

**Deferred:**
- Planet growth / alignment reward (Phase 3–4).
- Shield (Phase 5).
- Enemies (Phase 6).
- Loot, hub, blueprints (Phases 7–9).
- Screen shake, particles, audio, hit-stop (juice deferred).

## 3. Changes Per File

### New files

| File | Purpose |
|---|---|
| `src/movement.ts` | Pure `updateArenaMovement` and `updateDriftMovement` functions plus mode constants. |
| `src/starfield.ts` | Layered streaming starfield that moves toward the player and resets when passing. |
| `src/planet.ts` | Static distant planet beacon mesh for drift mode. |
| `tests/movement.test.ts` | Unit tests for movement math. |

### Modified files

| File | Change |
|---|---|
| `src/types.ts` | Add `MovementMode` enum. |
| `src/ship.ts` | `Ship.update` accepts `MovementMode`; aim/cooldown stays; position update delegated to movement helpers. |
| `src/input.ts` | Add `toggleMode` action on `Tab` press (edge-triggered). |
| `src/game.ts` | Track current mode; branch camera follow, asteroid spawn/cleanup, starfield update, and planet visibility. |
| `src/asteroid.ts` | Add Z position, visual scaling by Z, and reset-to-far behavior. |
| `index.html` | Add minimal HUD overlay for mode label and instructions. |

## 4. Architecture

- `Ship` stores `position` as `{ x, y, z }` for drift compatibility; arena mode ignores Z.
- `movement.ts` exposes two pure updaters:
  - `updateArenaMovement(state, input, dt, bounds)` — current Phase 1 behavior.
  - `updateDriftMovement(state, input, dt, config)` — strafe + soft forward drift.
- `Game` stores a `cameraTarget` point that lerps toward the ship with a lag factor.
- Asteroids are pooled: when one passes behind the player in drift mode, it resets to far Z with a new X/Y position.
- Starfield layers move at different speeds to create parallax depth.
- Planet beacon is static in drift mode, hidden in arena mode.

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Camera lag makes aiming hard | High | Keep lag subtle (~0.15s); add aim reticle later if needed. |
| Asteroid pooling bugs | Medium | Unit-test reset logic; keep pool simple. |
| 3D depth math confuses collisions | Medium | Collision remains 2D at ship Z; scale maps to danger range. |
| Mode toggle mid-game causes bad state | Low | Reset ship and camera target on mode switch. |

## 6. Verification Plan

```
Plan:
1. Add MovementMode enum and movement.ts helpers → verify: typecheck passes.
2. Refactor Ship to delegate movement → verify: arena mode still plays identically.
3. Implement drift movement + soft camera follow → verify: ship leads camera, world streams.
4. Implement asteroid pooling + starfield → verify: asteroids respawn ahead, stars stream.
5. Add planet beacon + mode toggle HUD → verify: label updates, planet visible only in drift.
6. Run tests + screenshot → verify: test suite passes and screenshot captures both modes.
7. 5-minute playtest → verify: control comfort, readability, alignment legibility.
```

## 7. Test Matrix

| Scenario | Expected Result |
|---|---|
| `Tab` in arena mode | Switches to drift mode; HUD label updates; planet appears. |
| `Tab` in drift mode | Switches to arena mode; HUD label updates; planet hidden. |
| Drift mode movement | Ship strafes in X/Y; camera softly follows with lag. |
| Asteroid in drift | Spawns far away, grows as it approaches, resets after passing. |
| Starfield in drift | Stars stream toward player with parallax. |
| Arena mode regression | Plays exactly like Phase 1. |
| `npm run test` | All Vitest + Playwright pass. |

## 8. Estimate

| Step | Time |
|---|---|
| Movement abstraction + arena refactor | 20 min |
| Drift movement + soft camera | 25 min |
| Asteroid pooling + starfield | 25 min |
| Planet beacon + HUD toggle | 15 min |
| Tests + verification | 20 min |
| **Total** | **~1.75 hours** |

## 9. Related

- `Knowledge/Wiki/asteroids-next-edition-spec.md` §5–6
- `project_phase_1_sacred_loop_completed.md`
