---
name: phase-1-sacred-loop
description: Phase 1 implementation plan — ship movement, base blaster, breakable Iron Slag, death/restart using arena-style movement.
---

# Phase 1 — Sacred Loop Implementation Plan

**Date:** 2026-06-17
**Goal:** Implement the core arcade loop: ship movement, base blaster, breakable Iron Slag asteroids, death/restart.
**Movement model:** Arena-style for Phase 1 (soft forward drift deferred to Phase 2 per GDD).

## 1. Overview

Phase 0 gave us a Three.js + Vite scaffold with a procedural ship, asteroid, starfield, and screenshot harness. Phase 1 turns that static scene into a playable mini-loop.

## 2. Scope

**In scope:**
- Input abstraction (keyboard + mouse) producing action states.
- Arena-style ship movement and mouse aim.
- Base blaster with cooldown and projectile cleanup.
- Iron Slag asteroids: large → 2 medium → 2 small.
- Collision detection (projectile↔asteroid, ship↔asteroid).
- Death and fast restart.

**Deferred:**
- Soft forward drift (Phase 2).
- Planet beacon (Phase 3).
- Shield (Phase 5).
- Enemies (Phase 6).
- Loot, pickups, hub, blueprints (Phases 7–9).
- Audio, particles, screen shake, muzzle flash (juice deferred to later phases).

## 3. Changes Per File

### New files

| File | Purpose |
|---|---|
| `src/input.ts` | `InputManager` class: captures keyboard/mouse, exposes stable `InputState` per frame. |
| `src/projectile.ts` | `Projectile` interface and `updateProjectile()` for position/lifetime. |
| `src/utils/collision.ts` | Pure circle/circle collision math. |
| `tests/collision.test.ts` | Unit tests for collision helper. |
| `tests/asteroid.test.ts` | Unit tests for `splitAsteroid`. |

### Modified files

| File | Change |
|---|---|
| `src/types.ts` | Add `InputState`, `Projectile`, `AsteroidState`, `ShipState` interfaces. |
| `src/ship.ts` | Add `Ship` class with position, velocity, aim angle, update, and mesh creation. |
| `src/asteroid.ts` | Add `Asteroid` class with health, size, radius, velocity, and `splitAsteroid()` pure function. |
| `src/game.ts` | Integrate input, ship, projectiles, asteroids, spawner, collisions, death/restart. |
| `src/main.ts` | Add cleanup on page unload. |
| `package.json` | `test` script already runs vitest + playwright; no change needed. |
| `tsconfig.json` | No change. |

## 4. Architecture

- `Game` owns the Three.js scene, renderer, camera, and game entities.
- `InputManager` reads raw events and produces a stable `InputState` each frame.
- `Ship` holds game state (position, velocity, aim angle) and knows how to update from input.
- `Projectile` is a plain data object; `game.ts` owns the Three.js mesh mapping.
- `Asteroid` holds game state (size, health, velocity, radius); `splitAsteroid()` is pure and testable.
- Collision math lives in `src/utils/collision.ts` per project rules.

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Scope creep into drift/planet/shield | High | Strictly defer anything not listed above; update this plan if scope changes. |
| Input keys stick on window blur | Medium | Reset input state on `blur` event. |
| Huge deltaTime after lag spike | Medium | Clamp deltaTime to 0.1s in the loop. |
| Memory leaks on restart | Medium | Dispose old projectile/asteroid meshes on restart. |
| Mouse aim in perspective camera | Low | Raycast from camera onto gameplay plane at z=0. |

## 6. Verification Plan

```
Plan:
1. Implement input abstraction → verify: unit test that keys update state.
2. Implement ship movement + aim → verify: dev server shows ship follows mouse and moves with WASD.
3. Implement base blaster → verify: pressing Space/LMB spawns projectiles.
4. Implement asteroid splitting → verify: unit test large→medium→small.
5. Implement collisions + death/restart → verify: unit tests pass + manual playtest breaks ≥3 asteroids in 60s and respawn <2s.
6. Run npm run test → verify: all tests pass and screenshot is captured.
```

## 7. Test Matrix

| Scenario | Expected Result |
|---|---|
| `npm run typecheck` | 0 errors. |
| `npm run test` | Vitest + Playwright pass. |
| Ship moves with WASD/Arrows | Ship translates on screen. |
| Ship aims at mouse | Ship nose points toward cursor. |
| Space/LMB fires | Projectile spawns from ship nose. |
| Projectile hits large asteroid | Splits into 2 medium asteroids. |
| Projectile hits medium asteroid | Splits into 2 small asteroids. |
| Projectile hits small asteroid | Asteroid removed. |
| Ship touches asteroid | Death → respawn within 2 seconds. |
| 60-second playtest | Break at least 3 Iron Slag asteroids. |

## 8. Estimate

| Step | Time |
|---|---|
| Input + ship update | 20 min |
| Blaster + projectiles | 15 min |
| Asteroid state + splitting | 20 min |
| Collisions + death/restart | 20 min |
| Tests + verification | 25 min |
| **Total** | **~1.5 hours** |

## 9. Related

- `Knowledge/Wiki/asteroids-next-edition-spec.md`
- `Knowledge/Wiki/asteroids-next-edition-starter-kit.md`
- `project_phase_0_foundations_completed.md`
