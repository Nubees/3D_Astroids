# Plan — Ship Explosion + Space Drift + Shield Knockback Bounce

## Goal
Make the ship feel weightless and reactive: add inertia-based drift, make shield
knockback feel like a real bounce, and add a satisfying explosion when the shield is
depleted and the ship dies.

## Rules
1. Ship movement uses **momentum/inertia**: input applies acceleration, the ship keeps
coasting when input stops, and it bounces off arena bounds slightly.
2. Shield absorption knockback now reflects the ship's velocity off the collision
normal (like an elastic asteroid bounce), with force scaled by asteroid size.
3. When a hit depletes the shield and kills the ship, the ship **explodes** into
shards/particles before respawning.
4. Respawn is delayed briefly (~1s) to let the explosion play out.
5. During respawn delay, the player cannot move or fire; input is ignored.

## Approach

### 1. Ship physics (`src/ship.ts`)
- Add `applyThrust(input, deltaTime)` that accelerates the ship toward the input
  direction at a fixed rate instead of setting velocity directly.
- Add `updatePosition(deltaTime)` to integrate velocity into position.
- Expose a `respawnTimer` and `isDead` flag on the ship.
- Add `markDead()` and `markAlive()` helpers.

### 2. Arena controller (`src/movement/arena-controller.ts`)
- Keep `apply()` reading input, but have it delegate to `ship.applyThrust()` rather
  than directly assigning velocity.
- Keep position integration in `apply()` so the controller still owns clamping.
- Add a soft arena-boundary bounce: if the ship hits the edge, reverse the relevant
  velocity component and apply damping.

### 3. Shield knockback (`src/game.ts`)
- In `onShieldAbsorbedHit`, compute the collision normal and reflect the ship's
  velocity across it.
- Scale the reflected velocity by a bounce factor (e.g., 0.7) and add a size-scaled
  outward impulse.
- This replaces the simple outward push with a more physics-like bounce.

### 4. Ship explosion (`src/game.ts`)
- Add an `ExplosionParticle` type and an `activeExplosions` array.
- Add `spawnShipExplosion()` that creates ~20–30 particle shards at the ship's
  position with outward velocities, colored orange/white/yellow.
- Add `updateExplosions(deltaTime)` that moves, fades, and removes particles.
- In `respawnShip`, first trigger the explosion, then delay the actual reset for
  1.0s while the particles play.
- During the death delay, skip `controller.apply` and firing input; keep updating
  particles and rendering.

### 5. Game loop timing
- Track `shipRespawnDelay` in `Game`.
- When death occurs, set `shipRespawnDelay = 1.0` and `ship.isDead = true`.
- Skip movement, firing, collisions, and spawning while dead.
- After the delay, reset ship position/velocity and clear the dead flag.

### 6. Tests
- Update `tests/movement.test.ts`: the arena acceleration test still passes because
  thrust still moves the ship; the exact velocity numbers will change slightly.
- Add `tests/ship.test.ts` if it doesn't exist: verify thrust adds velocity, coasting
  preserves velocity, and respawn state.
- Update shield tests only if needed (signature unchanged).

## Risks
- Inertia makes the ship harder to control; keep thrust strong so it still feels
  responsive.
- Explosion particles need cleanup to avoid memory leaks.
- Death delay pauses gameplay; keep it short so respawn doesn't feel sluggish.

---

## Status: Completed (2026-06-22)

Closed by user sign-off. Verified against current source:

- `src/ship.ts` — `isDead`, `respawnTimer`, `markDead()`, `markAlive()` implemented; `applyThrust` integrates input as acceleration rather than direct velocity assignment.
- `src/movement/arena-controller.ts` — delegates thrust to `ship.applyThrust()`; arena-boundary bounce applied when ship hits the edge.
- `src/game.ts` — `spawnShipExplosion()` (~25 outward shards, orange/white/yellow), `updateExplosions(deltaTime)` fades & removes, `disposeAllExplosionParticles` prevents leaks; `respawnShip()` triggers the explosion and sets `shipRespawnDelay = 1.0`; input ignored while dead.
- `tests/movement.test.ts` — arena acceleration + respawn state covered by the existing test suite.

Verification: `npm run typecheck` ✅, `npm test` ✅, `npm run build` ✅.
