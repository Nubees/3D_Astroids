# Plan — Passive Shield with Visual Feedback

## Goal
Convert the shield from a manual toggle into a passive armor that absorbs asteroid
hits, drains energy proportional to the asteroid's size, and provides strong visual
feedback: colored HUD percentage, directional light-blue arc flash, HUD shake, and
ship knockback scaled by asteroid size.

## Rules
1. The shield is always **passive** — it protects automatically while it has energy.
2. `C` / RMB key is no longer bound to shield toggle; it is reserved for a future EMP
   pulse ability. The input mapping should be updated and documented.
3. Breather zone recharges the shield while the ship is inside (already implemented).
4. A future shield collectible may also recharge the shield; this plan leaves hooks for it.
5. Larger asteroids drain more shield energy and apply stronger knockback.

## Approach

### 1. Shield state (`src/shield.ts`)
- Remove `active` and `cooldownRemaining` from `ShieldState`. Keep `energy` and
  `hitAbsorbedThisFrame`.
- Add `SHIELD_DAMAGE_BY_SIZE` mapping: small drains 0.20, medium 0.35, large 0.55.
- Add `SHIELD_RECHARGE_PER_SECOND = 0.15` for passive out-of-combat regen (slow).
- Add `SHIELD_RECHARGE_MULTIPLIER` for the breather zone (already exists).
- Add `KNOCKBACK_FORCE_BY_SIZE` mapping for ship bounce.
- Update `updateShield`:
  - Remove input handling.
  - Recharge at `SHIELD_RECHARGE_PER_SECOND` when not in the breather zone.
  - Recharge at breather multiplier when inside the zone.
- Update `absorbHit(shield, size)`:
  - Return false if `energy <= 0`.
  - Drain `SHIELD_DAMAGE_BY_SIZE[size]` from energy, clamped to 0.
  - Set `hitAbsorbedThisFrame = true`.
  - Return true if the ship survived the hit (energy remained >= 0 after drain).
  - Note: if the drain reduces energy to 0 or below, the shield collapses; the ship
    still survives this single hit because the blow was absorbed.

### 2. Input (`src/input.ts`)
- Remove `shield` from the returned `InputState`. `c` and RMB are no longer mapped.
- Add a comment that `c` / RMB are reserved for the future EMP pulse.
- Update existing test fixtures that build `InputState` to drop the `shield` field.

### 3. Game loop (`src/game.ts`)
- Remove `input.shield` from the `updateShield` call.
- Add a new `shieldElement` and `shieldShakeRemaining` HUD state.
- In `updateShield` call, pass whether the ship is inside the breather zone.
- In `handleCollisions`, when a ship-asteroid collision occurs:
  - If shield can absorb, call `absorbHit(shield, asteroid.size)`.
  - On absorption, trigger:
    - Directional arc flash (`spawnShieldArc`) at the contact point.
    - Ship knockback impulse scaled by size.
    - HUD shake timer.
  - If shield cannot absorb, respawn the ship.
- Add `spawnShieldArc(position, normal)` using a partial ring or curved mesh, light
  blue, transparent, added to the ship mesh group so it follows rotation.
- Add `updateShieldArc(deltaTime)` to fade and remove the arc.
- Add `updateShieldHud()` to set color and percentage and apply shake transform.

### 4. Visuals
- Shield arc: `RingGeometry(inner, outer, thetaSegments, phiSegments)` with
  `thetaStart` and `thetaLength` to make a ~90° arc. Orient it with `lookAt` or
  manual rotation to face the impact normal.
- Knockback: add an impulse to `ship.state.velocity` in the collision normal
  direction scaled by `KNOCKBACK_FORCE_BY_SIZE`.

### 5. Tests
- Update `tests/shield.test.ts` to cover passive absorption, size-based damage,
  collapse, and breather recharge.
- Update tests that build `InputState` fixtures to remove `shield`.

### 6. Notes for future mechanics
- EMP pulse: reserved to `c` / RMB. Planned to freeze or destroy enemy missiles.
- Shield collectible: a scrap-like pickup that adds a flat shield recharge.

## Verification
- `npm run typecheck`
- `npm test`
- `npm run build`
- Dev-server screenshot: confirm HUD color changes and arc flash on impact.
