---
name: phase-2-movement-identity
description: Phase 2 implementation plan — add soft forward drift via a MovementController strategy, compare with arena mode, and run a 5-minute playtest to lock the final movement model.
---

# Phase 2 — Movement Identity Implementation Plan

**Date:** 2026-06-17
**Goal:** Implement soft forward drift, compare it with arena mode, and decide which movement model becomes permanent.
**Decision from user:** Proceed with MovementController strategy; arena as default for the bake-off; include a placeholder planet beacon for alignment preview.

## 1. Overview

Phase 1 proved the sacred loop in arena mode. Phase 2 tests whether soft forward drift (the GDD's chosen identity) feels better. We add drift as a runtime toggle without rewriting Phase 1 systems.

## 2. Scope

**In scope:**
- `MovementMode` enum and `MovementController` strategy.
- `ArenaMovementController` preserving Phase 1 behavior.
- `DriftMovementController` with world streaming, soft camera follow, camera-relative spawning/culling.
- Placeholder planet beacon ahead of the ship for alignment preview.
- Toggle key (`M`) to switch modes during dev playtest.
- Updated `screenToWorld` to account for camera position.

**Deferred:**
- Real planet growth/alignment mechanics (Phase 3).
- Shield, enemies, loot, hub.
- Full audio/particle polish (engine hum, debris, screen shake).

## 3. Changes Per File

### New files

| File | Purpose |
|---|---|
| `src/movement/arena-controller.ts` | Arena mode: fixed arena bounds, current Phase 1 spawner. |
| `src/movement/drift-controller.ts` | Drift mode: world streams backward, camera soft-follow, camera-relative spawn/cull. |
| `src/movement/movement-controller.ts` | Shared interface for controllers. |
| `tests/movement.test.ts` | Unit tests for drift math and bounds logic. |

### Modified files

| File | Change |
|---|---|
| `src/types.ts` | Add `MovementMode` enum and `MovementController` related types. |
| `src/ship.ts` | Make `Ship.update` mode-agnostic; accept a target-velocity hint or keep strafe/aim only. |
| `src/game.ts` | Replace hard-coded arena logic with controller field; add camera tracking, mode toggle key, beacon. |
| `src/input.ts` | Add mode toggle event or expose raw key state so Game can detect `M`. |
| `tests/screenshot.spec.ts` | Update to capture the new scene (ship + beacon + asteroids). |

## 4. Architecture

```
Game
├── movement: MovementController
│   ├── ArenaMovementController
│   └── DriftMovementController
├── ship: Ship
├── asteroids: LiveAsteroid[]
├── projectiles: LiveProjectile[]
├── camera: PerspectiveCamera
└── beacon: Mesh (placeholder)
```

- `Ship.update(input, dt)` handles strafe and aim regardless of mode.
- `MovementController.apply(ship, input, dt)` applies mode-specific velocity and bounds.
- `MovementController.getSpawnConfig()` returns where/when to spawn asteroids.
- `MovementController.shouldCull(position)` returns whether an asteroid or projectile is off-screen.

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Camera follow breaks mouse aim | High | Update `screenToWorld` to use `camera.position` + viewport half-size. |
| Drift spawns asteroids off-screen or behind ship | High | Spawn ahead of camera based on controller logic. |
| Two modes diverge too much | Medium | Keep controller interface small; most code shared. |
| Playtest inconclusive | Medium | Define clear criteria (see section 8). |

## 6. Verification Plan

```
Plan:
1. Add MovementMode enum and MovementController interface → verify: typecheck passes.
2. Extract arena logic into ArenaMovementController → verify: game still plays exactly like Phase 1.
3. Implement DriftMovementController → verify: asteroids stream from front, ship strafes, camera follows.
4. Add beacon placeholder → verify: visible in screenshot.
5. Add mode toggle key → verify: pressing M switches modes in dev.
6. Run npm run test → verify: all tests pass.
7. Manual 5-minute playtest → verify: record results against criteria.
```

## 7. Test Matrix

| Scenario | Expected Result |
|---|---|
| Default launch | Arena mode active; same feel as Phase 1. |
| Press `M` | Switches to drift mode. |
| Drift mode | Asteroids spawn ahead and stream backward; ship strafes; camera follows softly. |
| Mouse aim in drift | Shots fire toward cursor accurately. |
| Press `M` again | Switches back to arena mode. |
| `npm run test` | All Vitest + Playwright tests pass. |
| Screenshot | Shows ship, asteroids, and beacon. |

## 8. Playtest Criteria

Run the game for 5 minutes in each mode and record:

| Criterion | How to measure | Target |
|---|---|---|
| Control comfort | Dodge 3 rocks in a row | ≥70% success |
| Readability | Time from spawn to impact | ≥1.5 s visible |
| Alignment legibility | Time centered on beacon | Subjective + % on-vector |
| Death fairness | Unavoidable deaths from spawns/bounds | ≤1 |
| Session preference | Which mode for 20 min? | User decides |

## 9. Estimate

| Step | Time |
|---|---|
| Extract arena controller + refactor Game | 25 min |
| Implement drift controller + camera follow | 30 min |
| Add beacon and mode toggle | 15 min |
| Tests + typecheck + screenshot | 20 min |
| Playtest + decision | 15 min |
| **Total** | **~1.5 hours** |

## 10. Related

- `Knowledge/Wiki/asteroids-next-edition-spec.md` section 5
- `project_phase_1_sacred_loop_completed.md`
