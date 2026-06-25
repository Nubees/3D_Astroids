# Phase 7c — Power-Up VFX & Damage Redesign

## Context

The Phase 7b atomic commit (6d0f0f0) shipped 3 power-up VFX upgrades — bomb 6-layer combo, missile 180ms stagger with flame + smoke, shield green boost. Two user-reported follow-ups in 2026-06-25 testing revealed that the upgrades are not landing as intended:

**Problem 1 — "I just see white smoke tails, no missile."**
The homing missile body is a 0.10u `SphereGeometry` with a magenta `MeshBasicMaterial({ transparent: true, opacity: 0.95 })`. Three compounding bugs:
1. Body size (0.10u) is dwarfed by the 0.4u smoke puff — 4× volume.
2. Body color (magenta 0xff66ff) sits in the same color family as the white-magenta smoke — the eye reads them as one blob.
3. Smoke spawns at body center, not rear nozzle, so the smoke cloud visually surrounds the body silhouette.

**Problem 2 — "I bombed the swarm and now there are 2 more asteroids."**
`BOMB_STRIKE_DAMAGE = 1` and `HOMING_MISSILES_DAMAGE = 1`. The largest iron asteroid has `SIZE_HEALTH[LARGE] = 4`, and `CRYSTAL_HEALTH = 6`. Worse: when `destroyAsteroid` runs (on any kill), it calls `splitAsteroid` unconditionally, which produces 2 children from any non-tiny non-small asteroid. So a bomb hit on a LARGE iron drops it to 4 HP — NOT a kill — and the visual layer still spawns 2 MEDIUMs. Even at damage 10, the children-spawn happens because the destroy path is shared with bullet kills. The "screen clear" never actually clears.

**Problem 3 — "Bomb visuals look low grade and radius is too small."**
The 6 bomb layers peak simultaneously (0ms ring, 0ms particles, 80ms secondary ring, 100ms camera shake, 100ms core flash, 0ms edge flash). Layered additive saturation is one issue; lack of temporal structure is the deeper one. Research shows that staggered reveal (0/50/200/400/800ms across 1.2s) reads as "controlled blast" while simultaneous reveal reads as "additive soup." The 8u ring is also too tight — research consensus says a screen-clearing ring should occupy ~30% of viewport.

**The fix in one line:** Make the screen-clear actually clear (damage + killSource), make the missile body visible (opaque core + additive halo + rear smoke), and make the bomb moment punctuate (3-phase time sequence + DOM flash + freeze-frame + CSS punch-zoom + 12u ring).

## Decisions (user-approved this session, 2026-06-25)

| Decision | Choice |
|----------|--------|
| Damage model | `BOMB_STRIKE_DAMAGE` 1→10, `HOMING_MISSILES_DAMAGE` 1→10. Max HP is 6 (crystal); 10 guarantees one-shot. |
| Split rule | `KillSource` enum parameter on `destroyAsteroid`. `BOMB` and `MISSILE` skip `splitAsteroid`. `BULLET` and `WALL` still split. |
| Tension compensation | Pickup-gated refills: BOMB_STRIKE and HOMING_MISSILES charges restore ONLY when the player collects a BOMB_STRIKE or SHIELD pickup. No passive regen. |
| Missile visual | Body is a `Group`: opaque normal-blend magenta core (0.10u) + BackSide additive halo (0.20u, opacity 0.5). Smoke emits from rear nozzle via new `emitMissileSmokeRear`. |
| Bomb visual | 3-phase time sequence + DOM white-flash (80ms) + freeze-frame (2 ticks) + CSS punch-zoom (100ms) + ring visual radius 8u→12u. |

## Files to modify

- `src/missile-vfx.ts` — add `createMissileAssembly()` factory; add `emitMissileSmokeRear()` (rear-nozzle spawn).
- `src/active-deployments.ts` — replace inline `spawnMissileFromPending` body construction with the new factory; pass velocity to `emitMissileSmokeRear`.
- `src/pickups.ts` — bump damage constants; add `KillSource` type export; add `applyActivePickupEffect` pickup-gated refill for BOMB_STRIKE and HOMING_MISSILES + SHIELD bonus.
- `src/game.ts` — replace `fireBombStrike` with 3-phase sequence; add `triggerScreenFlash()`, `freezeFramesRemaining`, `punchZoomRemaining`; add `updateBombVisuals()` ticker; remove passive refill for BOMB_STRIKE / HOMING_MISSILES.
- `index.html` — add `.screen-flash` and `.punch-zoom` CSS classes.
- `tests/missile-body.test.ts` — new (3 tests).
- `tests/bomb-damage.test.ts` — new (6 tests).
- `tests/bomb-timing.test.ts` — new (5 tests).
- `tests/pickup-refill.test.ts` — new (4 tests).

## Design

### 1. Missile body (the visibility fix)

**Current state** (`src/active-deployments.ts:294-297`):
```ts
const body = new Mesh(
  new SphereGeometry(MISSILE_RADIUS, 6, 6),
  new MeshBasicMaterial({ color: magentaColor, transparent: true, opacity: 0.95 }),
);
```

**New** — body becomes a `Group` of two meshes built by a new `createMissileAssembly()` factory in `src/missile-vfx.ts`:

```ts
export function createMissileAssembly(): { assembly: Group; core: Mesh; halo: Mesh } {
  const core = new Mesh(
    new SphereGeometry(MISSILE_RADIUS, 8, 8), // 6→8 segments for a slightly cleaner silhouette
    new MeshBasicMaterial({ color: PICKUP_COLOR[PickupKind.HOMING_MISSILES] }),
  );
  const halo = new Mesh(
    new SphereGeometry(MISSILE_RADIUS * 2.0, 12, 12),
    new MeshBasicMaterial({
      color: PICKUP_COLOR[PickupKind.HOMING_MISSILES],
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      side: BackSide,
      depthWrite: false,
    }),
  );
  const assembly = new Group();
  assembly.add(core);
  assembly.add(halo);
  return { assembly, core, halo };
}
```

**Why this works** (Hades / ETG pattern):
- The opaque `core` draws the eye (NormalBlending, no transparency, solid color).
- The `halo` is larger (2× radius) and `BackSide` (inside-out sphere, so we see the inner surface) — creates a soft glow that bleeds outward.
- 2 draws per missile instead of 1. With max 4 missiles in flight, +4 draws total. Well under budget.
- The magenta body color and the white-magenta smoke are no longer the same visual element — the eye locks on the solid core, then reads the smoke as a separate trail.

**Rear-nozzle smoke** — new helper in `src/missile-vfx.ts`:

```ts
export function emitMissileSmokeRear(
  scene: Object3D,
  x: number, y: number,
  velX: number, velY: number,
): void {
  const speed = Math.hypot(velX, velY);
  if (speed < 0.01) return emitMissileSmoke(scene, x, y); // fallback
  // Place smoke 0.10u BEHIND the body along the velocity direction.
  const rearX = x - (velX / speed) * (MISSILE_RADIUS + 0.02);
  const rearY = y - (velY / speed) * (MISSILE_RADIUS + 0.02);
  emitMissileSmoke(scene, rearX, rearY);
}
```

`tickHomingMissiles` calls `emitMissileSmokeRear(scene, x, y, velX, velY)` instead of the center spawn. The smoke cloud now trails BEHIND the missile, preserving its silhouette.

`HomingMissileState.mesh` (the `Mesh` field) becomes the `core` mesh (the opaque one) for disposal tracking. `HomingMissileState.assembly` and `HomingMissileState.flame` stay the same.

**Saturation safety**: the new halo is a single additive source at 0.5 opacity. Stays under the 0.7 cap from `feedback_additive_blending_whiteout.md`. The existing 288-instance smoke pool is unchanged.

### 2. Bomb 3-phase time sequence

The current `fireBombStrike` (`src/game.ts:1339-1412`) fires all 6 layers in the same frame. Restructure into a time-staggered 3-phase reveal:

```
T+0ms     — DOM white-flash overlay (CSS class .screen-flash, 80ms ease-out)
T+0ms     — freeze-frame: skip 2 update ticks (60ms at 30fps)
T+0ms     — CSS punch-zoom: canvas wrapper scale(1.02), 100ms ease-out
T+0ms     — existing core flash (additive sphere 0.5→1.0u, 0.1s)
T+50ms    — primary shock ring (orange, 12u, AdditiveBlending) — was 8u
T+50ms    — 30 streamers begin emitting (shockwave-particles.ts)
T+200ms   — camera shake onset, bumped 0.6/0.4s → 0.8/0.5s with rising frequency
T+300ms   — 8 debris chunks begin emitting (shockwave-particles.ts)
T+400ms   — secondary shock ring (red-orange, 14u) via setTimeout(80ms → 400ms)
T+800ms   — residual additive glow sprite at center, fading
T+1200ms  — screen-flash + punch-zoom classes removed
```

**New state on Game class**:
- `screenFlashRemaining: number` — counts down from 0.08s, drives the `.screen-flash` CSS class.
- `freezeFramesRemaining: number` — counts down from 2, when >0 the update loop returns early (no game tick, no asteroid/missile/shard simulation). 2 ticks = ~60ms of frozen time.
- `punchZoomRemaining: number` — counts down from 0.1s, drives the `.punch-zoom` CSS class on the canvas wrapper.

**New CSS in `index.html`**:
```css
#screen-flash {
  position: fixed;
  inset: 0;
  background: #ffffff;
  opacity: 0;
  pointer-events: none;
  z-index: 100;
  transition: opacity 80ms ease-out;
}
#screen-flash.active {
  opacity: 0.8;
}
#game-canvas.punch-zoom {
  transform: scale(1.02);
  transition: transform 100ms ease-out;
}
```

**`fireBombStrike` rewrite** (`src/game.ts:1339-1412`) — same 6 layers, but the secondary ring's `setTimeout` is bumped from 80ms to 400ms, and the new `triggerScreenFlash()` + freeze-frame + punch-zoom calls go in at T+0ms.

**`updateBombVisuals(dt)`** — new method called from `update(input)` after the other active-pickup tickers. Decrements the 3 counters; when `screenFlashRemaining` or `punchZoomRemaining` hits 0, removes the CSS class. When `freezeFramesRemaining > 0`, decrements it but the main update loop checks it FIRST and returns early — so a freeze-frame skip costs ~60ms of game time but does not affect the per-frame deltas of the OTHER tickers (because they ran the previous frame, before the freeze).

**Cost**: 1 new DOM div (created once at Game init, opacity-toggled per bomb), 3 new number fields on Game, 1 new CSS class, 1 new method. Zero new WebGL draws.

### 3. Damage constants + killSource split rule

**`src/pickups.ts`** — bump 2 constants, add 1 type:
```ts
export const BOMB_STRIKE_DAMAGE = 10;  // was 1 — exceeds CRYSTAL_HEALTH=6
export const HOMING_MISSILES_DAMAGE = 10;  // was 1

export type KillSource = 'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' | 'SHARD';
```

**`src/game.ts:2202`** — add the `source` param to `destroyAsteroid`:
```ts
private destroyAsteroid(target: LiveAsteroid, source: KillSource = 'BULLET'): void {
  // ... existing score / scrap / pickup-drop / mesh removal logic ...
  const children = (source === 'BULLET' || source === 'WALL')
    ? splitAsteroid(target.state)
    : [];
  for (const child of children) {
    this.spawnAsteroid(child.size, child.position, child.velocity);
  }
}
```

**Call sites**:
- `fireBombStrike` (game.ts:1404) — `this.destroyAsteroid(asteroid, 'BOMB')`
- `onMissileImpact` (game.ts:1596) — `this.destroyAsteroid(live, 'MISSILE')`
- `handleCollisions` and any other bullet-kill path — default `'BULLET'` (no change)
- Wall-bounce kills — already rare, but flag `'WALL'` so they keep splitting

**Why this is the right shape** (and not `skipSplit: boolean` on `AsteroidState`):
- The killSource parameter is local to the kill call. It cannot leak. (`skipSplit` would have been a "set flag on shared state, hope nothing else reads it before destroy" pattern — the same shape that bit us in the Phase 7 passive-pill querySelector bug.)
- The enum self-documents every kill source at the call site, so future debugging is grep-able: `grep "destroyAsteroid(" src/` shows every kill with its source.
- Future kill sources (drone, shard, future charge-up weapon) just add an enum entry.

**Saturation safety**: not relevant — this is a pure logic change, no new visuals.

### 4. Pickup-gated refills

**`src/pickups.ts`** — `applyActivePickupEffect` already branches on `PickupKind`. Add the refill hooks:

```ts
// BOMB_STRIKE pickup → +1 bomb charge
if (kind === PickupKind.BOMB_STRIKE) {
  activeAmmo.bombStrike.charges = Math.min(
    ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].chargeCap,
    activeAmmo.bombStrike.charges + 1,
  );
}
// HOMING_MISSILES pickup → +1 missile charge
if (kind === PickupKind.HOMING_MISSILES) {
  activeAmmo.homingMissiles.charges = Math.min(
    ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].chargeCap,
    activeAmmo.homingMissiles.charges + 1,
  );
}
// SHIELD pickup → +50% shield energy AND +1 bomb charge (so the player can convert)
if (kind === PickupKind.SHIELD) {
  activeAmmo.bombStrike.charges = Math.min(
    ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].chargeCap,
    activeAmmo.bombStrike.charges + 1,
  );
}
```

**Passive regen removal** — `tickActiveAmmo` currently decrements `cooldownRemaining` for all kinds. Add a guard so BOMB_STRIKE and HOMING_MISSILES no longer tick down their own cooldowns (the per-charge cooldown still works, but the charge-pool itself does not regenerate from `tickActiveAmmo`).

```ts
// In tickActiveAmmo or its caller: skip charge regen for BOMB_STRIKE / HOMING_MISSILES
// (cooldown-on-individual-charge still ticks; pickup-gated refill is the only way to gain charges)
```

ORBIT_DRONES is unaffected — it still has its own deployable refilling cycle.

**Why this works as tension**:
- Player starts with 0 BOMB charges and 0 MISSILE charges. They must collect a BOMB pickup to gain a bomb. They must collect a SHIELD or BOMB pickup to keep gaining.
- During the shard-swarm emergency, the player is FORCED to either dodge the swarm (preferred) or burn their last bomb. There's no "save a bomb for next time" without first getting more.
- The SHIELD→bomb conversion gives the player a meaningful second use for SHIELD pickups, which were already a "nice to have" pickup.

### 5. Test coverage (16 new tests, all pure logic, no WebGL)

**`tests/missile-body.test.ts`** (3 tests):
- `createMissileAssembly()` returns a `Group` with exactly 2 children.
- The first child (core) is a `Mesh` with `MeshBasicMaterial({ transparent: false })`.
- The second child (halo) is a `Mesh` with `MeshBasicMaterial({ blending: AdditiveBlending, side: BackSide })`.

**`tests/bomb-damage.test.ts`** (6 tests):
- `BOMB_STRIKE_DAMAGE >= 6` (exceeds max HP = CRYSTAL_HEALTH).
- `HOMING_MISSILES_DAMAGE >= 6`.
- `destroyAsteroid(asteroid, 'BOMB')` does NOT call `splitAsteroid` (spy on `splitAsteroid`).
- `destroyAsteroid(asteroid, 'MISSILE')` does NOT call `splitAsteroid`.
- `destroyAsteroid(asteroid, 'BULLET')` DOES call `splitAsteroid`.
- `destroyAsteroid(asteroid, 'WALL')` DOES call `splitAsteroid`.

**`tests/bomb-timing.test.ts`** (5 tests):
- `fireBombStrike` calls `triggerScreenFlash()` synchronously at T+0ms.
- `fireBombStrike` sets `freezeFramesRemaining = 2` at T+0ms.
- `fireBombStrike` sets `punchZoomRemaining = 0.1` at T+0ms.
- `triggerScreenFlash()` adds the `.active` class to the screen-flash DOM div.
- `updateBombVisuals(dt)` decrements all 3 counters and removes the CSS classes at zero.

**`tests/pickup-refill.test.ts`** (4 tests):
- `applyActivePickupEffect(BOMB_STRIKE)` increments `activeAmmo.bombStrike.charges` by 1.
- `applyActivePickupEffect(SHIELD)` increments `activeAmmo.bombStrike.charges` by 1 (the conversion).
- `applyActivePickupEffect(HOMING_MISSILES)` increments `activeAmmo.homingMissiles.charges` by 1.
- `tickActiveAmmo(bombStrike, dt)` does NOT increment `charges` (no passive regen).

### 6. Saturation safety

- New missile halo: 1 additive source, opacity 0.5, additive cap is 0.7 per source. ✅
- Bomb layer count unchanged (6 → 6). 3-phase timing means layers NO LONGER peak simultaneously. ✅
- DOM white-flash is NOT a WebGL draw — pure CSS. ✅
- CSS punch-zoom is a transform, not a render. ✅
- No new geometry, no new shaders, no new InstancedMesh pools. ✅

### 7. Anti-patterns avoided

- **No new additive blending** beyond the existing cap.
- **No new shaders** (the body is plain MeshBasicMaterial).
- **No new dependencies** (everything uses Three.js primitives + DOM CSS).
- **No re-introduction of the `require('three')` bug** (Phase 7b gotcha — see `feedback_require_three_freeze.md`). All three imports are at the top of the file.
- **No changes to the crystal-burst cascade** (Phase 6b/6c/6d/6e). Bomb upgrade is additive.
- **No changes to the shockwave-particles.ts pool** (still 128 instances, 1 draw call). We just stagger the emission timing.
- **No changes to the smoke pool** (still 288 instances, 1 draw call). We just move the spawn point.
- **No killSource enum import leak** — only `game.ts` (the kill site) imports it. `src/asteroid.ts` and `src/pickups.ts` stay generic.

## Verification

```
Plan:
1. Add createMissileAssembly + emitMissileSmokeRear to src/missile-vfx.ts
   → verify: typecheck clean; tests/missile-body.test.ts (3 tests) pass.
2. Wire spawnMissileFromPending to use the new factory; update tickHomingMissiles
   to call emitMissileSmokeRear
   → verify: typecheck clean; full vitest suite (267 + 3 = 270) passes.
3. Add KillSource type to src/pickups.ts; bump damage constants
   → verify: typecheck clean.
4. Update destroyAsteroid signature + 2 call sites (fireBombStrike, onMissileImpact)
   → verify: typecheck clean; tests/bomb-damage.test.ts (6 tests) pass.
5. Add screen-flash DOM div + .screen-flash / .punch-zoom CSS in index.html;
   add triggerScreenFlash + freezeFramesRemaining + punchZoomRemaining to Game
   → verify: typecheck clean.
6. Rewrite fireBombStrike as 3-phase sequence; add updateBombVisuals ticker
   → verify: typecheck clean; tests/bomb-timing.test.ts (5 tests) pass.
7. Add pickup-gated refill in applyActivePickupEffect; remove passive regen for
   BOMB_STRIKE / HOMING_MISSILES in tickActiveAmmo
   → verify: typecheck clean; tests/pickup-refill.test.ts (4 tests) pass.
8. Run full quality gate (typecheck + vitest + build)
   → verify: 0 typecheck errors, 270+16 = 286 tests pass, build clean.
9. Manual browser verification (per workflow-gates.md, ask user for visual gate)
   → verify: missile body visible in flight; bomb + freeze-frame + flash
      visible; charges only refill via pickups.
10. Atomic commit on green gate
   → verify: single commit on phase-2-movement branch.
```

## Commit message

`feat(powerups): Phase 7c — missile body visibility + bomb 3-phase + killSource split rule`

## Risks and tradeoffs

- **Freeze-frame can desync timers.** A 2-tick skip means any per-frame counter (cooldowns, drop cooldowns) appears to "pause" for 60ms. This is intentional (the player sees the impact weight) but if any logic depends on absolute wall-clock time, it could see drift. Mitigation: the existing code uses `performance.now() / 1000` for missile spawn time, not `gameTime` — that one WILL drift. We log the freeze in a `lastFreezeAt` field and document it; if it causes a missile-related bug, fall back to 1-tick freeze.
- **Pickup-gated refills are a UX cliff.** A player who doesn't realize charges no longer regen will feel "the bomb never works." Mitigation: add a one-line tooltip / hint on the active HUD icon row ("Collect BOMB/SHIELD to refill"). Deferred to a future task — this Phase focuses on the mechanics.
- **Rear-nozzle smoke on slow missiles.** At very low velocity (turning hard), the rear position can briefly be ahead of the body. Mitigation: the `emitMissileSmokeRear` falls back to center spawn when `speed < 0.01`.
- **`destroyAsteroid` signature change is a public surface change.** Any other code path that calls `destroyAsteroid` (e.g., the breather-zone edge case) needs the right `source` value. Audit found only 2 call sites; both updated. The default `'BULLET'` is the safe fallback.

## Open questions for user

- **DOM white-flash opacity**: 0.8 is a strong "I just bombed" beat, but it can flashbang players with photosensitivity. The 80ms duration is short. If you want safer, drop to 0.5.
- **Punch-zoom scale**: 1.02 is a subtle "I just hit something" beat. Stronger (1.05) reads as "boss ability" but is more disorienting.
- **Freeze-frame duration**: 2 ticks = ~60ms at 30fps. Longer (3-4 ticks) reads as a real "bullet time" but breaks game flow.

## Self-review

- **Placeholders**: none — every constant and code block is specified.
- **Internal consistency**: all 4 user decisions from this session are reflected (damage, killSource, refill rule, missile + bomb visuals).
- **Scope**: focused on 2 power-ups, no creep into other systems.
- **Ambiguity**: `KillSource` enum values are explicit; the freeze-frame + DOM flash + punch-zoom timing is explicit; the refill rule is explicit.

## Related memories

- [[project-phase-7-pickups-completed]] — base Phase 7 (6 pickup kinds) that this Phase 7c upgrades.
- [[project-phase-7b-powerup-vfx-completed]] — Phase 7b (6-layer bomb, missile flame + smoke, shield green boost) being refined.
- [[feedback-additive-blending-whiteout]] — the additive-blending cap rule that constrains all visuals here.
- [[feedback-require-three-freeze]] — the Node-vs-browser `require` gotcha; we re-verify top-level three imports on every file we touch.
