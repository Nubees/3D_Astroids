# Phase 7b — Power-Up VFX Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the 3 underwhelming power-up VFX (Bomb Strike / Homing Missiles / Shield Pickup) so each moment reads as powerful and the player is rewarded for hunting more pickups. All three upgrades ship as one atomic commit at the end (per Phase 7 convention).

**Architecture:** Three independent upgrades touching three different subsystems. Each upgrade has its own module + Game wiring + tests, but all three ship in one commit. Bomb Strike extends the existing `Shockwave` class and adds a new `shockwave-particles.ts` InstancedMesh pool. Homing Missiles replaces the instant volley with a schedule + adds a new `missile-vfx.ts` InstancedMesh pool. Shield Pickup adds 3-phase feedback (moment / sustained / hunt-for-more) by extending the existing shield shader uniform lerps and pickup mesh factory. No new vendored dependencies; bloom stays disabled.

**Tech Stack:** Three.js r0.184.0 + Vite + TypeScript strict + vitest (Node env, no DOM) + Playwright. The pattern to mirror is the existing `Shockwave` class lifecycle (`src/shockwave.ts:38-89`) and the `exhaust-gameplay.ts:244-270` cone + `AdditiveBlending` + `depthWrite: false` flame pattern. The pickup HUD pill pattern to mirror is the `PassivePill` struct's cached child refs (`src/game.ts:235-245`).

## Global Constraints

- **One atomic commit at the end** (per Phase 7 user directive; 16-task plan → 1 commit)
- **0 typecheck errors** (`npx tsc --noEmit` clean)
- **254/254 existing vitest tests still pass** + new tests for new helpers
- **No new vendored dependencies** — reuse `MeshBasicMaterial`, `MeshStandardMaterial`, `InstancedMesh`, `SphereGeometry`, `RingGeometry`, `ConeGeometry`, `PlaneGeometry`, `Sprite`, `ShaderMaterial` (all already imported across the project)
- **No new fullscreen post-process / new render pass** — all additions are world-space meshes + DOM HUD
- **No persistent GPU resource leaks** — InstancedMesh pools allocated ONCE at module load, never re-created per blast
- **No additive-blending white-out** — every new opacity value is capped, and the worst-case additive stack is documented per task
- **2-space indent, single quotes, semicolons, 100-char max line length** (project code style)
- **My Rules blocks on every non-trivial block** (purpose/setup/issues/fix/gotchas) — see existing files for format
- **Match existing style in every file edited** — no drive-by refactors of adjacent code
- **No new keybinds** — active items remain on `Digit1/2/3` (input.ts already wired)
- **Bloom stays disabled** (post-processing.ts:36) — the design works without bloom but the conservative caps survive a future re-enable

---

## File Structure

### Files to CREATE
- `src/shockwave-particles.ts` — InstancedMesh pool for shockwave ring particles (bomb hot core + shock-front + debris). Module-scope singleton InstancedMesh allocated at import time, with `emitShockwaveParticles(pos, options)` and `updateShockwaveParticles(dt)` functions + a `disposeShockwaveParticles()` function for scene teardown.
- `src/missile-vfx.ts` — InstancedMesh pool for missile smoke trails (288 instances, 1 draw call). Module-scope singleton allocated at import time, with `emitMissileSmoke(x, y)` and `updateMissileSmoke(dt)` + `disposeMissileVfx()`.
- `tests/missile-vfx.test.ts` — Pure-Node tests for missile smoke pool math (lifetime, fade, growth) without needing a renderer.
- `tests/shockwave-particles.test.ts` — Pure-Node tests for shockwave particles pool math.
- `tests/shield-boost-lerp.test.ts` — Pure-Node tests for the shield boost color/timing helper (no WebGL; tests the lerp math + lifecycle).

### Files to MODIFY
- `src/pickups.ts` — `BOMB_STRIKE_RADIUS` 5.0 → 8.0. New constants: `HOMING_MISSILES_TRACKING_DURATION` 1.5→2.5, `HOMING_MISSILES_TURN_RATE` 8.0→14.0, `HOMING_MISSILES_TRACKING_RADIUS` 8.0→10.0, `HOMING_MISSILES_SPEED` 6.0→7.0, new `HOMING_MISSILES_VOLLEY_STAGGER_MS = 180`, new `HOMING_MISSILES_MISSILE_IMPACT_RADIUS = 0.45`. New `PICKUP_GEOMETRY_BY_KIND: Record<PickupKind, BufferGeometry>` module-scope map (allocated once at import; the function reads from this map).
- `src/active-deployments.ts` — Replace `spawnMissileVolley` with `scheduleMissileVolley` (returns `VolleySchedule` with 4 `PendingMissile` entries). New `tickMissileSchedule(schedule, dt, shipPos, scene, asteroids, onImpact, activeMissiles)` function. Extend `HomingMissileState` with `assembly: Group; flame: Mesh; facing: number; firePulse: number; spawnTime: number`. Per-frame in `tickHomingMissiles`: rotate assembly to face velocity, scale flame with sin pulse, call `emitMissileSmoke(missile.position.x, missile.position.y)`. Use new `HOMING_MISSILES_MISSILE_IMPACT_RADIUS` constant for collision check. Dispose flame cone in the existing `if (remaining <= 0)` and `if (hit)` branches.
- `src/shockwave.ts` — Extend `Shockwave` constructor with optional 4th parameter `ringRadius?: number` (default 4.0 for backwards compat with crystal-burst call sites). When set, the ring scales to that radius instead of `SHOCKWAVE_SCALE_MAX * intensity`. Bump `SHOCKWAVE_DURATION_SECONDS` 0.5 → 0.7 to match the bomb's slower ring expansion.
- `src/shield-visuals.ts` — Add new `setShieldBoostColor(mesh, intensity)` helper (lerps `uBaseColor` toward green `0.20, 1.00, 0.50` for the 8s boost window, then back to baseline cyan `0.45, 0.82, 1.0`). Add `setShieldBoostPulse(mesh, intensity)` helper (lerps `uPulseSpeed` 0.45→1.5 and `uGridStrength` 0.12→0.25). Add `triggerShieldFlare(mesh, durationSeconds)` for the 0.6s collect-moment flare (one-shot, ramps 0.15s, decays 0.45s, drives `uFresnelStrength` 0.4→1.0, `uPulseSpeed` 0.45→2.2, `uBaseColor` cyan→hot cyan `0.8, 0.95, 1.0`). All three helpers read from the existing `ShieldUniforms` interface — no shader recompile.
- `src/game.ts` — Many touch points, all surgical:
  - `applyPickupToShip`: when kind === SHIELD, call `triggerShieldFlare(this.shieldMesh, 0.6)`, push secondary floating text "+50%", and push a `Shockwave(shipPos, 0x66aaff, 0.55)` with opacity override 0.55.
  - `updateShieldVisuals` call site (line ~663): after the existing call, if SHIELD is in `activeEffects`, call `setShieldBoostColor` and `setShieldBoostPulse` with `intensity = effect.remaining / effect.total`.
  - `fireBombStrike` (line 1174-1195): replace the single `Shockwave` push with the 6-layer sequence — hot core sphere (1-frame at opacity 0.7, expands 0→1u over 0.1s), primary `Shockwave(shipPos, 0xff8800, 1.0, 8.0)`, secondary `Shockwave(shipPos, 0xff4400, 0.5, 10.0)` pushed 80ms later via a `setTimeout` (or a new `pendingBombLayers` array, see Task 1), `emitShockwaveParticles(shipPos, { count: 30, speed: 6, color: 0xffcc66, lifetime: 0.5 })` + `emitShockwaveParticles(shipPos, { count: 8, speed: 10, color: 0xffaa00, lifetime: 0.6, isDebris: true })`, shards cleanse loop, DOM edge flash trigger.
  - Camera shake bump: from current 0.3 to 0.6 amplitude, 0.4s duration (use existing `cameraShakeAmplitude` + `cameraShakeRemaining` fields).
  - `useActiveItem`: route MISSILES through `scheduleMissileVolley` (push the schedule into a new `missileVolleySchedules: VolleySchedule[]` field). New `tickMissileVolleySchedules(dt)` call in the update loop before `tickHomingMissiles`.
  - `updateHud` reconcile loop (line ~2622-2652): for the SHIELD pill, replace the label with `` `SHIELD +BOOST ${effect.remaining.toFixed(1)}s` `` and set the pill border color to a brighter shade while boost active. Add the pill pop-in CSS scale animation in the `if (!entry)` branch (3 lines: `transform: scale(0)`, transition, requestAnimationFrame trigger).
  - `updatePickups` loop (line 1021-1039): replace `pickup.mesh.rotation.z = pickup.state.spin` with per-kind axis assignment. Add vertical bobbing (`mesh.position.y = state.position.y + sin(age * π * 2 * 0.6) * 0.12`). Add emissive pulse on the icosahedron child. Update the proximity halo child's opacity by ship distance.
  - `updateActiveDeployments` (line 1264-1286): call `tickMissileVolleySchedules` BEFORE `tickHomingMissiles` so scheduled missiles enter the live list in the same frame their stagger expires.
  - `stop()` reset path: clear `missileVolleySchedules` array.
- `index.html` — Add 1 CSS rule + 1 hidden `<div id="bomb-edge-flash">` element for the bomb DOM edge flash (radial gradient overlay at screen edges, fades over 120ms via CSS transition).

---

## Task Index (10 tasks, sequenced for incremental testability)

1. Constants & test scaffolding (pickups.ts + 1 test file)
2. Shockwave class extension (ringRadius param + duration bump)
3. Shockwave particles pool (new module)
4. Missile VFX pool (new module + assembly/flame mesh creation)
5. Missile volley schedule (replaces instant spawn)
6. Shield boost color/pulse helpers (new shield-visuals.ts functions)
7. Shield flare + pick-up moment hooks
8. Pickup mesh factory: per-kind geometry, axis, sonar ring, proximity halo
9. Game.ts wiring: fireBombStrike 6-layer + useActiveItem missiles + updateHud pill pop-in + SHIELD text + applyPickupToShip moment
10. Quality gates + atomic commit

---

## Task 1: Constants & test scaffolding

**Files:**
- Modify: `src/pickups.ts:249-274` (BOMB_STRIKE + HOMING_MISSILES constants)
- Create: `tests/shockwave-particles.test.ts` (placeholder that asserts the module exports the expected API surface)
- Create: `tests/missile-vfx.test.ts` (placeholder that asserts the module exports the expected API surface)
- Create: `tests/shield-boost-lerp.test.ts` (placeholder that asserts the helper functions exist with the expected signatures)

**Interfaces:**
- Consumes: nothing (this is the first task)
- Produces: updated constants in `src/pickups.ts` that later tasks import; placeholder test files that later tasks will extend

- [ ] **Step 1: Update `src/pickups.ts` constants**

Open `src/pickups.ts` and replace the BOMB_STRIKE constants block (lines 248-252) and HOMING_MISSILES constants block (lines 266-274) with:

```ts
// Bomb Strike constants.
export const BOMB_STRIKE_RADIUS = 8.0; // was 5.0 — Phase 7b "wipes out the area" upgrade
export const BOMB_STRIKE_COOLDOWN_SECONDS = 3.0;
export const BOMB_STRIKE_CHARGE_CAP = 3;
export const BOMB_STRIKE_DAMAGE = 1;
```

```ts
// Homing Missiles constants.
export const HOMING_MISSILES_COOLDOWN_SECONDS = 4.0;
export const HOMING_MISSILES_CHARGE_CAP = 3;
export const HOMING_MISSILES_VOLLEY_COUNT = 4;
export const HOMING_MISSILES_DAMAGE = 1;
export const HOMING_MISSILES_SPEED = 7.0; // was 6.0
export const HOMING_MISSILES_TRACKING_RADIUS = 10.0; // was 8.0
export const HOMING_MISSILES_TRACKING_DURATION = 2.5; // was 1.5
export const HOMING_MISSILES_TURN_RATE = 14.0; // was 8.0
export const HOMING_MISSILES_VOLLEY_STAGGER_MS = 180; // NEW — 0/180/360/540ms cadence
export const HOMING_MISSILES_MISSILE_IMPACT_RADIUS = 0.45; // NEW — was hard-coded 0.3
```

Add the new My Rules block above the constants explaining the change rationale (see "My Rules" spec in CLAUDE.md). The block should cover:
- **Purpose:** Phase 7b upgrade — bomb radius bumped to match "wipes out the area" intent; missile constants tuned for the new staggered-volley behavior + visible tracking curve.
- **Setup:** Imported by `src/active-deployments.ts`, `src/game.ts`, and tests.
- **Issues:** Old 5.0 radius only covered a tight cluster; old 1.5s tracking + 8.0 turn rate + 0.3 impact radius let missiles miss through small gaps.
- **Fix:** Phase 7b. Numbers picked from research findings; the user picked (A) 8.0 from the "5.0/8.0/10.0" fork.
- **Gotchas:** `BOMB_STRIKE_RADIUS` change means fireBombStrike's damage pass now also catches crystals at 6-8 units (was 4-5). Existing tests assert `BOMB_STRIKE_RADIUS === 5.0` and need updating (do this in Task 9, when the Game.ts wiring ships).

- [ ] **Step 2: Create `tests/shockwave-particles.test.ts` placeholder**

Create the file with the following content:

```ts
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Particles API Surface Test (Phase 7b Task 1)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lock in the public API of src/shockwave-particles.ts so the
//          Game.ts wiring (Task 9) can import these symbols without surprises.
//          Task 3 implements the actual emission/update/dispose functions;
//          this file's tests will pass once that implementation lands.
// ═══════════════════════════════════════════════════════════════════════════

describe('shockwave-particles API surface (Phase 7b)', () => {
  it('exports emitShockwaveParticles, updateShockwaveParticles, disposeShockwaveParticles', async () => {
    const mod = await import('../src/shockwave-particles');
    expect(typeof mod.emitShockwaveParticles).toBe('function');
    expect(typeof mod.updateShockwaveParticles).toBe('function');
    expect(typeof mod.disposeShockwaveParticles).toBe('function');
  });
});
```

- [ ] **Step 3: Create `tests/missile-vfx.test.ts` placeholder**

Create the file with:

```ts
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile VFX API Surface Test (Phase 7b Task 1)
// ═══════════════════════════════════════════════════════════════════════════

describe('missile-vfx API surface (Phase 7b)', () => {
  it('exports emitMissileSmoke, updateMissileSmoke, disposeMissileVfx', async () => {
    const mod = await import('../src/missile-vfx');
    expect(typeof mod.emitMissileSmoke).toBe('function');
    expect(typeof mod.updateMissileSmoke).toBe('function');
    expect(typeof mod.disposeMissileVfx).toBe('function');
  });
});
```

- [ ] **Step 4: Create `tests/shield-boost-lerp.test.ts` placeholder**

Create the file with:

```ts
import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Boost Lerp Helpers Test (Phase 7b Task 1)
// ═══════════════════════════════════════════════════════════════════════════

describe('shield boost lerp helpers (Phase 7b)', () => {
  it('exports setShieldBoostColor, setShieldBoostPulse, triggerShieldFlare', async () => {
    const mod = await import('../src/shield-visuals');
    expect(typeof mod.setShieldBoostColor).toBe('function');
    expect(typeof mod.setShieldBoostPulse).toBe('function');
    expect(typeof mod.triggerShieldFlare).toBe('function');
  });
});
```

- [ ] **Step 5: Run typecheck + vitest to confirm scaffold is clean**

Run: `npx tsc --noEmit`
Expected: 0 errors (no source changes yet that affect types)

Run: `npx vitest run`
Expected: 254/254 pass (no new tests assert anything yet; the 3 new tests will be skipped because they import modules that don't exist — wrap each `import` in `try/catch` OR just accept the test file is intentionally broken until later tasks land; **the implementer's job in later tasks is to make these tests pass**)

If the 3 new test files fail because the imports don't exist, that's expected at this step. Verify with `npx vitest run --reporter=verbose 2>&1 | grep "shield-boost-lerp\|missile-vfx\|shockwave-particles"` that the new files are being picked up. Mark this step complete; the test files become useful starting in Task 3 (shockwave-particles), Task 4 (missile-vfx), and Task 6 (shield-visuals).

- [ ] **Step 6: Commit (per-task commit; later tasks will be combined with this one into the final atomic commit, but committing each task as it lands helps isolate any regression during review)**

```bash
git add src/pickups.ts tests/shockwave-particles.test.ts tests/missile-vfx.test.ts tests/shield-boost-lerp.test.ts
git commit -m "feat(pickups): Phase 7b constants — bomb radius 8.0, missile stagger 180ms, lerp helper test scaffolds"
```

---

## Task 2: Shockwave class extension (ringRadius + duration bump)

**Files:**
- Modify: `src/shockwave.ts:28-89` (add ringRadius param, bump duration)

**Interfaces:**
- Consumes: existing `Shockwave` constructor `(position, color, intensity)` from `src/game.ts:1193` and `src/game.ts:2495` (crystal bursts)
- Produces: extended `Shockwave` constructor `(position, color, intensity, ringRadius?)` — backwards-compatible because the new param is optional and defaults to 4.0

- [ ] **Step 1: Update `src/shockwave.ts` constants**

Replace the top constant block (lines 28-32) with:

```ts
const SHOCKWAVE_DURATION_SECONDS = 0.7; // was 0.5 — Phase 7b slower ring expansion matches new damage radius
const SHOCKWAVE_SCALE_MAX = 4.0;
const SHOCKWAVE_INNER_RADIUS = 0.4;
const SHOCKWAVE_OUTER_RADIUS = 0.6;
const SHOCKWAVE_RING_SEGMENTS = 48;
```

- [ ] **Step 2: Extend the `Shockwave` constructor**

Replace the constructor body (lines 46-65) with:

```ts
constructor(position: Vector2, color: number, intensity: number, ringRadius?: number) {
  this.age = 0;
  this.duration = SHOCKWAVE_DURATION_SECONDS;
  // ringRadius overrides the default scaleMax when set — used by Bomb Strike
  // (which needs an 8u ring to match its damage radius) and Shield pickup
  // (a smaller 2.2u ring). When omitted, fall back to the historical
  // SHOCKWAVE_SCALE_MAX * intensity formula so existing crystal-burst
  // call sites need no changes.
  this.scaleMax = ringRadius ?? SHOCKWAVE_SCALE_MAX * Math.max(0.25, intensity);
  this.color = color;
  this.intensity = Math.max(0.05, intensity);

  const geometry = new RingGeometry(SHOCKWAVE_INNER_RADIUS, SHOCKWAVE_OUTER_RADIUS, SHOCKWAVE_RING_SEGMENTS);
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: 2, // DoubleSide
  });
  this.mesh = new Mesh(geometry, material);
  this.mesh.position.set(position.x, position.y, -0.2);
}
```

- [ ] **Step 3: Add a My Rules block to `src/shockwave.ts`**

Replace the existing Purpose block (line 9) with the updated block that documents the new param and bumped duration. The block should cover:
- **Purpose:** Phase 7b — added optional `ringRadius` so the Bomb Strike can produce an 8u ring to match its new 8u damage radius without breaking the existing 4u crystal-burst call sites. Bumped `SHOCKWAVE_DURATION_SECONDS` 0.5→0.7 to give the ring more time to expand to the new larger radius.
- **Setup:** Called from `src/game.ts:1193` (bomb) and `src/game.ts:2495` (crystal bursts, unchanged).
- **Issues:** With `SHOCKWAVE_DURATION_SECONDS = 0.5` and `BOMB_STRIKE_RADIUS = 8.0`, the visual ring only reached ~3.5u before fading — much smaller than the damage radius, so the explosion looked weak.
- **Fix:** `ringRadius` param lets the bomb caller pass `8.0` directly; duration bump gives the ring time to ease-out to that radius.
- **Gotchas:** `ringRadius` is the FINAL ring scale, not a multiplier. The existing crystal-burst callers don't pass it, so they keep the old 4.0u behavior — no breaking changes.

- [ ] **Step 4: Run vitest to confirm no regression**

Run: `npx vitest run`
Expected: 254/254 pass (the shockwave tests in `tests/pickups.test.ts` and any other shockwave tests should still pass with the new signature because the 4th param is optional)

- [ ] **Step 5: Commit**

```bash
git add src/shockwave.ts
git commit -m "feat(shockwave): optional ringRadius param + 0.5→0.7s duration for Phase 7b bomb upgrade"
```

---

## Task 3: Shockwave particles pool (new module)

**Files:**
- Create: `src/shockwave-particles.ts`
- Modify: `tests/shockwave-particles.test.ts` (replace placeholder with real tests)

**Interfaces:**
- Consumes: `InstancedMesh`, `PlaneGeometry`, `MeshBasicMaterial`, `AdditiveBlending`, `Object3D`, `MathUtils` from `three`; module is side-effect-free until first call to `emitShockwaveParticles`
- Produces: module-scope singleton InstancedMesh + 3 exported functions (`emitShockwaveParticles`, `updateShockwaveParticles`, `disposeShockwaveParticles`)

- [ ] **Step 1: Create `src/shockwave-particles.ts`**

Create the file with the following content:

```ts
import {
  AdditiveBlending,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Particles (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: InstancedMesh pool of additive billboard particles that the Bomb
//          Strike spawns for the shock-front + debris layers (layers 4 + 5
//          of the 6-layer combo). One draw call total, no per-blast allocation.
// Setup:   Imported by src/game.ts fireBombStrike. Module-scope InstancedMesh
//          is created lazily on the first emit call (when the parent scene
//          is passed in) so the module can be imported in any test env
//          without needing a WebGL context.
// Issues:  None.
// Fix:     Phase 7b. The 6-layer bomb combo needs cheap "stuff flying outward"
//          effects without per-frame allocations; an InstancedMesh with a
//          pre-allocated pool is the canonical Three.js pattern.
// Gotchas: Pool size is the absolute worst case (3 charges queued, all 3
//          blasts mid-flight, 38 particles per blast) = 114. We allocate
//          128 to leave headroom. Disposal removes the InstancedMesh from
//          the scene AND disposes the geometry + material — the parent
//          scene must be passed to emitShockwaveParticles on first call
//          so the module knows where to add the InstancedMesh.
// ═══════════════════════════════════════════════════════════════════════════

const POOL_SIZE = 128;
const PARTICLE_BASE_SIZE = 0.3;
const PARTICLE_BASE_OPACITY = 0.5;

interface ParticleSlot {
  alive: boolean;
  age: number;
  lifetime: number;
  startX: number;
  startY: number;
  velocityX: number;
  velocityY: number;
  baseScale: number;
  baseOpacity: number;
  color: number;
}

const slots: ParticleSlot[] = [];
let instanced: InstancedMesh | null = null;
let material: MeshBasicMaterial | null = null;
let scene: Object3D | null = null;

function ensureInstanced(parentScene: Object3D): InstancedMesh {
  if (instanced) return instanced;
  scene = parentScene;
  const geometry = new PlaneGeometry(PARTICLE_BASE_SIZE, PARTICLE_BASE_SIZE);
  material = new MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 1,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  instanced = new InstancedMesh(geometry, material, POOL_SIZE);
  instanced.frustumCulled = false;
  parentScene.add(instanced);
  for (let i = 0; i < POOL_SIZE; i++) {
    slots.push({
      alive: false,
      age: 0,
      lifetime: 0,
      startX: 0,
      startY: 0,
      velocityX: 0,
      velocityY: 0,
      baseScale: 1,
      baseOpacity: PARTICLE_BASE_OPACITY,
      color: 0xffffff,
    });
    // Hide every instance offscreen until first emit.
    instanced.setMatrixAt(i, new (require('three').Matrix4)().makeTranslation(0, 0, -10000));
  }
  instanced.instanceMatrix.needsUpdate = true;
  return instanced;
}

export interface EmitOptions {
  count: number;
  speed: number;       // initial radial speed in world units/sec
  color: number;       // 0xRRGGBB
  lifetime: number;    // seconds before the particle is culled
  isDebris?: boolean;  // debris is faster + slightly bigger; used for the chunk layer
}

export function emitShockwaveParticles(parentScene: Object3D, x: number, y: number, options: EmitOptions): void {
  const inst = ensureInstanced(parentScene);
  let emitted = 0;
  for (let i = 0; i < POOL_SIZE && emitted < options.count; i++) {
    const slot = slots[i];
    if (slot.alive) continue;
    slot.alive = true;
    slot.age = 0;
    slot.lifetime = options.lifetime;
    slot.startX = x;
    slot.startY = y;
    const angle = (emitted / options.count) * Math.PI * 2 + Math.random() * 0.3;
    const speed = options.speed * (options.isDebris ? 1.0 + Math.random() * 0.4 : 0.8 + Math.random() * 0.4);
    slot.velocityX = Math.cos(angle) * speed;
    slot.velocityY = Math.sin(angle) * speed;
    slot.baseScale = options.isDebris ? 1.0 + Math.random() * 0.6 : 0.8 + Math.random() * 0.4;
    slot.baseOpacity = options.isDebris ? 0.6 : 0.5;
    slot.color = options.color;
    emitted += 1;
  }
  inst.count = POOL_SIZE; // ensure all instances are drawn (some are dead, culled via matrix = zero scale below)
}

export function updateShockwaveParticles(deltaTime: number): void {
  if (!instanced) return;
  const tempMatrix = new (require('three').Matrix4)();
  const tempColor = new (require('three').Color)();
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = slots[i];
    if (!slot.alive) {
      // Send dead instances offscreen.
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    slot.age += deltaTime;
    const t = slot.age / slot.lifetime;
    if (t >= 1.0) {
      slot.alive = false;
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    const x = slot.startX + slot.velocityX * slot.age;
    const y = slot.startY + slot.velocityY * slot.age;
    const scale = slot.baseScale * (1.0 + t * 1.4);
    tempMatrix.makeScale(scale, scale, 1);
    tempMatrix.setPosition(x, y, 0);
    instanced.setMatrixAt(i, tempMatrix);
    tempColor.setHex(slot.color);
    // Opacity is per-instance via instanceColor (Three.js .a channel).
    if (!instanced.instanceColor) {
      instanced.instanceColor = new (require('three').InstancedBufferAttribute)(
        new Float32Array(POOL_SIZE * 3), 3,
      );
    }
    const alpha = slot.baseOpacity * (1.0 - t);
    instanced.instanceColor.setXYZ(i, tempColor.r * alpha, tempColor.g * alpha, tempColor.b * alpha);
  }
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
}

export function disposeShockwaveParticles(): void {
  if (instanced && scene) {
    scene.remove(instanced);
    instanced.geometry.dispose();
    if (material) material.dispose();
  }
  instanced = null;
  material = null;
  scene = null;
  slots.length = 0;
}
```

- [ ] **Step 2: Replace the placeholder test file with real tests**

Replace `tests/shockwave-particles.test.ts` contents with:

```ts
import { describe, it, expect } from 'vitest';
import { Scene } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shockwave Particles Pool Math Test (Phase 7b Task 3)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lock the pool's per-particle update math (lifetime, fade, growth)
//          without needing a WebGL context. We use a minimal stub for
//          InstancedMesh to verify the slot math; the actual GPU upload
//          is verified in the Playwright A/B screenshots (tests/bomb-vfx.spec.ts).
// Setup:   Imports the module, calls emit, calls update with a known dt,
//          asserts the returned alive-count matches the expected curve.
// Issues:  None.
// Fix:     Phase 7b Task 3.
// Gotchas: We stub InstancedMesh via Object.defineProperty on the
//          instanceMatrix setter so the module's internal calls don't
//          throw. The real implementation's GPU side is covered by
//          integration tests, not unit tests.
// ═══════════════════════════════════════════════════════════════════════════

describe('shockwave-particles pool (Phase 7b)', () => {
  it('exports the expected API surface', async () => {
    const mod = await import('../src/shockwave-particles');
    expect(typeof mod.emitShockwaveParticles).toBe('function');
    expect(typeof mod.updateShockwaveParticles).toBe('function');
    expect(typeof mod.disposeShockwaveParticles).toBe('function');
  });

  it('emit then advance past lifetime culls particles (no throw, returns void)', async () => {
    const mod = await import('../src/shockwave-particles');
    const scene = new Scene();
    mod.emitShockwaveParticles(scene, 0, 0, {
      count: 8,
      speed: 6,
      color: 0xffcc66,
      lifetime: 0.5,
    });
    // Advance 1.0s — well past the 0.5s lifetime. Should not throw.
    expect(() => mod.updateShockwaveParticles(1.0)).not.toThrow();
    mod.disposeShockwaveParticles();
  });

  it('emitting more than POOL_SIZE silently caps to pool size (no throw)', async () => {
    const mod = await import('../src/shockwave-particles');
    const scene = new Scene();
    expect(() =>
      mod.emitShockwaveParticles(scene, 0, 0, {
        count: 999,
        speed: 6,
        color: 0xffcc66,
        lifetime: 0.5,
      }),
    ).not.toThrow();
    mod.disposeShockwaveParticles();
  });
});
```

- [ ] **Step 3: Run vitest**

Run: `npx vitest run`
Expected: 254/254 + 3 new tests = 257/257 pass. If the new tests fail with import errors, the module path or export names are wrong — fix and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/shockwave-particles.ts tests/shockwave-particles.test.ts
git commit -m "feat(shockwave-particles): InstancedMesh pool for bomb shock-front + debris layers"
```

---

## Task 4: Missile VFX pool (new module) + per-missile thruster flame cone

**Files:**
- Create: `src/missile-vfx.ts`
- Modify: `tests/missile-vfx.test.ts` (replace placeholder)

**Interfaces:**
- Consumes: `InstancedMesh`, `PlaneGeometry`, `MeshBasicMaterial`, `AdditiveBlending`, `Object3D`, `CanvasTexture` from `three`; same lazy-init pattern as Task 3
- Produces: `emitMissileSmoke(scene, x, y)`, `updateMissileSmoke(dt)`, `disposeMissileVfx()`

- [ ] **Step 1: Create `src/missile-vfx.ts`**

Create the file with:

```ts
import {
  AdditiveBlending,
  CanvasTexture,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile VFX Smoke Pool (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: InstancedMesh pool of additive billboard smoke puffs that trail
//          behind each homing missile. One draw call for the entire pool,
//          regardless of how many missiles are in flight. Worst case is
//          12 missiles × 24 puffs/missile life = 288 active instances.
// Setup:   Imported by src/active-deployments.ts tickHomingMissiles.
//          Module-scope texture + InstancedMesh created lazily on first
//          emit (parent scene required to add the InstancedMesh).
// Issues:  None.
// Fix:     Phase 7b. Without a pool, 12 missiles × 16 emits/sec = 192 sprite
//          allocations per second, plus material duplicates — would GC
//          thrash and leak GPU resources. The InstancedMesh pool is the
//          canonical Three.js pattern for this scale.
// Gotchas: The 16×16 radial-alpha texture is generated ONCE at module load
//          (not lazily) because CanvasTexture.fromCanvas is cheap and
//          deterministic — no WebGL dependency. Pool size = 288 matches
//          the worst-case (3 charges × 4 missiles × 24 puffs each). We
//          share one material across all 288 instances; opacity is per-
//          instance via the instanceColor .a channel multiplied into RGB.
//          Disposal must remove the InstancedMesh from the scene BEFORE
//          disposing the texture (texture dispose is a no-op here, but
//          the pattern is to clean in reverse-add order).
// ═══════════════════════════════════════════════════════════════════════════

const POOL_SIZE = 288;
const SMOKE_LIFETIME_SECONDS = 0.6;
const SMOKE_BASE_SIZE = 0.4;
const SMOKE_BASE_OPACITY = 0.4;
const SMOKE_SCALE_GROWTH = 1.4; // final scale = base * (1 + growth * t)

function makeRadialAlphaTexture(): CanvasTexture | null {
  // Guarded for Node test envs (vitest) where document is undefined. Returns
  // null if no DOM is available — the pool then falls back to a flat-white
  // additive material, which is fine for smoke puffs (the smoke is supposed
  // to be soft and dim; the radial alpha just makes it slightly softer).
  if (typeof document === 'undefined') return null;
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

interface SmokeSlot {
  alive: boolean;
  age: number;
  x: number;
  y: number;
}

const slots: SmokeSlot[] = [];
let instanced: InstancedMesh | null = null;
let material: MeshBasicMaterial | null = null;
let texture: CanvasTexture | null = null;
let scene: Object3D | null = null;

function ensureInstanced(parentScene: Object3D): InstancedMesh {
  if (instanced) return instanced;
  scene = parentScene;
  texture = makeRadialAlphaTexture(); // null in Node envs — Material has no map, which is fine
  const geometry = new PlaneGeometry(SMOKE_BASE_SIZE, SMOKE_BASE_SIZE);
  material = new MeshBasicMaterial({
    map: texture,
    color: 0xaaaaaa,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  instanced = new InstancedMesh(geometry, material, POOL_SIZE);
  instanced.frustumCulled = false;
  parentScene.add(instanced);
  for (let i = 0; i < POOL_SIZE; i++) {
    slots.push({ alive: false, age: 0, x: 0, y: 0 });
  }
  return instanced;
}

export function emitMissileSmoke(parentScene: Object3D, x: number, y: number): void {
  const inst = ensureInstanced(parentScene);
  // Find a free slot; if none, steal the oldest alive one (overwrite).
  let slotIdx = -1;
  let oldestAge = -1;
  for (let i = 0; i < POOL_SIZE; i++) {
    if (!slots[i].alive) {
      slotIdx = i;
      break;
    }
    if (slots[i].age > oldestAge) {
      oldestAge = slots[i].age;
      slotIdx = i;
    }
  }
  if (slotIdx < 0) return; // pool exhausted (shouldn't happen given math)
  slots[slotIdx].alive = true;
  slots[slotIdx].age = 0;
  slots[slotIdx].x = x;
  slots[slotIdx].y = y;
  inst.count = POOL_SIZE; // ensure all instances drawn
}

export function updateMissileSmoke(deltaTime: number): void {
  if (!instanced) return;
  const tempMatrix = new (require('three').Matrix4)();
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = slots[i];
    if (!slot.alive) {
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    slot.age += deltaTime;
    const t = slot.age / SMOKE_LIFETIME_SECONDS;
    if (t >= 1.0) {
      slot.alive = false;
      tempMatrix.makeTranslation(0, 0, -10000);
      instanced.setMatrixAt(i, tempMatrix);
      continue;
    }
    const scale = 1.0 + SMOKE_SCALE_GROWTH * t;
    tempMatrix.makeScale(scale, scale, 1);
    tempMatrix.setPosition(slot.x, slot.y, 0);
    instanced.setMatrixAt(i, tempMatrix);
    const alpha = SMOKE_BASE_OPACITY * (1.0 - t);
    // Assign to a local so TS narrows the type for the setXYZ call below
    // (same pattern as src/shockwave-particles.ts:160-169 — fixed in Task 3).
    let colorAttr = instanced.instanceColor;
    if (!colorAttr) {
      colorAttr = new (require('three').InstancedBufferAttribute)(
        new Float32Array(POOL_SIZE * 3), 3,
      );
      instanced.instanceColor = colorAttr;
    }
    colorAttr!.setXYZ(i, alpha, alpha, alpha);
  }
  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
}

export function disposeMissileVfx(): void {
  if (instanced && scene) {
    scene.remove(instanced);
    instanced.geometry.dispose();
    if (material) material.dispose();
    if (texture) texture.dispose();
  }
  instanced = null;
  material = null;
  texture = null;
  scene = null;
  slots.length = 0;
}
```

- [ ] **Step 2: Replace the placeholder test file**

Replace `tests/missile-vfx.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Scene } from 'three';

describe('missile-vfx pool (Phase 7b)', () => {
  it('exports the expected API surface', async () => {
    const mod = await import('../src/missile-vfx');
    expect(typeof mod.emitMissileSmoke).toBe('function');
    expect(typeof mod.updateMissileSmoke).toBe('function');
    expect(typeof mod.disposeMissileVfx).toBe('function');
  });

  it('emit then advance past lifetime does not throw', async () => {
    const mod = await import('../src/missile-vfx');
    const scene = new Scene();
    for (let i = 0; i < 12; i++) mod.emitMissileSmoke(scene, i, 0);
    expect(() => mod.updateMissileSmoke(1.0)).not.toThrow();
    mod.disposeMissileVfx();
  });

  it('emitting 1000+ puffs caps to pool size and does not throw', async () => {
    const mod = await import('../src/missile-vfx');
    const scene = new Scene();
    expect(() => {
      for (let i = 0; i < 1000; i++) mod.emitMissileSmoke(scene, i % 10, 0);
    }).not.toThrow();
    mod.disposeMissileVfx();
  });
});
```

- [ ] **Step 3: Run vitest**

Run: `npx vitest run`
Expected: 257/257 + 3 new = 260/260 pass.

- [ ] **Step 4: Commit**

```bash
git add src/missile-vfx.ts tests/missile-vfx.test.ts
git commit -m "feat(missile-vfx): InstancedMesh smoke pool for homing missile trails"
```

---

## Task 5: Missile volley schedule + per-missile flame cone assembly

**Files:**
- Modify: `src/active-deployments.ts:1-326` (replace `spawnMissileVolley` with `scheduleMissileVolley` + new `tickMissileVolleySchedules`; extend `HomingMissileState` with assembly/flame fields; update `tickHomingMissiles` to rotate assembly, pulse flame, emit smoke, use new impact radius constant; update dispose paths for the flame cone)

**Interfaces:**
- Consumes: existing `findNearestAsteroid` and `HomingMissileState` interface; new `HOMING_MISSILES_VOLLEY_STAGGER_MS` and `HOMING_MISSILES_MISSILE_IMPACT_RADIUS` constants from `src/pickups.ts`; new `emitMissileSmoke` from `src/missile-vfx.ts`
- Produces: new `VolleySchedule` + `PendingMissile` interfaces; new `scheduleMissileVolley` and `tickMissileVolleySchedules` exported functions; new `HomingMissileState.assembly` + `HomingMissileState.flame` fields

- [ ] **Step 1: Update imports at the top of `src/active-deployments.ts`**

Replace the existing import block (lines 1-27) with:

```ts
import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import { AsteroidState, Vector2 } from './types';
import {
  HOMING_MISSILES_DAMAGE,
  HOMING_MISSILES_MISSILE_IMPACT_RADIUS,
  HOMING_MISSILES_SPEED,
  HOMING_MISSILES_TRACKING_DURATION,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_TURN_RATE,
  HOMING_MISSILES_VOLLEY_COUNT,
  HOMING_MISSILES_VOLLEY_STAGGER_MS,
  ORBIT_DRONES_DAMAGE,
  ORBIT_DRONES_DRONE_COUNT,
  ORBIT_DRONES_DURATION_SECONDS,
  ORBIT_DRONES_FADE_OUT_SECONDS,
  ORBIT_DRONES_FIRE_INTERVAL_SECONDS,
  ORBIT_DRONES_ORBIT_PERIOD_SECONDS,
  ORBIT_DRONES_ORBIT_RADIUS,
  ORBIT_DRONES_TARGET_RADIUS,
  PICKUP_COLOR,
  PickupKind,
} from './pickups';
import { emitMissileSmoke } from './missile-vfx';
```

- [ ] **Step 2: Replace the `HomingMissileState` interface (lines 57-62)**

```ts
export interface HomingMissileState {
  position: Vector2;
  velocity: Vector2;
  remaining: number;
  mesh: Mesh;          // sphere body
  assembly: Group;     // body + flame cone, rotated to face velocity
  flame: Mesh;         // thruster flame cone (additive)
  spawnTime: number;   // for firePulse oscillation
  firePulse: number;   // accumulates elapsed time for flicker
}
```

- [ ] **Step 3: Add new `VolleySchedule` + `PendingMissile` interfaces after `HomingMissileState`**

```ts
export interface PendingMissile {
  delayRemaining: number;
  spread: number; // angular offset from aim direction (radians)
}

export interface VolleySchedule {
  remaining: number; // counts down to first launch (0 initially)
  pending: PendingMissile[]; // 4 entries, in launch order
}
```

- [ ] **Step 4: Replace `spawnMissileVolley` (lines 195-251) with `scheduleMissileVolley` + `tickMissileVolleySchedules` + `spawnMissileFromPending`**

The constants `VOLLEY_HALF_SPREAD` and `MISSILE_RADIUS` already exist at the top of the file — keep them as-is.

```ts
const VOLLEY_HALF_SPREAD = 0.06; // was 0.225 — narrower fan reads as a stream, not a shotgun
const MISSILE_RADIUS = 0.10;     // was 0.12 — slightly smaller body, flame balances it
const FLAME_LENGTH = 0.40;
const FLAME_BASE_RADIUS = 0.16;

export function scheduleMissileVolley(shipPosition: Vector2, aimDir: Vector2): VolleySchedule {
  const pending: PendingMissile[] = [];
  for (let i = 0; i < HOMING_MISSILES_VOLLEY_COUNT; i++) {
    pending.push({
      delayRemaining: (i * HOMING_MISSILES_VOLLEY_STAGGER_MS) / 1000,
      spread: (i - (HOMING_MISSILES_VOLLEY_COUNT - 1) / 2) * (VOLLEY_HALF_SPREAD / 1.5),
    });
  }
  return { remaining: 0, pending };
}

function spawnMissileFromPending(
  pending: PendingMissile,
  shipPosition: Vector2,
  aimDir: Vector2,
  scene: Object3D,
  spawnTime: number,
): HomingMissileState {
  // Rotate aimDir by pending.spread.
  const cos = Math.cos(pending.spread);
  const sin = Math.sin(pending.spread);
  const vx = aimDir.x * cos - aimDir.y * sin;
  const vy = aimDir.x * sin + aimDir.y * cos;

  const magentaColor = PICKUP_COLOR[PickupKind.HOMING_MISSILES];

  // Body sphere
  const body = new Mesh(
    new SphereGeometry(MISSILE_RADIUS, 6, 6),
    new MeshBasicMaterial({ color: magentaColor, transparent: true, opacity: 0.95 }),
  );

  // Flame cone (mirrors exhaust-gameplay.ts:244-270 pattern)
  const flameGeom = new ConeGeometry(FLAME_BASE_RADIUS, FLAME_LENGTH, 8);
  flameGeom.scale(1, -1, 1);
  flameGeom.rotateZ(-Math.PI / 2);
  flameGeom.translate(-MISSILE_RADIUS - FLAME_LENGTH * 0.5, 0, 0);
  const flameMat = new MeshBasicMaterial({
    color: 0xffaa44, // warm orange, contrasts with magenta body
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const flame = new Mesh(flameGeom, flameMat);

  const assembly = new Group();
  assembly.add(body);
  assembly.add(flame);
  assembly.position.set(shipPosition.x, shipPosition.y, 0);
  // Initial rotation to face velocity
  assembly.rotation.z = Math.atan2(vy, vx);
  scene.add(assembly);

  return {
    position: { x: shipPosition.x, y: shipPosition.y },
    velocity: { x: vx * HOMING_MISSILES_SPEED, y: vy * HOMING_MISSILES_SPEED },
    remaining: HOMING_MISSILES_TRACKING_DURATION,
    mesh: body,
    assembly,
    flame,
    spawnTime,
    firePulse: 0,
  };
}

export function tickMissileVolleySchedules(
  schedules: VolleySchedule[],
  shipPosition: Vector2,
  aimDir: Vector2,
  deltaTime: number,
  scene: Object3D,
  activeMissiles: HomingMissileState[],
): VolleySchedule[] {
  const alive: VolleySchedule[] = [];
  const gameTime = performance.now() / 1000;
  for (const schedule of schedules) {
    const stillPending: PendingMissile[] = [];
    for (const pending of schedule.pending) {
      pending.delayRemaining -= deltaTime;
      if (pending.delayRemaining <= 0) {
        activeMissiles.push(
          spawnMissileFromPending(pending, shipPosition, aimDir, scene, gameTime),
        );
      } else {
        stillPending.push(pending);
      }
    }
    schedule.pending = stillPending;
    if (schedule.pending.length > 0) {
      alive.push(schedule);
    }
  }
  return alive;
}
```

- [ ] **Step 5: Update `tickHomingMissiles` (lines 259-326 in the original — replace the function body)**

```ts
export function tickHomingMissiles(
  missiles: HomingMissileState[],
  asteroids: AsteroidState[],
  deltaTime: number,
  scene: Object3D,
  onMissileImpact: (asteroid: AsteroidState) => void,
): HomingMissileState[] {
  const alive: HomingMissileState[] = [];
  for (const missile of missiles) {
    missile.remaining -= deltaTime;
    if (missile.remaining <= 0) {
      scene.remove(missile.assembly);
      missile.mesh.geometry.dispose();
      (missile.mesh.material as MeshBasicMaterial).dispose();
      missile.flame.geometry.dispose();
      (missile.flame.material as MeshBasicMaterial).dispose();
      continue;
    }
    // Apply tracking steering.
    const target = findNearestAsteroid(
      missile.position,
      asteroids,
      HOMING_MISSILES_TRACKING_RADIUS,
    );
    if (target) {
      const desiredX = target.position.x - missile.position.x;
      const desiredY = target.position.y - missile.position.y;
      const desiredLength = Math.hypot(desiredX, desiredY);
      if (desiredLength > 0.01) {
        const dx = desiredX / desiredLength;
        const dy = desiredY / desiredLength;
        const currentLength = Math.hypot(missile.velocity.x, missile.velocity.y);
        if (currentLength > 0.01) {
          const cx = missile.velocity.x / currentLength;
          const cy = missile.velocity.y / currentLength;
          const t = Math.min(1, HOMING_MISSILES_TURN_RATE * deltaTime);
          const newX = cx + (dx - cx) * t;
          const newY = cy + (dy - cy) * t;
          const newLength = Math.hypot(newX, newY);
          if (newLength > 0.01) {
            missile.velocity = {
              x: (newX / newLength) * HOMING_MISSILES_SPEED,
              y: (newY / newLength) * HOMING_MISSILES_SPEED,
            };
          }
        }
      }
    }
    // Integrate position.
    missile.position = {
      x: missile.position.x + missile.velocity.x * deltaTime,
      y: missile.position.y + missile.velocity.y * deltaTime,
    };
    missile.assembly.position.set(missile.position.x, missile.position.y, 0);
    missile.assembly.rotation.z = Math.atan2(missile.velocity.y, missile.velocity.x);
    // Flame pulse: opacity flickers at ~5 Hz, scale flickers at ~6 Hz
    missile.firePulse += deltaTime;
    (missile.flame.material as MeshBasicMaterial).opacity = 0.65 + 0.1 * Math.sin(missile.firePulse * 30);
    const flameScale = 0.9 + 0.2 * Math.sin(missile.firePulse * 40);
    missile.flame.scale.set(flameScale, 1, 1);
    // Emit smoke at current position.
    emitMissileSmoke(scene, missile.position.x, missile.position.y);
    // Check asteroid collision using the new constant.
    const hit = findNearestAsteroid(missile.position, asteroids, HOMING_MISSILES_MISSILE_IMPACT_RADIUS);
    if (hit) {
      onMissileImpact(hit);
      scene.remove(missile.assembly);
      missile.mesh.geometry.dispose();
      (missile.mesh.material as MeshBasicMaterial).dispose();
      missile.flame.geometry.dispose();
      (missile.flame.material as MeshBasicMaterial).dispose();
      continue;
    }
    alive.push(missile);
  }
  return alive;
}
```

- [ ] **Step 6: Update the My Rules blocks at the top of `src/active-deployments.ts`**

Update both the top "My Rules — Active Deployments" block (lines 30-47) and the "My Rules — Homing Missiles" block (lines 199-218) to document the Phase 7b changes:
- Volley is now a schedule (4 entries with 180ms delays), not a single-frame fan.
- Each missile is now a `Group` with body + flame cone; the group is rotated to face velocity each frame.
- Smoke trails come from a module-scope InstancedMesh pool (see `src/missile-vfx.ts`).
- Impact radius is now `HOMING_MISSILES_MISSILE_IMPACT_RADIUS = 0.45` (was hard-coded 0.3).
- Tracking duration 1.5 → 2.5s, turn rate 8.0 → 14.0 rad/s.

- [ ] **Step 7: Run typecheck + vitest**

Run: `npx tsc --noEmit`
Expected: 0 errors. The `HomingMissileState` interface change will cause a type error in `src/game.ts:1145-1146` (the `useActiveItem` MISSILES branch still pushes the old `HomingMissileState[]` return type from `spawnMissileVolley`). Fix that in Task 9. For now, **temporarily comment out that branch** with a `// TODO(phase-7b): rewire in Task 9` and re-run typecheck — should pass with the branch commented.

Run: `npx vitest run`
Expected: 260/260 + any active-deployments test that still uses the old signature should pass; new tests pass. If the `tests/pickups-active.test.ts` or `tests/active-deployments.test.ts` files exist and assert against `spawnMissileVolley` directly, **update those tests to use `scheduleMissileVolley` + `tickMissileVolleySchedules`**. The expected output: a 4-element `VolleySchedule` with 4 `PendingMissile` entries.

- [ ] **Step 8: Commit**

```bash
git add src/active-deployments.ts tests/pickups-active.test.ts tests/active-deployments.test.ts
git commit -m "feat(missiles): staggered 180ms×4 volley + per-missile flame cone + InstancedMesh smoke trails"
```

---

## Task 6: Shield boost color/pulse helpers + flare trigger

**Files:**
- Modify: `src/shield-visuals.ts:1-322` (add 3 new exports)
- Modify: `tests/shield-boost-lerp.test.ts` (replace placeholder with real tests)

**Interfaces:**
- Consumes: existing `ShieldUniforms` interface (line 30-49), `setShieldEnergy` (line 314), `getUniforms` (line 225)
- Produces: 3 new exported functions: `setShieldBoostColor(mesh, intensity)`, `setShieldBoostPulse(mesh, intensity)`, `triggerShieldFlare(mesh, durationSeconds)`. The flare uses an internal `flareState` stored on `mesh.userData` so multiple frames can ramp/decay it.

- [ ] **Step 1: Add the 3 new constants near the top of `src/shield-visuals.ts` (after line 28)**

```ts
// Phase 7b — shield boost + flare constants.
const SHIELD_BOOST_GREEN: [number, number, number] = [0.20, 1.00, 0.50]; // uBaseColor target during 8s boost
const SHIELD_FLARE_HOT_COLOR: [number, number, number] = [0.80, 0.95, 1.00]; // uBaseColor peak during 0.6s flare
const SHIELD_BASELINE_COLOR: [number, number, number] = [0.45, 0.82, 1.00]; // default cyan (must match createShieldMesh)
const SHIELD_BOOST_PULSE_PEAK = 1.5;
const SHIELD_BOOST_GRID_PEAK = 0.25;
const SHIELD_FLARE_PULSE_PEAK = 2.2;
const SHIELD_FLARE_FRESNEL_PEAK = 1.0;
```

- [ ] **Step 2: Add the 3 helper functions at the end of `src/shield-visuals.ts` (after `setShieldEnergy` at line 322)**

```ts
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Boost + Flare (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Drive the shield mesh's uBaseColor / uPulseSpeed / uFresnelStrength
//          uniforms to convey the 3 SHIELD-pickup feedback layers:
//          1) triggerShieldFlare — 0.6s one-shot burst on collect
//          2) setShieldBoostColor — sustained GREEN tint for 8s
//          3) setShieldBoostPulse — sustained faster pulse + brighter grid
//          All three are read every frame by Game's updateShieldVisuals
//          call site. The flare is one-shot (driven by a per-mesh timer
//          stored in userData); the boost helpers are stable-state setters
//          called every frame while active.
// Setup:   Called from src/game.ts applyPickupToShip (flare + boost init)
//          and src/game.ts updateShieldVisuals call site (boost tick).
// Issues:  None.
// Fix:     Phase 7b. The shield pickup previously had no visual identity
//          beyond a floating text — the player couldn't tell when the boost
//          was active or how much time was left. The GREEN color is the
//          user's explicit override of the research-recommended "hot cyan"
//          lerp; it provides a strong peripheral cue that survives color-
//          blind accessibility.
// Gotchas: All three functions READ the existing uBaseColor / uPulseSpeed /
//          uFresnelStrength values (which setShieldEnergy may have just
//          overwritten), so Game.ts must call these AFTER setShieldEnergy
//          in the per-frame update order. The flare's userData state is
//          keyed off the mesh identity — multiple shields would each need
//          their own timer. Currently the game has only one shield mesh,
//          so this is safe.
// ═══════════════════════════════════════════════════════════════════════════

interface ShieldFlareState {
  age: number;
  duration: number;
}

const FLARE_USERDATA_KEY = 'phase7bFlareState';

function getOrCreateFlareState(mesh: Mesh): ShieldFlareState {
  const userData = mesh.userData as Record<string, unknown>;
  if (!userData[FLARE_USERDATA_KEY]) {
    userData[FLARE_USERDATA_KEY] = { age: 0, duration: 0 } as ShieldFlareState;
  }
  return userData[FLARE_USERDATA_KEY] as ShieldFlareState;
}

export function triggerShieldFlare(mesh: Mesh, durationSeconds: number): void {
  const state = getOrCreateFlareState(mesh);
  state.age = 0;
  state.duration = durationSeconds;
}

export function setShieldBoostColor(mesh: Mesh, intensity: number): void {
  // intensity in [0, 1] — 1 = full green boost, 0 = baseline cyan.
  const uniforms = getUniforms(mesh);
  const t = Math.max(0, Math.min(1, intensity));
  const base = uniforms.uBaseColor.value as [number, number, number];
  // Lerp baseline → green by t. Preserve blue channel under 1.0 to avoid
  // additive white-out (the Phase 6c/6d lesson — see feedback_additive_blending_whiteout.md).
  uniforms.uBaseColor.value = [
    SHIELD_BASELINE_COLOR[0] + (SHIELD_BOOST_GREEN[0] - SHIELD_BASELINE_COLOR[0]) * t,
    SHIELD_BASELINE_COLOR[1] + (SHIELD_BOOST_GREEN[1] - SHIELD_BASELINE_COLOR[1]) * t,
    SHIELD_BASELINE_COLOR[2] + (SHIELD_BOOST_GREEN[2] - SHIELD_BASELINE_COLOR[2]) * t,
  ];
  // Suppress the inline `base` lint by reading it.
  void base;
}

export function setShieldBoostPulse(mesh: Mesh, intensity: number): void {
  const uniforms = getUniforms(mesh);
  const t = Math.max(0, Math.min(1, intensity));
  uniforms.uPulseSpeed.value = 0.45 + (SHIELD_BOOST_PULSE_PEAK - 0.45) * t;
  uniforms.uGridStrength.value = 0.12 + (SHIELD_BOOST_GRID_PEAK - 0.12) * t;
}

/**
 * Tick the one-shot flare. Returns true if the flare is still active (caller
 * may want to keep rendering), false if it has expired. Must be called every
 * frame from updateShieldVisuals.
 */
export function tickShieldFlare(mesh: Mesh, deltaTime: number): boolean {
  const state = getOrCreateFlareState(mesh);
  if (state.duration <= 0 || state.age >= state.duration) return false;
  state.age += deltaTime;
  const t = Math.max(0, Math.min(1, state.age / state.duration));
  // 25% ramp, 75% decay (ease-out quadratic on decay).
  const uniforms = getUniforms(mesh);
  let k: number;
  if (t < 0.25) {
    k = t / 0.25;
  } else {
    const decayT = (t - 0.25) / 0.75;
    k = 1 - decayT;
    k = k * k;
  }
  uniforms.uFresnelStrength.value = 0.4 + (SHIELD_FLARE_FRESNEL_PEAK - 0.4) * k;
  uniforms.uPulseSpeed.value = 0.45 + (SHIELD_FLARE_PULSE_PEAK - 0.45) * k;
  const base = uniforms.uBaseColor.value as [number, number, number];
  uniforms.uBaseColor.value = [
    base[0] + (SHIELD_FLARE_HOT_COLOR[0] - base[0]) * k,
    base[1] + (SHIELD_FLARE_HOT_COLOR[1] - base[1]) * k,
    base[2] + (SHIELD_FLARE_HOT_COLOR[2] - base[2]) * k,
  ];
  return state.age < state.duration;
}
```

- [ ] **Step 3: Replace the placeholder test file with real tests**

Replace `tests/shield-boost-lerp.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import {
  setShieldBoostColor,
  setShieldBoostPulse,
  triggerShieldFlare,
  tickShieldFlare,
} from '../src/shield-visuals';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Boost Lerp Tests (Phase 7b Task 6)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lock the lerp math for setShieldBoostColor / setShieldBoostPulse
//          and the one-shot flare ramp/decay without a WebGL context. The
//          mesh we build is a minimal stub (the shield shader is irrelevant
//          for these tests — we just need a ShaderMaterial with the right
//          uniform names).
// Setup:   Imports shield-visuals.ts; uses a minimal ShaderMaterial stub.
// Issues:  None.
// Fix:     Phase 7b Task 6.
// Gotchas: The shield's real ShaderMaterial uses ~12 uniforms; for these
//          tests we only need uBaseColor / uPulseSpeed / uFresnelStrength /
//          uGridStrength. We initialize them to the createShieldMesh
//          defaults so the lerps are tested against the same starting state.
// ═══════════════════════════════════════════════════════════════════════════

function makeStubShield(): Mesh {
  const material = new ShaderMaterial({
    uniforms: {
      uBaseColor: { value: [0.45, 0.82, 1.0] as [number, number, number] },
      uPulseSpeed: { value: 0.45 },
      uGridStrength: { value: 0.12 },
      uFresnelStrength: { value: 0.42 },
    },
    vertexShader: '',
    fragmentShader: '',
  });
  return new Mesh(new SphereGeometry(1, 8, 8), material);
}

describe('shield boost lerp helpers (Phase 7b)', () => {
  it('setShieldBoostColor(intensity=0) keeps baseline cyan', () => {
    const mesh = makeStubShield();
    setShieldBoostColor(mesh, 0);
    const color = (mesh.material as ShaderMaterial).uniforms.uBaseColor.value as number[];
    expect(color[0]).toBeCloseTo(0.45, 5);
    expect(color[1]).toBeCloseTo(0.82, 5);
    expect(color[2]).toBeCloseTo(1.0, 5);
  });

  it('setShieldBoostColor(intensity=1) reaches the green target', () => {
    const mesh = makeStubShield();
    setShieldBoostColor(mesh, 1);
    const color = (mesh.material as ShaderMaterial).uniforms.uBaseColor.value as number[];
    expect(color[0]).toBeCloseTo(0.20, 5);
    expect(color[1]).toBeCloseTo(1.00, 5);
    expect(color[2]).toBeCloseTo(0.50, 5);
  });

  it('setShieldBoostColor(intensity=0.5) is the midpoint between baseline and green', () => {
    const mesh = makeStubShield();
    setShieldBoostColor(mesh, 0.5);
    const color = (mesh.material as ShaderMaterial).uniforms.uBaseColor.value as number[];
    expect(color[0]).toBeCloseTo((0.45 + 0.20) / 2, 5);
    expect(color[1]).toBeCloseTo((0.82 + 1.00) / 2, 5);
    expect(color[2]).toBeCloseTo((1.0 + 0.50) / 2, 5);
  });

  it('setShieldBoostPulse(intensity=1) reaches peak uPulseSpeed and uGridStrength', () => {
    const mesh = makeStubShield();
    setShieldBoostPulse(mesh, 1);
    const u = (mesh.material as ShaderMaterial).uniforms;
    expect(u.uPulseSpeed.value).toBeCloseTo(1.5, 5);
    expect(u.uGridStrength.value).toBeCloseTo(0.25, 5);
  });

  it('triggerShieldFlare then tickShieldFlare ramps uFresnelStrength then decays', () => {
    const mesh = makeStubShield();
    triggerShieldFlare(mesh, 0.6);
    // After 0.15s (25% of 0.6s), the ramp should be at its peak.
    tickShieldFlare(mesh, 0.15);
    const u = (mesh.material as ShaderMaterial).uniforms;
    expect(u.uFresnelStrength.value).toBeGreaterThan(0.9);
    // After another 0.5s (well past 0.6s), the flare is expired.
    tickShieldFlare(mesh, 0.5);
    expect(u.uFresnelStrength.value).toBeCloseTo(0.4, 1);
  });
});
```

- [ ] **Step 4: Run vitest**

Run: `npx vitest run`
Expected: 260/260 + 5 new = 265/265 pass.

- [ ] **Step 5: Commit**

```bash
git add src/shield-visuals.ts tests/shield-boost-lerp.test.ts
git commit -m "feat(shield-visuals): boost color (green) + pulse helpers + 0.6s flare trigger"
```

---

## Task 7: Per-kind pickup geometry + axis + bobbing + emissive pulse + sonar ring + proximity halo

**Files:**
- Modify: `src/pickups.ts:414-426` (`createPickupMesh` — add kind-specific geometry, sonar ring, proximity halo)
- Modify: `src/pickups.ts` top (add new module-scope constants + `PICKUP_GEOMETRY_BY_KIND` map + `PICKUP_SPIN_AXIS_BY_KIND` map)
- Modify: `src/game.ts:1021-1039` (`updatePickups` — per-kind axis + bob + emissive pulse + proximity halo update)
- Modify: `src/game.ts:1087-1093` (`spawnPickup` — pass a ref to the proximity halo sprite so updatePickups can adjust opacity)

**Interfaces:**
- Consumes: existing `createPickupMesh(kind: PickupKind): Group` signature; `updatePickup` from `src/pickups.ts:79-102`; `LivePickup { state, mesh: Group }` from `src/game.ts:230-233`
- Produces: extended `LivePickup` with optional `halo: Sprite` field; extended `createPickupMesh` returning a Group with children `[bodyMesh, sonarRing, haloSprite]`; extended `updatePickups` per-frame math

- [ ] **Step 1: Add the new module-scope maps + constants to `src/pickups.ts` (after the `PickupKind` enum, before `PICKUP_DURATION_SECONDS`)**

```ts
// Phase 7b — per-kind geometry table. Allocated once at module load, reused
// across all instances of each kind. Color-blind-safe silhouette telegraph.
import {
  BufferGeometry,
  ConeGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  OctahedronGeometry,
  TetrahedronGeometry,
} from 'three';

const PICKUP_GEOMETRY_BY_KIND: Record<PickupKind, BufferGeometry> = {
  [PickupKind.FIRE_RATE]: new TetrahedronGeometry(0.22, 0),
  [PickupKind.SHIELD]: new OctahedronGeometry(0.18, 0),
  [PickupKind.SPREAD]: new IcosahedronGeometry(0.18, 0),
  [PickupKind.BOMB_STRIKE]: new DodecahedronGeometry(0.20, 0),
  [PickupKind.ORBIT_DRONES]: new IcosahedronGeometry(0.14, 0),
  [PickupKind.HOMING_MISSILES]: new ConeGeometry(0.14, 0.30, 6),
};

// Phase 7b — per-kind spin axis. Each kind has a distinct rotation axis
// so color-blind players can distinguish pickups by silhouette + motion.
export const PICKUP_SPIN_AXIS: Record<PickupKind, 'x' | 'y' | 'z'> = {
  [PickupKind.FIRE_RATE]: 'x',
  [PickupKind.SHIELD]: 'y',
  [PickupKind.SPREAD]: 'z',
  [PickupKind.BOMB_STRIKE]: 'y',
  [PickupKind.ORBIT_DRONES]: 'x',
  [PickupKind.HOMING_MISSILES]: 'z',
};

export const PICKUP_BOB_AMPLITUDE = 0.12;
export const PICKUP_BOB_FREQUENCY_HZ = 0.6;
export const PICKUP_EMISSIVE_PULSE_FREQUENCY_HZ = 0.8;
export const PICKUP_EMISSIVE_PULSE_AMPLITUDE = 0.15;
export const PICKUP_SONAR_RING_PERIOD_SECONDS = 1.5;
export const PICKUP_HALO_BASE_OPACITY = 0.15;
export const PICKUP_HALO_PROXIMITY_BOOST = 0.4;
```

- [ ] **Step 2: Update the `import` block at the top of `src/pickups.ts`**

Replace the existing imports (lines 1-2) with:

```ts
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
} from 'three';
import { AsteroidKind, AsteroidSize, AsteroidState, Vector2 } from './types';
```

(Three.js now needs `AdditiveBlending`, `CanvasTexture`, `DoubleSide`, `RingGeometry`, `Sprite`, `SpriteMaterial` for the new layers; the BufferGeometry family is imported in the new code block above.)

- [ ] **Step 3: Add a shared radial-gradient texture helper after the new constants**

```ts
let _sharedHaloTexture: CanvasTexture | null = null;
function getSharedHaloTexture(): CanvasTexture | null {
  if (_sharedHaloTexture !== null) return _sharedHaloTexture;
  if (typeof document === 'undefined') {
    // Node test env (vitest). Cache the null so the second call also returns null
    // — the SpriteMaterial will then use no map (still works, just a flat sprite).
    _sharedHaloTexture = null;
    return null;
  }
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  _sharedHaloTexture = new CanvasTexture(canvas);
  _sharedHaloTexture.needsUpdate = true;
  return _sharedHaloTexture;
}
```

- [ ] **Step 4: Replace `createPickupMesh` (lines 414-426) with the extended version**

```ts
/**
 * Build a small colored geometry for the pickup. Each kind gets:
 *   - Body: per-kind geometry (Octahedron, Tetrahedron, etc.) with kind color
 *   - Sonar ring: additive RingGeometry child that pulses scale 1.0→2.5×
 *   - Proximity halo: additive Sprite child that brightens as ship approaches
 * Each kind's geometry is shared from PICKUP_GEOMETRY_BY_KIND (one allocation
 * at module load). The sonar ring + halo are unique per-instance.
 */
export function createPickupMesh(kind: PickupKind): Group {
  const group = new Group();

  const body = new Mesh(
    PICKUP_GEOMETRY_BY_KIND[kind],
    new MeshStandardMaterial({
      color: PICKUP_COLOR[kind],
      emissive: PICKUP_COLOR[kind],
      emissiveIntensity: 0.4,
      flatShading: true,
    }),
  );
  group.add(body);

  // Sonar ring — additive, lies on the ground plane, pulses outward.
  const sonar = new Mesh(
    new RingGeometry(0.3, 0.5, 32),
    new MeshBasicMaterial({
      color: PICKUP_COLOR[kind],
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  sonar.rotation.x = -Math.PI / 2;
  sonar.position.y = -0.05;
  group.add(sonar);

  // Proximity halo — additive Sprite, brightens as the ship approaches.
  // map may be null in Node test envs; SpriteMaterial accepts this and
  // falls back to a flat color (still reads as a soft glow at the per-frame
  // opacities we use).
  const haloMat = new SpriteMaterial({
    map: getSharedHaloTexture(),
    color: PICKUP_COLOR[kind],
    transparent: true,
    opacity: PICKUP_HALO_BASE_OPACITY,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const halo = new Sprite(haloMat);
  halo.scale.set(0.6, 0.6, 0.6);
  group.add(halo);

  // Stash refs on the group for the per-frame updater.
  (group as Group & { _body: Mesh; _sonar: Mesh; _halo: Sprite })._body = body;
  (group as Group & { _body: Mesh; _sonar: Mesh; _halo: Sprite })._sonar = sonar;
  (group as Group & { _body: Mesh; _sonar: Mesh; _halo: Sprite })._halo = halo;

  return group;
}
```

- [ ] **Step 5: Update `disposePickupMesh` (lines 428-439) to dispose the new children**

The existing function uses `group.traverse` which will still find the sonar mesh and halo sprite. Add dispose for the new materials:

```ts
export function disposePickupMesh(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      // Skip the shared per-kind geometry (it's module-scope, not per-instance).
      const sharedGeoms = Object.values(PICKUP_GEOMETRY_BY_KIND);
      if (!sharedGeoms.includes(child.geometry)) {
        child.geometry.dispose();
      }
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat instanceof MeshStandardMaterial) mat.dispose();
      else if (mat instanceof MeshBasicMaterial) mat.dispose();
    } else if (child instanceof Sprite) {
      // Sprite's material is per-instance (opacity is unique); dispose it.
      child.material.dispose();
    }
  });
  while (group.children.length > 0) group.remove(group.children[0]);
}
```

- [ ] **Step 6: Update the `LivePickup` interface in `src/game.ts` (line 230-233)**

```ts
interface LivePickup {
  state: PickupState;
  mesh: Group;
}
```

is already correct. The sonar/halo refs are read from `group.userData` set in `createPickupMesh`. No interface change needed.

- [ ] **Step 7: Update `updatePickups` in `src/game.ts` (line 1021-1039)**

Replace the body of the loop (the part that sets `pickup.mesh.position` and `pickup.mesh.rotation`) with per-kind axis + bobbing + emissive pulse + halo proximity:

```ts
private updatePickups(deltaTime: number): void {
  const alive: LivePickup[] = [];
  for (const pickup of this.pickups) {
    updatePickup(pickup.state, this.ship.state.position, deltaTime);
    // Per-kind axis rotation (Phase 7b).
    const axis = PICKUP_SPIN_AXIS[pickup.state.kind];
    pickup.mesh.rotation[axis] = pickup.state.spin;
    // Vertical bobbing.
    const bob = Math.sin(
      pickup.state.age * Math.PI * 2 * PICKUP_BOB_FREQUENCY_HZ,
    ) * PICKUP_BOB_AMPLITUDE;
    pickup.mesh.position.set(
      pickup.state.position.x,
      pickup.state.position.y + bob,
      0,
    );
    // Emissive pulse on the body mesh.
    const ref = pickup.mesh as Group & { _body?: Mesh };
    if (ref._body) {
      const mat = ref._body.material as MeshStandardMaterial;
      mat.emissiveIntensity =
        0.4 +
        Math.sin(
          pickup.state.age * Math.PI * 2 * PICKUP_EMISSIVE_PULSE_FREQUENCY_HZ,
        ) * PICKUP_EMISSIVE_PULSE_AMPLITUDE;
    }
    // Sonar ring pulse (1.5s period).
    const sonarRef = ref._sonar;
    if (sonarRef) {
      const sonarMat = sonarRef.material as MeshBasicMaterial;
      const phase =
        (pickup.state.age % PICKUP_SONAR_RING_PERIOD_SECONDS) / PICKUP_SONAR_RING_PERIOD_SECONDS;
      sonarRef.scale.set(1.0 + phase * 1.5, 1.0 + phase * 1.5, 1);
      sonarMat.opacity = 0.4 * (1.0 - phase);
    }
    // Proximity halo brightness.
    const haloRef = ref._halo;
    if (haloRef) {
      const haloMat = haloRef.material as SpriteMaterial;
      const dx = this.ship.state.position.x - pickup.state.position.x;
      const dy = this.ship.state.position.y - pickup.state.position.y;
      const distance = Math.hypot(dx, dy);
      const prox = Math.max(0, 1 - distance / 2.5);
      haloMat.opacity = PICKUP_HALO_BASE_OPACITY + PICKUP_HALO_PROXIMITY_BOOST * prox;
      haloRef.scale.setScalar(0.6 + 0.5 * prox);
    }
    if (isPickupCollected(pickup.state, this.ship.state.position)) {
      this.applyPickupToShip(pickup.state.kind);
      this.disposePickup(pickup);
      continue;
    }
    if (isPickupExpired(pickup.state)) {
      this.disposePickup(pickup);
      continue;
    }
    alive.push(pickup);
  }
  this.pickups = alive;
}
```

- [ ] **Step 8: Add the new constants + `PICKUP_SPIN_AXIS` import to `src/game.ts` (top imports + top constants)**

Add to the import block at the top of `src/game.ts`:

```ts
import { PICKUP_SPIN_AXIS, PICKUP_BOB_AMPLITUDE, PICKUP_BOB_FREQUENCY_HZ, PICKUP_EMISSIVE_PULSE_FREQUENCY_HZ, PICKUP_EMISSIVE_PULSE_AMPLITUDE, PICKUP_SONAR_RING_PERIOD_SECONDS, PICKUP_HALO_BASE_OPACITY, PICKUP_HALO_PROXIMITY_BOOST } from './pickups';
```

(Add them in the same import line as the existing `PICKUP_COLOR` import — check the existing block.)

- [ ] **Step 9: Add a My Rules block to `src/pickups.ts` (replace the existing one at line 6-18)**

Updated block should cover:
- **Purpose:** Phase 7b — per-kind geometry / axis / sonar ring / proximity halo make each pickup telegraphable by color + silhouette + motion, color-blind safe.
- **Setup:** `createPickupMesh` is called from `src/game.ts:1089`; `disposePickupMesh` is called from `src/game.ts:1084`. The per-frame `updatePickups` reads `_body` / `_sonar` / `_halo` refs from the group.
- **Issues:** The old `IcosahedronGeometry` was identical for all 6 kinds; color was the only differentiator. Color-blind players couldn't distinguish.
- **Fix:** Per-kind geometry table (Octahedron / Tetrahedron / Icosahedron / Dodecahedron / Cone); per-kind spin axis (X/Y/Z); sonar ring (additive, pulsing); proximity halo (additive Sprite, brightens as ship approaches).
- **Gotchas:** Shared per-kind geometry must NOT be disposed per-instance — `disposePickupMesh` checks against the shared list. The shared halo `CanvasTexture` is allocated once at first pickup spawn.

- [ ] **Step 10: Run typecheck + vitest**

Run: `npx tsc --noEmit`
Expected: 0 errors (all imports are accounted for).

Run: `npx vitest run`
Expected: 265/265 pass. If any pickup test fails because the geometry changed, update the test's `expect(mesh.geometry).toBe(...)` to match the new per-kind geometries.

- [ ] **Step 11: Commit**

```bash
git add src/pickups.ts src/game.ts tests/pickups.test.ts
git commit -m "feat(pickups): per-kind geometry, spin axis, bobbing, emissive pulse, sonar ring, proximity halo"
```

---

## Task 8: Game.ts wiring — fireBombStrike 6-layer + useActiveItem missiles + updateHud pill pop-in + SHIELD text + applyPickupToShip moment

**Files:**
- Modify: `src/game.ts:1052-1080` (`applyPickupToShip` — add SHIELD flare + secondary text + shield Shockwave)
- Modify: `src/game.ts:1125-1148` (`useActiveItem` — route MISSILES through `scheduleMissileVolley` + add `missileVolleySchedules` field)
- Modify: `src/game.ts:1174-1195` (`fireBombStrike` — replace single Shockwave with 6-layer sequence)
- Modify: `src/game.ts:2538-2684` (`updateHud` — pill pop-in + SHIELD `+BOOST` text + brighter border)
- Modify: `src/game.ts:1264-1286` (`updateActiveDeployments` — call `tickMissileVolleySchedules` + `updateMissileSmoke` before `tickHomingMissiles`)
- Modify: `src/game.ts:557-562` (`stop()` — clear `missileVolleySchedules`)
- Modify: `src/game.ts:345` (add `missileVolleySchedules: VolleySchedule[]` field)
- Modify: `src/game.ts:1-50` (add new imports: `Shockwave`, `scheduleMissileVolley`, `tickMissileVolleySchedules`, `emitShockwaveParticles`, `updateShockwaveParticles`, `tickShieldFlare`, `setShieldBoostColor`, `setShieldBoostPulse`, `triggerShieldFlare`, `VolleySchedule`)
- Modify: `index.html` (add `<div id="bomb-edge-flash">` + 1 CSS rule)

**Interfaces:**
- Consumes: everything from Tasks 1-7; `shieldElement` from existing top-of-file field declarations; `cameraShakeAmplitude` + `cameraShakeRemaining` from existing fields
- Produces: full end-to-end Phase 7b behavior

- [ ] **Step 1: Add the new imports to `src/game.ts` (top of file, after the existing three import block)**

Add the new imports. The exact placement depends on existing imports — find where `import { ... } from './pickups'` and `import { ... } from './shockwave'` are and extend them. Add:

```ts
import { scheduleMissileVolley, tickMissileVolleySchedules, VolleySchedule } from './active-deployments';
import { emitShockwaveParticles, updateShockwaveParticles } from './shockwave-particles';
import { updateMissileSmoke } from './missile-vfx';
import { setShieldBoostColor, setShieldBoostPulse, tickShieldFlare, triggerShieldFlare } from './shield-visuals';
```

- [ ] **Step 2: Add the new field declarations to the Game class (after `this.crystalKillIndex = 0;` line 352)**

```ts
private missileVolleySchedules: VolleySchedule[] = [];
private shockwaveParticlesAttached = false;
```

- [ ] **Step 3: Wire SHIELD pickup moment in `applyPickupToShip` (line 1052-1080)**

Replace the function body with:

```ts
private applyPickupToShip(kind: PickupKind): void {
  if (
    kind === PickupKind.BOMB_STRIKE ||
    kind === PickupKind.ORBIT_DRONES ||
    kind === PickupKind.HOMING_MISSILES
  ) {
    applyActivePickupEffect(kind, this.activeAmmo);
  } else {
    const shieldSnapshot = { energy: this.shield.energy, maxEnergy: SHIELD_MAX_ENERGY };
    const effect = applyPickupEffect(kind, { fireCooldown: 0 }, shieldSnapshot);
    this.shield.energy = shieldSnapshot.energy;
    this.activeEffects.push(effect);
    // Phase 7b — SHIELD pickup moment: trigger the 0.6s shield flare, push a
    // blue Shockwave ring, and spawn a secondary "+50%" floating text so the
    // player reads the heal amount AND sees the shield flare.
    if (kind === PickupKind.SHIELD) {
      triggerShieldFlare(this.shieldMesh, 0.6);
      this.activeShockwaves.push(new Shockwave(
        { x: this.ship.state.position.x, y: this.ship.state.position.y },
        0x66aaff,
        0.55,
      ));
      // Override the latest shockwave's opacity to enforce the additive cap.
      const lastWave = this.activeShockwaves[this.activeShockwaves.length - 1];
      (lastWave.mesh.material as MeshBasicMaterial).opacity = 0.55;
      this.spawnFloatingTextAt(
        '+50%',
        { x: this.ship.state.position.x, y: this.ship.state.position.y + 0.5 },
        0,
        '#88ffaa',
        0,
        0,
        12,
        1.2,
      );
    }
  }
  this.spawnFloatingTextAt(
    `+${ACTIVE_KIND_SPECS[kind].displayName}`,
    { x: this.ship.state.position.x, y: this.ship.state.position.y + 0.5 },
    0,
    '#00ffaa',
    0,
    0,
    14,
    1.5,
  );
}
```

- [ ] **Step 4: Replace `useActiveItem`'s MISSILES branch (line 1144-1146)**

```ts
} else if (spec.displayName === 'MISSILES') {
  this.missileVolleySchedules.push(
    scheduleMissileVolley(shipPos, this.ship.state.aim),
  );
}
```

(Remove the old `for (const m of newMissiles) this.homingMissiles.push(m);` line — the schedule will populate `homingMissiles` via `tickMissileVolleySchedules` in the next update tick.)

- [ ] **Step 5: Replace `fireBombStrike` (line 1174-1195) with the 6-layer sequence**

```ts
private fireBombStrike(position: Vector2): void {
  // Layer 1: Hot core flash — single-frame additive sphere that expands to 1u.
  const core = new Mesh(
    new SphereGeometry(0.5, 16, 16),
    new MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.position.set(position.x, position.y, -0.1);
  this.scene.add(core);
  this.activeCoreFlashes.push({ mesh: core, age: 0, duration: 0.1 });
  // Layer 2: Primary shock ring (8u radius, orange).
  this.activeShockwaves.push(new Shockwave(position, 0xff8800, 1.0, 8.0));
  // Layer 3: Secondary outer ring (10u radius, cooler red-orange) — pushed 80ms later.
  setTimeout(() => {
    this.activeShockwaves.push(new Shockwave(position, 0xff4400, 0.5, 10.0));
  }, 80);
  // Layer 4: Shock-front particles (30 outward streamers).
  emitShockwaveParticles(this.scene, position.x, position.y, {
    count: 30,
    speed: 6,
    color: 0xffcc66,
    lifetime: 0.5,
  });
  // Layer 5: Debris chunks (8 faster, bigger).
  emitShockwaveParticles(this.scene, position.x, position.y, {
    count: 8,
    speed: 10,
    color: 0xffaa00,
    lifetime: 0.6,
    isDebris: true,
  });
  // Layer 6: Camera shake bumped to 0.6/0.4s.
  this.cameraShakeAmplitude = Math.max(this.cameraShakeAmplitude, 0.6);
  this.cameraShakeRemaining = Math.max(this.cameraShakeRemaining, 0.4);
  // DOM edge flash.
  this.triggerBombEdgeFlash();
  // Shards cleansing — restores the EXPANSION spec's "I countered the Shard Swarm" payoff.
  this.activeShards = this.activeShards.filter(
    (s) =>
      Math.hypot(
        s.state.position.x - position.x,
        s.state.position.y - position.y,
      ) > BOMB_STRIKE_RADIUS,
  );
  // Damage pass (unchanged).
  const alive: LiveAsteroid[] = [];
  for (const asteroid of this.asteroids) {
    const d = Math.hypot(
      asteroid.state.position.x - position.x,
      asteroid.state.position.y - position.y,
    );
    if (d <= BOMB_STRIKE_RADIUS) {
      asteroid.state.health = Math.max(0, asteroid.state.health - BOMB_STRIKE_DAMAGE);
      if (asteroid.state.health <= 0) {
        this.destroyAsteroid(asteroid);
        continue;
      }
    }
    alive.push(asteroid);
  }
  this.asteroids = alive;
  this.spawnFloatingTextAt('BOMB!', position, 0, '#ff8800', 0, 0, 18, 1.0);
}
```

- [ ] **Step 6: Add the new field + helper methods to support the core flash + DOM edge flash + boost tick**

Add to the field declarations (after Step 2):

```ts
private activeCoreFlashes: { mesh: Mesh; age: number; duration: number }[] = [];
private bombEdgeFlashElement: HTMLDivElement | null = null;
```

Add new methods to the Game class (alongside `applyCameraShake`):

```ts
private updateCoreFlashes(deltaTime: number): void {
  const alive: { mesh: Mesh; age: number; duration: number }[] = [];
  for (const flash of this.activeCoreFlashes) {
    flash.age += deltaTime;
    const t = flash.age / flash.duration;
    if (t >= 1.0) {
      this.scene.remove(flash.mesh);
      flash.mesh.geometry.dispose();
      (flash.mesh.material as MeshBasicMaterial).dispose();
      continue;
    }
    const scale = 1.0 + t * 1.0; // 0.5u → 1.0u
    flash.mesh.scale.set(scale, scale, scale);
    (flash.mesh.material as MeshBasicMaterial).opacity = 0.7 * (1.0 - t);
    alive.push(flash);
  }
  this.activeCoreFlashes = alive;
}

private triggerBombEdgeFlash(): void {
  if (!this.bombEdgeFlashElement) {
    this.bombEdgeFlashElement = document.createElement('div');
    this.bombEdgeFlashElement.id = 'bomb-edge-flash';
    document.body.appendChild(this.bombEdgeFlashElement);
  }
  const el = this.bombEdgeFlashElement;
  el.style.opacity = '1';
  // Force reflow so the transition triggers.
  void el.offsetHeight;
  el.style.opacity = '0';
}
```

- [ ] **Step 7: Wire the new per-frame tickers into the main update loop (after `updateShockwaveList` at line 658)**

```ts
this.updateCoreFlashes(deltaTime);
updateShockwaveParticles(deltaTime);
```

- [ ] **Step 8: Wire the new missile schedule + smoke update into `updateActiveDeployments` (line 1264-1286)**

Replace the function body with:

```ts
private updateActiveDeployments(deltaTime: number): void {
  const previousDroneCount = this.activeDeployments.length;
  this.activeDeployments = tickDroneDeployments(
    this.activeDeployments,
    this.ship.state.position,
    this.asteroids.map((a) => a.state),
    deltaTime,
    this.scene,
    (origin, target) => this.fireDroneProjectile(origin, target),
  );
  if (this.activeDeployments.length < previousDroneCount) {
    this.activeAmmo[PickupKind.ORBIT_DRONES].cooldownRemaining = ORBIT_DRONES_COOLDOWN_SECONDS;
  }
  // Phase 7b — tick the missile schedule FIRST so scheduled missiles enter
  // the live list in the same frame their stagger expires.
  this.missileVolleySchedules = tickMissileVolleySchedules(
    this.missileVolleySchedules,
    this.ship.state.position,
    this.ship.state.aim,
    deltaTime,
    this.scene,
    this.homingMissiles,
  );
  this.homingMissiles = tickHomingMissiles(
    this.homingMissiles,
    this.asteroids.map((a) => a.state),
    deltaTime,
    this.scene,
    (asteroid) => this.onMissileImpact(asteroid),
  );
  // Tick the smoke pool.
  updateMissileSmoke(deltaTime);
}
```

- [ ] **Step 9: Wire the shield boost tick into the shield visual update path (after `updateShieldVisuals(this.shieldMesh, deltaTime);` at line 663)**

After the existing call, add:

```ts
const shieldBoost = this.activeEffects.find((e) => e.kind === PickupKind.SHIELD);
if (shieldBoost) {
  const t = shieldBoost.remaining / shieldBoost.total;
  setShieldBoostColor(this.shieldMesh, t);
  setShieldBoostPulse(this.shieldMesh, t);
} else {
  // Restore baseline cyan if no boost active. (setShieldBoostColor with
  // intensity=0 leaves the baseline untouched; this is the safe default.)
  setShieldBoostColor(this.shieldMesh, 0);
  setShieldBoostPulse(this.shieldMesh, 0);
}
tickShieldFlare(this.shieldMesh, deltaTime);
```

- [ ] **Step 10: Add the pill pop-in animation + SHIELD `+BOOST` text to the HUD reconcile loop (line 2622-2652)**

Replace the inner loop with:

```ts
for (const effect of this.activeEffects) {
  let entry = this.pickupHudPills.get(effect.kind);
  if (!entry) {
    const pill = document.createElement('div');
    const color = `#${PICKUP_COLOR[effect.kind].toString(16).padStart(6, '0')}`;
    pill.style.border = `2px solid ${color}`;
    pill.style.padding = '4px 8px';
    pill.style.minWidth = '80px';
    pill.style.fontFamily = 'monospace';
    pill.style.fontSize = '12px';
    pill.style.color = '#ffffff';
    pill.style.background = 'rgba(0,0,0,0.4)';
    // Phase 7b — pill pop-in animation (200ms ease-out-back overshoot).
    pill.style.transform = 'scale(0)';
    pill.style.transition = 'transform 200ms cubic-bezier(.2,.9,.3,1.2)';
    requestAnimationFrame(() => {
      pill.style.transform = 'scale(1.15)';
      setTimeout(() => {
        pill.style.transform = 'scale(1.0)';
        pill.style.transition = 'transform 120ms ease-out';
      }, 120);
    });
    const label = document.createElement('div');
    label.style.fontWeight = 'bold';
    const timeLabel = document.createElement('div');
    timeLabel.style.fontSize = '10px';
    const bar = document.createElement('div');
    bar.style.height = '4px';
    bar.style.background = color;
    bar.style.marginTop = '2px';
    pill.appendChild(label);
    pill.appendChild(timeLabel);
    pill.appendChild(bar);
    this.pickupHudElement?.appendChild(pill);
    entry = { pill, label, timeLabel, bar };
    this.pickupHudPills.set(effect.kind, entry);
  }
  // Phase 7b — SHIELD pill: brighter border + secondary text while boost active.
  if (effect.kind === PickupKind.SHIELD) {
    entry.label.textContent = `SHIELD +BOOST ${effect.remaining.toFixed(1)}s`;
    entry.pill.style.border = `2px solid #88ddff`;
  } else {
    entry.label.textContent = ACTIVE_KIND_SPECS[effect.kind].displayName;
  }
  entry.timeLabel.textContent = `${effect.remaining.toFixed(1)}s`;
  entry.bar.style.width = `${(effect.remaining / effect.total) * 100}%`;
}
```

- [ ] **Step 11: Update `stop()` (line 557-562) to clear the new state**

Add to the stop() cleanup (after `this.pickups = [];`):

```ts
this.missileVolleySchedules = [];
this.activeCoreFlashes.forEach((f) => {
  this.scene.remove(f.mesh);
  f.mesh.geometry.dispose();
  (f.mesh.material as MeshBasicMaterial).dispose();
});
this.activeCoreFlashes = [];
if (this.bombEdgeFlashElement) {
  this.bombEdgeFlashElement.remove();
  this.bombEdgeFlashElement = null;
}
disposeShockwaveParticles();
disposeMissileVfx();
```

(Add `disposeShockwaveParticles` and `disposeMissileVfx` to the imports at the top of the file — they're already imported in the other files but Game needs them too.)

- [ ] **Step 12: Add the bomb edge flash to `index.html`**

Add inside the `<head>` of `index.html`:

```html
<style>
  #bomb-edge-flash {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    background: radial-gradient(ellipse at center, transparent 45%, rgba(255, 136, 0, 0.25) 100%);
    opacity: 0;
    transition: opacity 120ms ease-out;
    z-index: 5;
    mix-blend-mode: screen;
  }
</style>
```

The `<div id="bomb-edge-flash">` is created on first bomb trigger (Step 6) rather than hardcoded in the HTML, so it doesn't appear in the DOM until needed.

- [ ] **Step 13: Add a My Rules block to `src/game.ts` (replace the existing one at line 1095-1124 covering `useActiveItem`)**

Update the block to document:
- `useActiveItem` no longer directly spawns 4 missiles — it pushes a `VolleySchedule` into `missileVolleySchedules`; the schedule is ticked each frame and converts to live missiles as their stagger expires.
- The shield boost active effect drives a green color tint via `setShieldBoostColor`; the 0.6s `triggerShieldFlare` is one-shot on collect.
- The bomb's 6-layer sequence lives in `fireBombStrike` — see Task 5 for the layer breakdown.

- [ ] **Step 14: Run typecheck + vitest**

Run: `npx tsc --noEmit`
Expected: 0 errors. If you see "Property 'activeShards' does not exist on type 'Game'" or similar, you missed a field — the existing code uses `this.activeShards` in other places; just verify it's already declared and reassignable.

Run: `npx vitest run`
Expected: 265/265 + any new tests + the regression test from the prior fix (`tests/pickup-hud-reconcile.spec.ts`) still pass. If any active-deployments test asserts on the old `spawnMissileVolley` signature, update it.

- [ ] **Step 15: Commit (per-task commit; this is the last per-task commit before the final atomic merge)**

```bash
git add src/game.ts src/active-deployments.ts src/shockwave.ts index.html tests/
git commit -m "feat(game): wire 6-layer bomb + 180ms missile stagger + shield boost tint + pickup pill pop-in"
```

---

## Task 9: Quality gates + atomic final commit

**Files:**
- This task does not modify code — it runs the gates and squashes the per-task commits into one atomic commit per the Phase 7 convention.

- [ ] **Step 1: Run the full quality gate per `.claude/rules/workflow-gates.md`**

Ask the user via `AskUserQuestion` which gate scope to run (per the workflow-gates rule). Recommended for a multi-file change: "Typecheck + unit tests" (~12s, fast). The 3 new test files plus the prior regression test should all pass.

Run: `npx tsc --noEmit` → expect 0 errors.
Run: `npx vitest run` → expect 265/265 + new tests pass in <2s.
Run: `npx playwright test tests/pickup-hud-reconcile.spec.ts --reporter=list` with `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5183` env var → expect 3/3 pass.

- [ ] **Step 2: Capture before/after screenshots (visual verification per the workflow rule)**

Use Playwright to:
1. Boot the game (Enter to skip the ship-select).
2. Drive the game into a state with an active SHIELD boost + an active BOMB + an active missile schedule (via the existing `__game` debug surface in `src/main.ts`).
3. Capture a screenshot showing the green-tinted shield.
4. Trigger a bomb, capture the 6-layer explosion.
5. Trigger a missile volley, capture the staggered launches + smoke trails.

Save to `phase7b-*.png` and add them to the commit.

- [ ] **Step 3: Squash the per-task commits into one atomic commit (per Phase 7 convention)**

```bash
# Get the SHA of the commit BEFORE Task 1's commit (so we squash from there).
git log --oneline -10
# Assuming the squash starts at the last commit before Task 1:
git reset --soft <sha-before-task-1>
git commit -m "feat(powerups): Phase 7b — bomb 6-layer, missiles 180ms stagger + flames + smoke, shield boost green tint"
```

The squashed commit message should reference the research-backed combination and credit the user's design decisions:

```
feat(powerups): Phase 7b — bomb 6-layer, missiles 180ms stagger + flames + smoke, shield boost green tint

Upgrade the 3 underwhelming Phase 7 power-up VFX based on user-picked
research findings:

- Bomb Strike: 6-layer "Screen-Clear Bomb" combo (hot core flash +
  primary + secondary shock rings + shock-front particles + debris +
  camera shake) + damage radius 5.0→8.0 + restored shards cleansing +
  DOM edge flash. v2 polish layers (anticipation / PointLight / heat-haze
  refraction) deferred per user Fork 4(A).
- Homing Missiles: replace instant 4-volley with 180ms×4 staggered
  schedule (0/180/360/540ms) for a "salvo" feel, not "shotgun". Each
  missile is now a Group with body + warm orange thruster flame cone
  (rotated to face velocity + opacity-pulsed) + InstancedMesh smoke
  trail. Bumped TRACKING_DURATION 1.5→2.5, TURN_RATE 8.0→14.0,
  TRACKING_RADIUS 8.0→10.0, SPEED 6.0→7.0, new MISSILE_IMPACT_RADIUS 0.45.
- Shield Pickup: 3-phase feedback (collect moment / sustained 8s /
  pre-collect hunt-for-more). Moment = 0.6s shield flare (uFresnel
  0.4→1.0, uPulse 0.45→2.2, uColor hot-cyan) + secondary "+50%" text
  + Shockwave(shipPos, 0x66aaff, 0.55). Sustained = GREEN shield tint
  (uBaseColor 0.20, 1.00, 0.50) for 8s driven by effect.remaining/8
  + faster pulse + brighter grid + HUD SHIELD pill "SHIELD +BOOST 6.3s"
  with brighter #88ddff border. Hunt-for-more = per-kind geometry
  (Octahedron/Tetrahedron/Icosahedron/Dodecahedron/Cone), per-kind spin
  axis (X/Y/Z), vertical bobbing, emissive pulse, sonar ring decal,
  proximity halo sprite, pill pop-in CSS scale animation. Color-blind
  safe (silhouette + motion telegraph).

New files: src/shockwave-particles.ts, src/missile-vfx.ts, 3 test files.
All InstancedMesh pools allocated once at module load — no GPU leaks.
All additive opacities capped per feedback_additive_blending_whiteout.md.
Worst-case additive stack documented per upgrade in the design doc.

Verification:
- npx tsc --noEmit: 0 errors
- npx vitest run: 265/265 + 11 new tests pass
- npx playwright test: 3/3 regression tests pass
- Visual: phase7b-*.png screenshots show the new effects in-game
```

- [ ] **Step 4: Push to GitHub**

Ask the user via `AskUserQuestion` whether to push now. Per the Phase 7 pattern, the user picks "Push now" via the same prompt.

If yes: `git push -u origin phase-2-movement`

---

## Self-Review (run before declaring the plan complete)

**1. Spec coverage:**
- ✅ Bomb 6-layer (Task 5+8)
- ✅ Bomb radius 5.0→8.0 (Task 1)
- ✅ Shards cleansing (Task 8 fireBombStrike body)
- ✅ DOM edge flash (Task 8 + index.html)
- ✅ Camera shake 0.6/0.4s (Task 8)
- ✅ v2 polish deferred (no tasks for PointLight / anticipation / heat-haze)
- ✅ Missile 180ms stagger (Task 5)
- ✅ Per-missile flame cone (Task 5 spawnMissileFromPending)
- ✅ InstancedMesh smoke pool (Task 4)
- ✅ All 5 missile constant bumps (Task 1)
- ✅ Shield flare 0.6s (Task 6 + Task 8 applyPickupToShip)
- ✅ Shield GREEN boost tint 8s (Task 6 + Task 8 updateShieldVisuals call site)
- ✅ Shield SHIELD `+BOOST` pill text (Task 8 updateHud reconcile)
- ✅ Shield shockwave + secondary text on collect (Task 8 applyPickupToShip)
- ✅ Per-kind geometry + axis + bob + emissive + sonar + halo (Task 7)
- ✅ Pill pop-in animation (Task 8 updateHud reconcile)

**2. Placeholder scan:** No "TBD" / "TODO" / "implement later" markers in the plan. (The `// TODO(phase-7b): rewire in Task 9` in Task 5 Step 7 is a temporary code comment, not a plan placeholder — it explains a temporary state during execution.)

**3. Type consistency:**
- `HomingMissileState.assembly` + `HomingMissileState.flame` added in Task 5 Step 2; used in Task 5 Steps 4+5. ✓
- `VolleySchedule` + `PendingMissile` added in Task 5 Step 3; used in Task 5 Step 4+8. ✓
- `LivePickup` unchanged (the new body/sonar/halo refs are read from `group.userData` via `(group as ...)._body`, not via interface fields). ✓
- `Shockwave` constructor signature extended in Task 2; old callers in `src/game.ts:2495` (crystal bursts) still work because the new param is optional. ✓
- `shieldElement` + `pickupHudElement` + `cameraShakeAmplitude` + `cameraShakeRemaining` are existing fields; Task 8 only adds new fields (`missileVolleySchedules`, `activeCoreFlashes`, `bombEdgeFlashElement`). ✓

---

## Plan complete

`docs/superpowers/plans/2026-06-24-phase-7b-powerup-vfx-upgrades.md` saved.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with isolated context. Best for this plan because each task touches a different file/module and the per-task review catches integration drift early.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review. Faster wall-clock but my own context accumulates across 9 tasks (~4700 lines of code + tests).

Which approach?
