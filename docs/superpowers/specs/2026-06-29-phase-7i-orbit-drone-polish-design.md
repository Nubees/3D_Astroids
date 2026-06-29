# Phase 7i — Orbit Drone Polish (Full Redesign)

**Date:** 2026-06-29
**Branch:** phase-2-movement
**Owner:** Austin + Claude
**Status:** Draft (post-brainstorm, pre-plan)

---

## Context

Phase 7 shipped Orbit Drones as one of three active pickups (alongside
Bomb Strike and Homing Missiles). The current implementation has three
problems that make it feel "plain, simple, not very effective":

1. **Static visual.** The drone mesh is a flat-shaded cyan icosahedron
   (radius 0.12u) that has no per-frame animation. It moves in a circle
   but never spins, pulses, glows, leaves a trail, or fires any visible
   feedback. (`src/active-deployments.ts:189-215`).
2. **Under-tuned DPS.** A single shared `fireTimer` means 2 drones share
   one 0.4s cooldown → **2.5 shots/sec for the whole deployment** (1 HP
   per shot → **15 HP total per 6s window**). Compare to Homing Missiles'
   60 HP instant burst. The drone feels weak. (`active-deployments.ts:270-290`).
3. **Single-tier.** `ORBIT_DRONES_CHARGE_CAP = 2`, but stacking a second
   charge does literally nothing visible — same 2 drones, same fire
   rate, same color. There is no "wow I stacked two" payoff.

The Phase 7i redesign addresses all three with three atomic sprints of
~4 hours each: (1) visual juice, (2) fire pattern, (3) tier scaling.

This spec is the result of a brainstorming session that compared the
current state against research from **Vampire Survivors** (King Bible /
Garlic / Song of Mana / Phieraggi), **Risk of Rain 2** (Drones / Spare
Drone Parts), **Nova Drift** (Drone / Particle Orbit / 3 formations),
**Brotato** (4-tier color convention), **Realm of the Mad God** (pet
auras), **Hades II** (Selene orbit aura), **Path of Exile** (Brand
tether / Animate Guardian), **Diablo III** (Sentry / Marauder
symbiotic-fire), **Soul Knight** (companions), **Archero** (pet aura
rings), **Enter the Gungeon** (Beholster multi-spread), **Devil May Cry**
(Royal Guard Satellite absorb-and-release), **Transistor** (Turn()
freeze-to-read), and **Hyper Light Drifter** (dash echoes).

---

## Goals

- Make the drones feel like **living agents** that actively defend the
  player, not animated dots in a circle.
- Players see stacking charges = visibly stronger (Brotato / RoR2
  Spare Drone Parts convention).
- Every fire event lands with **layered feedback** (scale + emissive
  flash + sparks + tether line + aura pulse) — Vlambeer juice doctrine.
- The deploy moment is **visible** — pickup landing should have a
  shockwave + lerp-in beat (VS Pentagram / D3 Big Bad Voodoo pattern).

## Non-Goals

- **No new sound effects** (project convention: no SFX work outside
  dedicated phase; will reuse existing projectile hit feedback).
- **No changes** to other pickups (Bomb, Missile, Magnet untouched).
- **No per-tier ammo count** beyond the 2→3→4 drone scaling.
- **Drones stay orbital** — no player-positioning or movement control.
- **No new dependencies.** Pure Three.js + project types.

---

## Locked Decisions

| Decision | Value |
|---|---|
| Sprints | All 3 (idle/feel + fire pattern + tier scaling) |
| Tier model | **Charge-stack** — deploy all charges at once |
| Charge cap | `2 → 3` |
| Drones per tier | **2 → 3 → 4** (1 charge / 2 / 3 charges) |
| Fire pattern | **Per-drone independent timer** at 0.4s each |
| Aura ring | **Tier-colored pulsing ring** (cyan / magenta / gold) |
| Tier colors | Tier 1 = `0x66ddff` cyan, Tier 2 = `0xff66dd` magenta, Tier 3 = `0xffcc44` gold |
| Tier 3 color clash | OK — Magnet Booster is gold, both can share (different HUD slot, different mesh family) |
| Sound | **No new SFX** — existing projectile hit feedback only |

---

## File-Level Changes

```
src/pickups.ts                          ← CONSTANTS (charge cap, tier→drone count, tier color)
src/orbit-drone-vfx.ts         (NEW)    ← Pure factory module: createDroneMesh,
                                           createDroneAura, createDroneTether,
                                           createDeployShockwave,
                                           updateDroneVisuals — single home for visuals
src/active-deployments.ts               ← tickDroneDeployments: per-drone fire timer,
                                           tier reads from deployment, per-drone bob/spin/tether
src/game.ts                             ← fireDroneProjectile uses tier-stamped projectile
                                           class + per-drone projectile origin
src/types.ts                            ← DroneDeploymentState gains tier + per-drone fields
index.html                              ← tier color in HUD pill border (cyan/magenta/gold)
tests/orbit-drone.test.ts     (NEW)    ← pure tier math + visual state machine
tests/pickups-active.test.ts            ← extend with charge-stack deploy tests
tests/phase-7i-orbit-polish.spec.ts (NEW) ← Playwright visual confirm
```

**Why split `orbit-drone-vfx.ts` out:** currently `active-deployments.ts`
mixes state machine + visuals. With bob, tether, fire-flash, aura,
deploy-shockwave, kill-spark, the visuals deserve their own factory
module — matches the existing pattern (`missile-vfx.ts`,
`magnet-booster-vfx.ts`).

---

## Behavior Changes

### Tier scaling (Charge-stack)

- `ORBIT_DRONES_CHARGE_CAP = 3` (was `2`)
- `ORBIT_DRONES_TIER_DRONE_COUNT = [2, 3, 4]` indexed by `charges` on deploy
- Single charge → 2 drones (regression: current behavior preserved)
- Two charges → 3 drones (NEW)
- Three charges → 4 drones (NEW, peak)
- Each drone gets a unique phase offset so they're evenly distributed
  around the orbit (no more 180° pairs from `i * π`).

### Firing

- Replace single shared `fireTimer` with `fireTimerPerDrone: number[]`
  (length = droneCount).
- Each drone fires its own timer independently at
  `ORBIT_DRONES_FIRE_INTERVAL_SECONDS = 0.4s`.
- At peak tier: 4 drones × 2.5 shots/s = **10 shots/sec**
  (vs 2.5 today → **4× DPS at peak tier**).
- Projectile **origin** = firing drone's current position (was: ship
  position).
- Projectile **class** unchanged, but **tier-color tints** the
  `MeshBasicMaterial.color`:
  - Tier 1 = `0x66ddff` (cyan, current)
  - Tier 2 = `0xff66dd` (magenta)
  - Tier 3 = `0xffcc44` (gold)

### Targeting

- Drones prioritize: **crystal > non-tiny iron > tiny**.
- New helper `findDroneTarget(asteroids, dronePosition)` —
  prefers crystals via `AsteroidKind.CRYSTAL` filter, then iron by
  Euclidean distance. Skips TINY (per existing `missileIgnoresAsteroid`).

### Lifetime / Cooldown

- 6s active + 0.3s fade + 4s cooldown unchanged.
- Cooldown starts when fade completes (current contract preserved).

### Deploy moment

- On `consumeActiveCharge` for ORBIT_DRONES, spawn a single ship-centered
  expanding `RingGeometry` (scale 0.5→2.0, opacity 1→0 over 250ms,
  tier color).
- Drones **lerp from orbit-radius 0 → 1.5u** over 500ms with overshoot
  easing (cubic ease-out). Single visible "upgrade landing" beat.

### Idle vibe (per-frame, per-drone)

- Each drone has unique `bobPhase` (random in [0, 2π] at deploy time).
- **Y-bob**: `0.08 * sin(t * 1.2 * TAU + bobPhase)` on top of orbit
  position (2 Hz wobble).
- **Y-rotation**: `mesh.rotation.y += 90°/s * dt`.
- **X-rotation**: `mesh.rotation.x += 60°/s * dt` (independent axis).

### Aura ring

- `RingGeometry(0.6, 1.4, 48)` laid flat on XZ plane, parented to ship.
- `MeshBasicMaterial({ color: <tier>, transparent: true,
  opacity: 0.35, blending: AdditiveBlending, side: DoubleSide,
  depthWrite: false })`.
- Per-frame opacity pulse: `0.35 + 0.25 * sin(t * 4)` (2 Hz pulse).
- Per-fire flash: ramp to `1.0` for 80ms then decay back to baseline.
- Tier colors per above.

### Tether line

- For each drone with a current target, render a thin `Line`
  (`BufferGeometry` of 2 points, `LineBasicMaterial` with additive
  blending and opacity 0.25) from drone.position → target.position.
- **Only visible when target is acquired**; line removed when null.
- Optional small lock-on Sprite at target position (cyan diamond, 0.15u,
  tier color) — same tier color, additive blending.

### Per-fire feedback on the drone mesh

- **Scale pop**: 1.0 → 1.15 → 1.0 over 80ms (cubic ease).
- **EmissiveIntensity flash**: 0.8 → 2.5 → 0.8 over 100ms.
- **6 cyan spark Sprites** emitted outward at fire direction, lifetime
  200ms each (reuse existing pattern from `missileExplosion.ts`).

### Kill confirmation

- When a drone projectile kills an asteroid, spawn a small outward
  radial burst at the kill point — 12 sparks, 0.4s lifetime, tier color.
- Reuse the existing missile-killed spark factory.
- Wire via the existing `KillSource` parameter (Phase 7c) — drone kills
  tagged `KillSource.DRONE`.

---

## Data Flow

```
Player presses Digit2
  ↓
input.useActive2 → useActiveItem(ORBIT_DRONES)
  ↓
consumeActiveCharge(ORBIT_DRONES) → ammo.charges -= 1
  ↓
deployOrbitDrones(state, tier = ammo.charges + 1)
  │   Creates DroneDeploymentState:
  │     - tier (1/2/3)
  │     - droneMeshes: Mesh[]   (length = TIER_DRONE_COUNT[tier])
  │     - auraMesh: Mesh
  │     - deployShockwave: Mesh (single 250ms ring expanding)
  │     - perDrone: { phaseOffset, bobPhase, fireTimer, fireFlash,
  │                   fireFlashAge, currentTarget, tetherLine,
  │                   lockOnSprite }[]
  │   Spawns deploy shockwave
  ↓
every frame: tickDroneDeployments(state, dt, ship, asteroids, missiles)
  │   for each drone:
  │     - update orbit position
  │     - update rotation (Y + X axes)
  │     - update fire flash age (if > 0, decay)
  │     - decrement fireTimer; if ≤ 0 → fireDroneProjectile,
  │       reset to 0.4
  │     - update bob (Y offset)
  │     - update lock-on sprite position
  │   update aura opacity pulse
  │   update tether lines (recompute endpoints)
  │   decrement remaining; if ≤ 0 → start fade timer;
  │   if fade done → dispose all meshes, materials, geometries
  ↓
fireDroneProjectile(drone, ship, asteroids, tier)
  │   findDroneTarget(asteroids, drone.position)
  │   if target found:
  │     spawn projectile at drone.position aimed at target.position
  │     projectile class: tier-colored MeshBasicMaterial
  │     drone.fireFlash = 1.0; drone.fireFlashAge = 0
  │     schedule 6 sparks at drone.position outward
  ↓
projectile collision → destroyAsteroid(source: KillSource.DRONE, tier)
  │   if asteroid HP <= 0:
  │     spawn kill sparks at hit point (tier color)
  │     existing crystal-fracture + score still applies
```

---

## Testing & Verification

### Unit tests (`tests/orbit-drone.test.ts`, NEW)

- `tierDroneCount(1) === 2`, `(2) === 3`, `(3) === 4`
- `tierColor(1) === 0x66ddff`, `(2) === 0xff66dd`, `(3) === 0xffcc44`
- `bobOffset(t, phase) === sin(t * 1.2 * TAU + phase) * 0.08`
  (deterministic at any t)
- `fireFlashCurve(age 0..80ms) === 1 - age/80` then `0` after 80ms
- Per-drone fire timer ticks independently — drone 1 fires while
  drone 2 is mid-cooldown (mock state, no scene).
- 4 drones at peak: 10 shots/sec sustained (statistical over 1s window).

### Extend `tests/pickups-active.test.ts`

- Charge-stack deploy: 3 charges → 4 drones deployed on Digit2 press
- 1 charge → 2 drones (regression)
- Charge cap is now 3 (not 2)
- Cooldown 4s after deploy expires, not after fade (regression)

### Playwright spec (`tests/phase-7i-orbit-polish.spec.ts`, NEW)

- Spawn at asteroid-rich scene, deploy 1 charge → screenshot
  (single tier aura cyan, 2 drones).
- Stack to 3 charges, redeploy → screenshot
  (gold aura, 4 drones).
- Fire 20+ shots → verify kill sparks + kill flash on asteroid.

### Quality gates (per sprint)

Per `.claude/rules/workflow-gates.md`, gates MUST be selected via
`AskUserQuestion` (multi-choice). Defaults:

- **Sprint 1** (visual only): typecheck + unit + build
- **Sprint 2** (fire pattern): typecheck + unit + Playwright + build
- **Sprint 3** (tier scaling): typecheck + unit + Playwright + build

### Commit strategy (3 atomic commits)

- Sprint 1 commit:
  "Phase 7i Sprint 1 — orbit drone juice (idle bob + aura + fire flash + tether)"
- Sprint 2 commit:
  "Phase 7i Sprint 2 — orbit drone fire pattern (per-drone timer + deploy shockwave + kill sparks)"
- Sprint 3 commit:
  "Phase 7i Sprint 3 — orbit drone tier scaling (2→3→4 charges, tier colors, charge-stack deploy)"

User pushes manually per project convention after all 3 sprints land.

---

## Anti-Patterns Avoided

- **Karpathy Method:** minimum code per feature; no premature
  abstractions; no "configurability" not requested.
- **"My Rules" block** at top of every new/modified file (Purpose,
  Setup, Issues, Fix, Gotchas).
- **No `require('three')` inline** (`feedback_require_three_freeze.md`) —
  all imports added to existing import blocks.
- **No additive-blending white-out**
  (`feedback_additive_blending_whiteout.md`):
  - Aura ring opacity capped at 0.6 peak (per fire flash).
  - Spark sprites capped at 0.4 opacity per source.
  - Tether line opacity capped at 0.25.
  - Multiple sources never stack on the same pixel simultaneously
    (deploy-shockwave disposes at 250ms, aura pulse is steady-state
    only).
- **Test stability:** existing 254 tests pass through all 3 commits;
  new tests additive.
- **Phase 7 atomics convention:** ONE commit per sprint.
- **No push without user push.**
- **No scope creep** into Phase 8 / 9 (end-of-run menu / meta-progression).

---

## Carryover Notes

- **Spec covers ALL three sprints in one place** because the tier
  scaling depends on the visual layer being in place first (you can't
  show "tier 3 = gold" without the aura ring being built). Each
  sprint is independently shippable.
- **The `KillSource.DRONE` enum value** must be added to `types.ts`
  in Sprint 2 if it doesn't already exist (Phase 7c added BOMB / MISSILE
  / PLAYER values; verify before adding).
- **Index.html HUD tier-color change** is a small CSS update for the
  pill border (cyan → magenta → gold based on current charges).
- **Spark factory reuse:** the `missileExplosion.ts` spark pool is the
  pattern to copy. Do not introduce a second spark factory.
- **The `active-deployments.ts` file** may exceed the 800 LOC guideline
  after Sprint 2 — consider splitting the fire-shot logic into its
  own helper inside `orbit-drone-vfx.ts` if needed.

---

## Self-Review

- ✅ **Spec coverage:** Goals + Non-Goals + Decisions + File map +
  Behavior + Data flow + Tests + Anti-patterns all sectioned.
- ✅ **Placeholder scan:** No "TODO" / "TBD" — every constant named
  with explicit value.
- ✅ **Internal consistency:** Tier math (1 charge→2 drones, 2→3, 3→4)
  matches the user's locked choices. Tier colors match. Charge cap
  change (2→3) matches the tier math.
- ✅ **Scope check:** 3 sprints, ~12 hr total, fits single
  implementation plan with checkpoint commits.
- ✅ **Ambiguity:** All timing constants (0.4s, 80ms, 100ms, 250ms,
  500ms, 1.2 Hz, 90°/s, 60°/s) explicit; all radii (0.08 bob,
  1.4 outer ring, 1.5 orbit) explicit.

---

## Next Step

User approves → invoke writing-plans skill to produce
`docs/superpowers/plans/2026-06-29-phase-7i-orbit-drone-polish.md`.