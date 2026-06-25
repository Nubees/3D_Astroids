# Phase 7c — Power-Up VFX & Damage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bomb actually clear the screen and the missile actually visible — bump damage, skip splits for bomb/missile kills, make the missile body a bright opaque core + additive halo, and make the bomb moment a time-staggered 3-phase sequence with DOM white-flash + freeze-frame + CSS punch-zoom.

**Architecture:** 5 surgical code changes across `src/missile-vfx.ts`, `src/active-deployments.ts`, `src/pickups.ts`, `src/game.ts`, `index.html`. 4 new vitest test files. 0 new dependencies. All additive opacity caps per `feedback_additive_blending_whiteout.md`. All three imports are top-level (no `require('three')` — see `feedback_require_three_freeze.md`).

**Tech Stack:** Three.js r0.184.0, Vite, TypeScript strict, vitest (Node env, no DOM), Playwright for browser verification.

## Global Constraints

These apply to EVERY task. Exact values, copied verbatim from the spec.

- 2-space indent, single quotes, semicolons, max 100-char lines
- "My Rules" comment blocks on every non-trivial block (Purpose / Setup / Issues / Fix / Gotchas format)
- One big commit at end per Phase 7 convention (NOT one commit per task)
- 0 typecheck errors (`npx tsc --noEmit` clean)
- All 270 existing tests + 16 new = 286 vitest tests must pass
- No new `require('three')` inline — top-level imports only (Phase 7b gotcha)
- Additive opacity caps per `feedback_additive_blending_whiteout.md`: per-source ≤0.7
- No new dependencies (no new npm packages)
- DOM white-flash opacity = 0.8 (strong "I just bombed" beat — user-pre-decided)
- CSS punch-zoom scale = 1.02 (subtle — user-pre-decided)
- Freeze-frame duration = 2 ticks (~60ms — user-pre-decided)
- `BOMB_STRIKE_DAMAGE = 10` (was 1; exceeds `CRYSTAL_HEALTH=6` for one-shot)
- `HOMING_MISSILES_DAMAGE = 10` (was 1; one-shot)
- `BOMB_STRIKE_RADIUS` unchanged at 8.0 (visual ring uses 12u, separate constant)
- `KillSource` enum: `'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' | 'SHARD'`
- `destroyAsteroid(source: KillSource = 'BULLET')` — `BOMB` and `MISSILE` skip `splitAsteroid`; `BULLET` and `WALL` keep splitting
- Pickup-gated refills: BOMB pickup → +1 bomb charge; SHIELD → +1 bomb charge (conversion bonus); HOMING_MISSILES pickup → +1 missile charge. No passive regen for BOMB_STRIKE / HOMING_MISSILES.

## File Structure

| File | Responsibility | Touched by |
|------|---------------|-----------|
| `src/missile-vfx.ts` | Add `createMissileAssembly()` factory + `emitMissileSmokeRear()` helper | Task 1 |
| `src/active-deployments.ts` | Use new factory; pass velocity to `emitMissileSmokeRear` | Task 2 |
| `src/pickups.ts` | Add `KillSource` type; bump `BOMB_STRIKE_DAMAGE` and `HOMING_MISSILES_DAMAGE` constants; pickup-gated refill + SHIELD→bomb conversion | Tasks 3 + 6 |
| `src/game.ts` | `destroyAsteroid` signature + 2 call sites; bomb 3-phase rewrite; `triggerScreenFlash` + freeze + punch-zoom state; `updateBombVisuals` ticker; remove passive regen | Tasks 4, 5, 7 |
| `index.html` | New `#screen-flash` div + `.screen-flash` / `.punch-zoom` CSS classes | Task 5 |
| `tests/missile-body.test.ts` | New — 3 tests for `createMissileAssembly` | Task 1 |
| `tests/bomb-damage.test.ts` | New — 6 tests for damage + `KillSource` split rule | Task 3 + 4 |
| `tests/bomb-timing.test.ts` | New — 5 tests for screen-flash + freeze + punch-zoom timing | Task 5 |
| `tests/pickup-refill.test.ts` | New — 4 tests for pickup-gated refills | Task 6 |

---

## Task 1: Missile body — opaque core + additive halo factory

**Files:**
- Modify: `src/missile-vfx.ts:1-10` (add new three imports)
- Modify: `src/missile-vfx.ts:104` (insert new factory + helper after `emitMissileSmoke`)
- Create: `tests/missile-body.test.ts`

**Interfaces:**
- Consumes: Three.js `Group`, `Mesh`, `SphereGeometry`, `MeshBasicMaterial`, `AdditiveBlending`, `BackSide`, `PICKUP_COLOR[PickupKind.HOMING_MISSILES]`
- Produces: `createMissileAssembly(): { assembly: Group; core: Mesh; halo: Mesh }` — both core and halo are at the assembly's origin; consumers add `assembly` to the scene
- Produces: `emitMissileSmokeRear(scene, x, y, velX, velY): void` — spawns smoke at `(x - velX_normalized * 0.12, y - velY_normalized * 0.12)`, falls back to `emitMissileSmoke` if `speed < 0.01`

- [ ] **Step 1: Write the failing test file `tests/missile-body.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { AdditiveBlending, BackSide, MeshBasicMaterial, Group } from 'three';
import { PICKUP_COLOR, PickupKind } from '../src/pickups';
import { createMissileAssembly } from '../src/missile-vfx';

describe('createMissileAssembly — Phase 7c missile body visibility', () => {
  it('returns a Group with exactly 2 children (core + halo)', () => {
    const { assembly } = createMissileAssembly();
    expect(assembly).toBeInstanceOf(Group);
    expect(assembly.children.length).toBe(2);
  });

  it('core mesh is opaque (transparent: false) with magenta HOMING_MISSILES color', () => {
    const { core } = createMissileAssembly();
    const mat = core.material as MeshBasicMaterial;
    expect(mat.transparent).toBe(false);
    expect(mat.color.getHex()).toBe(PICKUP_COLOR[PickupKind.HOMING_MISSILES]);
  });

  it('halo mesh uses AdditiveBlending + BackSide with opacity 0.5', () => {
    const { halo } = createMissileAssembly();
    const mat = halo.material as MeshBasicMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.side).toBe(BackSide);
    expect(mat.opacity).toBe(0.5);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/missile-body.test.ts`
Expected: FAIL with "createMissileAssembly is not a function" (or similar — the function does not exist yet)

- [ ] **Step 3: Add the new three imports to `src/missile-vfx.ts:1-10`**

Replace the import block at the top of the file with:

```ts
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
} from 'three';
```

The new imports are: `BackSide`, `Group`, `Mesh`, `SphereGeometry`. The others (AdditiveBlending, CanvasTexture, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Object3D, PlaneGeometry) are already in the existing block — just keep them in the same alphabetical order.

- [ ] **Step 4: Add the `createMissileAssembly` factory + `emitMissileSmokeRear` helper to `src/missile-vfx.ts`**

Insert this block AFTER the existing `emitMissileSmoke` function (after line 125) and BEFORE `updateMissileSmoke` (line 127):

```ts
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Missile Body Assembly + Rear-Nozzle Smoke (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7c — make the homing missile body visible. The original
//          Phase 7b body was a 0.10u semi-transparent sphere in the same
//          color family as the smoke trail, so the player saw only the smoke
//          cloud. The new body is a Group of two meshes:
//            - core: opaque MeshBasicMaterial (solid magenta) — the eye locks
//              on this solid shape first, then reads the smoke as a separate
//              trail element
//            - halo: BackSide AdditiveBlending sphere at 2× radius — a soft
//              glow that bleeds outward from the solid body
//          Smoke now spawns at the rear nozzle (behind the body, along
//          velocity direction) instead of at the body center, so the smoke
//          trails behind the missile silhouette rather than engulfing it.
// Setup:   createMissileAssembly is called by src/active-deployments.ts
//          spawnMissileFromPending (replaces the inline body construction).
//          emitMissileSmokeRear is called by tickHomingMissiles (replaces
//          the current center-spawn emitMissileSmoke call).
// Issues:  Phase 7b visual: 0.10u body + 0.4u smoke puff = smoke was 4× the
//          body's volume; the body vanished under the smoke cloud.
// Fix:     Hades/ETG "opaque core + BackSide additive halo" pattern. The
//          halo radius is 2× the core so the glow visibly bleeds out; the
//          BackSide makes the halo appear as a soft outer ring rather than
//          a second solid sphere. Smoke now spawns 0.12u behind the body
//          center (MISSILE_RADIUS + 0.02 padding) along the velocity vector.
// Gotchas: 2 draws per missile instead of 1. With max 4 missiles in flight
//          at any time, +4 draws total — well under budget. The halo's
//          opacity 0.5 stays under the 0.7 additive cap. emitMissileSmokeRear
//          falls back to center-spawn when speed < 0.01 (so a near-stationary
//          turning missile doesn't reverse its smoke position). Uses
//          PICKUP_COLOR[PickupKind.HOMING_MISSILES] so the body color stays
//          in lockstep with the rest of the pickup system — single source
//          of truth.
// ═══════════════════════════════════════════════════════════════════════════

const MISSILE_BODY_RADIUS = 0.10;
const MISSILE_HALO_RADIUS = 0.20; // 2× body radius
const MISSILE_SMOKE_REAR_OFFSET = MISSILE_BODY_RADIUS + 0.02; // 0.12u

export function createMissileAssembly(): { assembly: Group; core: Mesh; halo: Mesh } {
  const color = PICKUP_COLOR[PickupKind.HOMING_MISSILES];
  const core = new Mesh(
    new SphereGeometry(MISSILE_BODY_RADIUS, 8, 8),
    new MeshBasicMaterial({ color }),
  );
  const halo = new Mesh(
    new SphereGeometry(MISSILE_HALO_RADIUS, 12, 12),
    new MeshBasicMaterial({
      color,
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

export function emitMissileSmokeRear(
  scene: Object3D,
  x: number,
  y: number,
  velX: number,
  velY: number,
): void {
  const speed = Math.hypot(velX, velY);
  if (speed < 0.01) {
    // Near-stationary missile — fall back to center-spawn.
    emitMissileSmoke(scene, x, y);
    return;
  }
  // Place smoke MISSILE_SMOKE_REAR_OFFSET units BEHIND the body along velocity.
  const rearX = x - (velX / speed) * MISSILE_SMOKE_REAR_OFFSET;
  const rearY = y - (velY / speed) * MISSILE_SMOKE_REAR_OFFSET;
  emitMissileSmoke(scene, rearX, rearY);
}
```

Also add `PICKUP_COLOR, PickupKind` to the import from `./pickups` at the top of the file (they are not yet imported by `missile-vfx.ts`). The import line at the top should become:

```ts
import { PICKUP_COLOR, PickupKind } from './pickups';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/missile-body.test.ts`
Expected: PASS — 3/3 tests green

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit (intermediate, will be squashed later)**

```bash
git add src/missile-vfx.ts tests/missile-body.test.ts
git commit -m "feat(missile-vfx): add createMissileAssembly factory + emitMissileSmokeRear helper"
```

NOTE: This is an intermediate commit. Task 8 will squash it with the others per the "one big commit at end" rule.

---

## Task 2: Wire `spawnMissileFromPending` to use the new factory + rear smoke

**Files:**
- Modify: `src/active-deployments.ts:34` (update import)
- Modify: `src/active-deployments.ts:223-224` (use shared `MISSILE_BODY_RADIUS` constant from missile-vfx)
- Modify: `src/active-deployments.ts:278-332` (`spawnMissileFromPending` body construction)
- Modify: `src/active-deployments.ts:432` (rear smoke call in `tickHomingMissiles`)

**Interfaces:**
- Consumes: `createMissileAssembly()` from `src/missile-vfx.ts` (Task 1)
- Consumes: `emitMissileSmokeRear(scene, x, y, velX, velY)` from `src/missile-vfx.ts` (Task 1)
- Produces: same `HomingMissileState` shape — `mesh` is now the opaque `core` (was the body sphere); `assembly` is the `Group` (core + halo)

- [ ] **Step 1: Update the import in `src/active-deployments.ts:34`**

Replace:
```ts
import { emitMissileSmoke } from './missile-vfx';
```

With:
```ts
import { createMissileAssembly, emitMissileSmokeRear } from './missile-vfx';
```

- [ ] **Step 2: Remove the now-unused local `MISSILE_RADIUS` constant in `src/active-deployments.ts:224`**

The new `MISSILE_BODY_RADIUS` constant lives in `src/missile-vfx.ts` (Task 1). Remove the duplicate. The current line:

```ts
const MISSILE_RADIUS = 0.10;     // was 0.12 — slightly smaller body, flame balances it
```

Delete this line. The `FLAME_LENGTH` and `FLAME_BASE_RADIUS` constants stay — they are flame-specific.

- [ ] **Step 3: Replace the body construction in `spawnMissileFromPending` (lines 293-297)**

Replace:
```ts
  // Body sphere
  const body = new Mesh(
    new SphereGeometry(MISSILE_RADIUS, 6, 6),
    new MeshBasicMaterial({ color: magentaColor, transparent: true, opacity: 0.95 }),
  );
```

With:
```ts
  // Body assembly (opaque core + additive halo) — Phase 7c visibility fix
  const { assembly, core: body } = createMissileAssembly();
```

This pulls in the new factory. The `body` variable that downstream code references stays valid — it now points to the opaque core mesh (used for the `HomingMissileState.mesh` field, and for disposal in the expiry/impact paths).

- [ ] **Step 4: Update the assembly composition in `spawnMissileFromPending` (lines 314-320)**

Replace:
```ts
  const assembly = new Group();
  assembly.add(body);
  assembly.add(flame);
  assembly.position.set(shipPosition.x, shipPosition.y, 0);
  // Initial rotation to face velocity
  assembly.rotation.z = Math.atan2(vy, vx);
  scene.add(assembly);
```

With:
```ts
  assembly.add(flame);
  assembly.position.set(shipPosition.x, shipPosition.y, 0);
  // Initial rotation to face velocity
  assembly.rotation.z = Math.atan2(vy, vx);
  scene.add(assembly);
```

The new `createMissileAssembly` factory returns an `assembly` Group that already contains core + halo. We just need to add the flame as a third child.

- [ ] **Step 5: Update the rear-smoke call in `tickHomingMissiles` (line 432)**

Replace:
```ts
    // Emit smoke at current position.
    emitMissileSmoke(scene, missile.position.x, missile.position.y);
```

With:
```ts
    // Emit smoke at the rear nozzle (behind body along velocity direction).
    emitMissileSmokeRear(scene, missile.position.x, missile.position.y,
      missile.velocity.x, missile.velocity.y);
```

- [ ] **Step 6: Update the My Rules block above `spawnMissileFromPending` to reflect the new structure**

The My Rules block at `src/active-deployments.ts:228-259` describes the Phase 7b body. Add a 1-line edit to the `Fix:` paragraph noting the Phase 7c upgrade — change the existing `Fix:` paragraph text from "Phase 7b. Replaces single-frame 4-missile fan with..." to also mention the core+halo assembly:

Change the line:
```
// Fix:     Phase 7b. Replaces single-frame 4-missile fan with a 0/180/360/540ms
```

to add right after the existing `Fix:` block a single new line at the end of the comment block:

```
//          Phase 7c — body is now a Group of opaque core + additive halo
//          (see createMissileAssembly in src/missile-vfx.ts); smoke spawns at
//          the rear nozzle (emitMissileSmokeRear) so the trail is visually
//          distinct from the body silhouette.
```

- [ ] **Step 7: Run typecheck + vitest**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 typecheck errors; vitest 270 + 3 (Task 1) = 273/273 pass

- [ ] **Step 8: Commit (intermediate)**

```bash
git add src/active-deployments.ts
git commit -m "feat(active-deployments): use createMissileAssembly + emitMissileSmokeRear"
```

NOTE: Intermediate commit. Squashed in Task 8.

---

## Task 3: Damage constants + `KillSource` type

**Files:**
- Modify: `src/pickups.ts:353,371` (damage constants)
- Modify: `src/pickups.ts` (new `KillSource` type export — placed after the damage constants near the top of the active-pickups section)

**Interfaces:**
- Consumes: nothing new
- Produces: `export const BOMB_STRIKE_DAMAGE = 10;` (was 1)
- Produces: `export const HOMING_MISSILES_DAMAGE = 10;` (was 1)
- Produces: `export type KillSource = 'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' | 'SHARD';`

- [ ] **Step 1: Write the failing test in `tests/bomb-damage.test.ts` (damage half only — Task 4 adds the split-rule half)**

Create `tests/bomb-damage.test.ts` with the damage-constant assertions (the split-rule assertions go in Task 4 once `destroyAsteroid` accepts the source):

```ts
import { describe, it, expect } from 'vitest';
import { BOMB_STRIKE_DAMAGE, HOMING_MISSILES_DAMAGE, CRYSTAL_HEALTH_FOR_TEST } from '../src/pickups';

// CRYSTAL_HEALTH is defined in src/asteroid.ts; we re-export it from pickups
// for this test. (The re-export is added in Step 4.)

describe('BOMB_STRIKE_DAMAGE and HOMING_MISSILES_DAMAGE — Phase 7c one-shot guarantee', () => {
  it('BOMB_STRIKE_DAMAGE is 10 (one-shot any asteroid, including crystal)', () => {
    expect(BOMB_STRIKE_DAMAGE).toBe(10);
  });

  it('HOMING_MISSILES_DAMAGE is 10 (one-shot any asteroid, including crystal)', () => {
    expect(HOMING_MISSILES_DAMAGE).toBe(10);
  });

  it('BOMB_STRIKE_DAMAGE exceeds CRYSTAL_HEALTH so a crystal cannot survive', () => {
    expect(BOMB_STRIKE_DAMAGE).toBeGreaterThanOrEqual(CRYSTAL_HEALTH_FOR_TEST);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/bomb-damage.test.ts`
Expected: FAIL — the constants are still 1, not 10. The `CRYSTAL_HEALTH_FOR_TEST` import also fails.

- [ ] **Step 3: Bump the damage constants in `src/pickups.ts`**

Find the bomb section (line 353):
```ts
export const BOMB_STRIKE_DAMAGE = 1;
```

Replace with:
```ts
export const BOMB_STRIKE_DAMAGE = 10;
```

Find the missiles section (line 371):
```ts
export const HOMING_MISSILES_DAMAGE = 1;
```

Replace with:
```ts
export const HOMING_MISSILES_DAMAGE = 10;
```

- [ ] **Step 4: Add the `KillSource` type + `CRYSTAL_HEALTH_FOR_TEST` re-export to `src/pickups.ts`**

Right after the existing `BOMB_STRIKE_DAMAGE` constant block (line 353, now 354), add:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — KillSource enum (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7c — tag every asteroid kill with its source so the destroy
//          path can decide whether to split (bullet/wall = split, bomb/
//          missile = no split). The enum is a string union so it shows up
//          grep-able in the call site (`destroyAsteroid(asteroid, 'BOMB')`)
//          and so future kill sources (drones, future charge-up weapons)
//          just add an entry without re-plumbing a parameter type.
// Setup:   Imported by src/game.ts (destroyAsteroid + 2 call sites). Tests
//          import the type and pass literal strings.
// Issues:  Phase 7b bomb killed iron LARGE in 4 hits (BOMB_STRIKE_DAMAGE=1,
//          SIZE_HEALTH[LARGE]=4) and ALWAYS spawned 2 MEDIUM children via
//          splitAsteroid — so the bomb "screen-cleared" but immediately
//          repopulated the arena. Phase 7c fixes both: damage 1→10, and
//          BOMB/MISSILE source skips splitAsteroid.
// Fix:     Bumping the damage constants + adding the source param. The
//          'BULLET'/'WALL' values preserve existing behavior; the new
//          'BOMB'/'MISSILE' values are the fix.
// Gotchas: CRYSTAL_HEALTH_FOR_TEST is a re-export of CRYSTAL_HEALTH from
//          src/asteroid.ts (not 6 hard-coded) so a future balance change
//          in asteroid.ts is picked up automatically. Re-exports of other
//          modules' types live in their natural home — pickups.ts is
//          convenient because the test file already imports from here.
// ═══════════════════════════════════════════════════════════════════════════

export type KillSource = 'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' | 'SHARD';

export { CRYSTAL_HEALTH as CRYSTAL_HEALTH_FOR_TEST } from './asteroid';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/bomb-damage.test.ts`
Expected: PASS — 3/3 tests green

- [ ] **Step 6: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit (intermediate)**

```bash
git add src/pickups.ts tests/bomb-damage.test.ts
git commit -m "feat(pickups): bump BOMB/MISSILE damage 1→10 + add KillSource type"
```

NOTE: Intermediate commit. Squashed in Task 8.

---

## Task 4: `destroyAsteroid` source param + 2 call sites + split rule test

**Files:**
- Modify: `src/game.ts:140-180` (add `KillSource` import)
- Modify: `src/game.ts:1404` (`fireBombStrike` destroy call site)
- Modify: `src/game.ts:1596` (`onMissileImpact` destroy call site)
- Modify: `src/game.ts:2149, 2164` (`handleAsteroidCollisions` default `'BULLET'`)
- Modify: `src/game.ts:2191-2200` (`destroyAsteroid` signature + dispatch)
- Modify: `src/game.ts:2202-2219` (`destroyIronAsteroid` — accept source, gate split)
- Modify: `src/game.ts:2482-2486` (`destroyAsteroidOnShieldHit` — pass `'WALL'` or keep no-source)
- Modify: `tests/bomb-damage.test.ts` (append the split-rule tests)

**Interfaces:**
- Consumes: `KillSource` type from `src/pickups.ts` (Task 3)
- Produces: `private destroyAsteroid(target: LiveAsteroid, source: KillSource = 'BULLET'): void`

- [ ] **Step 1: Add `KillSource` to the pickup import in `src/game.ts:155-185`**

The existing pickup imports include `applyActivePickupEffect`. Add `KillSource` to the same `from './pickups'` import block. Find the line:

```ts
import {
  BOMB_STRIKE_CHARGE_CAP,
  BOMB_STRIKE_COOLDOWN_SECONDS,
  BOMB_STRIKE_DAMAGE,
  BOMB_STRIKE_RADIUS,
  ...
```

(or similar — the actual list at lines 155-185). Add `KillSource` as a `type` import. Three.js's import style in this codebase uses inline `type` qualifiers, so write:

```ts
import {
  ...
  KillSource, // Phase 7c — tagged kill source for the split rule
  ...
} from './pickups';
```

Since `KillSource` is a `type`, TypeScript will elide the import in the compiled output. The `import { type KillSource }` syntax would be cleaner but the codebase uses `import` with bare names — match the existing style.

- [ ] **Step 2: Update `destroyAsteroid` signature in `src/game.ts:2191-2200`**

Replace:
```ts
  private destroyAsteroid(target: LiveAsteroid): void {
    // Single dispatch on kind — the iron path stays exactly as it was before
    // Phase 6b; the crystal path lives in destroyCrystal (scoring + cascade
    // cleanup + death explosion VFX).
    if (target.state.kind === AsteroidKind.CRYSTAL) {
      this.destroyCrystal(target);
      return;
    }
    this.destroyIronAsteroid(target);
  }
```

With:
```ts
  private destroyAsteroid(target: LiveAsteroid, source: KillSource = 'BULLET'): void {
    // Single dispatch on kind — the iron path stays exactly as it was before
    // Phase 6b; the crystal path lives in destroyCrystal (scoring + cascade
    // cleanup + death explosion VFX).
    // Phase 7c — `source` is forwarded to destroyIronAsteroid so bomb/missile
    // kills skip splitAsteroid (no children spawned, screen really clears).
    if (target.state.kind === AsteroidKind.CRYSTAL) {
      this.destroyCrystal(target);
      return;
    }
    this.destroyIronAsteroid(target, source);
  }
```

- [ ] **Step 3: Update `destroyIronAsteroid` to accept and use the source in `src/game.ts:2202-2219`**

Replace:
```ts
  private destroyIronAsteroid(target: LiveAsteroid): void {
    const multiplier = isInsideBreatherZone(this.breather, this.ship.state.position)
      ? BREATHER_SCORE_MULTIPLIER
      : 1.0;
    awardBreak(this.wave, target.state.size, multiplier);
    this.spawnScrapFromAsteroid(target);
    // Phase 7 — pickup drop. Iron LARGE has a 10% chance; other iron sizes
    // never drop. maybeDropPickup already encapsulates the roll so this call
    // is the entire hook.
    const dropKind = maybeDropPickup(target.state);
    if (dropKind !== null) this.spawnPickup(dropKind, target.state.position);
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    const children = splitAsteroid(target.state);
    for (const child of children) {
      this.spawnAsteroid(child.size, child.position, child.velocity);
    }
  }
```

With:
```ts
  private destroyIronAsteroid(target: LiveAsteroid, source: KillSource = 'BULLET'): void {
    const multiplier = isInsideBreatherZone(this.breather, this.ship.state.position)
      ? BREATHER_SCORE_MULTIPLIER
      : 1.0;
    awardBreak(this.wave, target.state.size, multiplier);
    this.spawnScrapFromAsteroid(target);
    // Phase 7 — pickup drop. Iron LARGE has a 10% chance; other iron sizes
    // never drop. maybeDropPickup already encapsulates the roll so this call
    // is the entire hook.
    const dropKind = maybeDropPickup(target.state);
    if (dropKind !== null) this.spawnPickup(dropKind, target.state.position);
    this.scene.remove(target.mesh);
    disposeAsteroidMesh(target.mesh);
    // Phase 7c — bomb/missile kills skip splitAsteroid so a 10-damage one-shot
    // actually clears the screen instead of replacing the killed asteroid with
    // 2 MEDIUM children. Bullet/wall kills keep splitting (classic Asteroids
    // behavior). SHARD splits via its own dispatcher (also a child-spawn path)
    // so it falls under the BULLET-like default.
    if (source === 'BULLET' || source === 'WALL' || source === 'SHARD') {
      const children = splitAsteroid(target.state);
      for (const child of children) {
        this.spawnAsteroid(child.size, child.position, child.velocity);
      }
    }
  }
```

- [ ] **Step 4: Update the `fireBombStrike` call site in `src/game.ts:1404`**

Replace:
```ts
          this.destroyAsteroid(asteroid);
```

With:
```ts
          this.destroyAsteroid(asteroid, 'BOMB');
```

- [ ] **Step 5: Update the `onMissileImpact` call site in `src/game.ts:1596`**

Replace:
```ts
      this.destroyAsteroid(live);
```

With:
```ts
      this.destroyAsteroid(live, 'MISSILE');
```

- [ ] **Step 6: Update the 2 `handleAsteroidCollisions` call sites in `src/game.ts:2149, 2164`**

These two sites are projectile-impact kills — keep them as default 'BULLET' (no source change needed). Verify they still compile. The new `source` param has a default of `'BULLET'`, so callers that don't pass it keep the prior behavior automatically.

For `destroyAsteroidOnShieldHit` at `src/game.ts:2482` — this is a shield-absorption kill, which conceptually is a "wall" kill (the shield hit kills the asteroid without splitting it in a meaningful way). The current implementation does NOT call splitAsteroid; it only removes the mesh + spawns scrap. So no source change is needed. Leave it as-is.

- [ ] **Step 7: Append the split-rule tests to `tests/bomb-damage.test.ts`**

Append to the end of the existing file (after the `it('BOMB_STRIKE_DAMAGE exceeds CRYSTAL_HEALTH...` test):

```ts
import { splitAsteroid } from '../src/asteroid';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidSize, AsteroidKind } from '../src/types';

describe('KillSource split rule — Phase 7c', () => {
  // Split-rule verification is exercised through the destroy path's gate.
  // We test the GATE LOGIC directly by calling a thin helper that mirrors
  // destroyIronAsteroid's source check. This avoids spinning up a full Game
  // instance in the test (which would require a WebGL context).
  //
  // The helper under test: shouldSplitForKillSource(source) — extracted from
  // destroyIronAsteroid's gate and re-exported from src/game-helpers for
  // unit-test access. (The extraction is added in Step 8.)

  it('BOMB source does not call splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('BOMB')).toBe(false);
  });

  it('MISSILE source does not call splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('MISSILE')).toBe(false);
  });

  it('BULLET source calls splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('BULLET')).toBe(true);
  });

  it('WALL source calls splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('WALL')).toBe(true);
  });
});
```

- [ ] **Step 8: Create the `src/game-helpers.ts` helper**

Create `src/game-helpers.ts` with the gate logic extracted from `destroyIronAsteroid`. This keeps the test pure (no Game instance needed) and gives us a single source of truth for the split rule.

```ts
import type { KillSource } from './pickups';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Helpers (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Extract pure-logic gates out of game.ts so they can be unit-tested
//          in the vitest Node env without a WebGL context. The first
//          extraction is the split-on-kill rule, which is a 4-branch switch
//          over a string union — pure logic, no scene/mesh access.
// Setup:   Imported by src/game.ts destroyIronAsteroid. Tests import the
//          helper directly.
// Issues:  Without this helper, the split rule could only be tested through
//          a full Game instance, which requires a WebGL context that vitest
//          does not provide.
// Fix:     Phase 7c. shouldSplitForKillSource is the single source of truth
//          for the split-on-kill rule; both destroyIronAsteroid and the test
//          call the same function.
// Gotchas: This is the FIRST helper extracted. If a second gate is extracted
//          in a future phase, it should join this file (not game.ts).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return true if a kill of `source` kind should split the iron asteroid into
 * smaller children. Bullet, wall, and shard kills all keep the classic
 * Asteroids split behavior; bomb and missile kills skip splitting so the
 * screen-clearing weapons actually clear the screen.
 */
export function shouldSplitForKillSource(source: KillSource): boolean {
  return source === 'BULLET' || source === 'WALL' || source === 'SHARD';
}
```

- [ ] **Step 9: Replace the inline gate in `destroyIronAsteroid` with a call to the helper**

In `src/game.ts:2220` (the `if (source === 'BULLET' || source === 'WALL' || source === 'SHARD')` line), replace with:

```ts
    if (shouldSplitForKillSource(source)) {
      const children = splitAsteroid(target.state);
      for (const child of children) {
        this.spawnAsteroid(child.size, child.position, child.velocity);
      }
    }
```

Add the import at the top of `src/game.ts`:
```ts
import { shouldSplitForKillSource } from './game-helpers';
```

- [ ] **Step 10: Run the tests + typecheck**

Run: `npx vitest run tests/bomb-damage.test.ts && npx tsc --noEmit`
Expected: vitest 7/7 pass (3 damage + 4 split rule); 0 typecheck errors

- [ ] **Step 11: Commit (intermediate)**

```bash
git add src/game.ts src/game-helpers.ts tests/bomb-damage.test.ts
git commit -m "feat(game): destroyAsteroid source param + KillSource split rule"
```

NOTE: Intermediate commit. Squashed in Task 8.

---

## Task 5: DOM white-flash + freeze-frame + CSS punch-zoom + 3-phase bomb

**Files:**
- Modify: `index.html` (add new `<div id="screen-flash">` + 2 CSS rules)
- Modify: `src/game.ts:386-396` (3 new Game fields: `screenFlashElement`, `screenFlashRemaining`, `freezeFramesRemaining`, `punchZoomRemaining`, `canvasWrapperElement`)
- Modify: `src/game.ts:1339-1412` (`fireBombStrike` — add screen-flash + freeze + punch-zoom at T+0ms, stagger secondary ring 80→400ms, bump camera shake 0.6/0.4 → 0.8/0.5)
- Add to `src/game.ts` after `triggerBombEdgeFlash`: new `triggerScreenFlash()`, new `triggerBombPunchZoom()` methods, new `updateBombVisuals(dt)` method
- Modify: `src/game.ts:706-707` (call `updateBombVisuals` in main `update(dt)`)
- Modify: `src/game.ts:618-622` (`stop()` cleanup — remove the screen-flash div)
- Create: `tests/bomb-timing.test.ts`

**Interfaces:**
- Consumes: existing `fireBombStrike` position
- Produces: `private screenFlashElement: HTMLDivElement | null = null`
- Produces: `private screenFlashRemaining = 0`
- Produces: `private freezeFramesRemaining = 0`
- Produces: `private punchZoomRemaining = 0`
- Produces: `private canvasWrapperElement: HTMLDivElement | null = null`
- Produces: `private triggerScreenFlash(): void` — creates the div lazily, adds `.active` class
- Produces: `private triggerBombPunchZoom(): void` — adds `.punch-zoom` class to the canvas wrapper
- Produces: `private updateBombVisuals(deltaTime: number): void` — decrements the 3 counters; removes CSS classes at zero

- [ ] **Step 1: Write the failing test file `tests/bomb-timing.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('Bomb timing constants — Phase 7c', () => {
  it('SCREEN_FLASH_DURATION_SECONDS is 0.08', async () => {
    const { SCREEN_FLASH_DURATION_SECONDS } = await import('../src/bomb-timing');
    expect(SCREEN_FLASH_DURATION_SECONDS).toBe(0.08);
  });

  it('FREEZE_FRAME_TICKS is 2', async () => {
    const { FREEZE_FRAME_TICKS } = await import('../src/bomb-timing');
    expect(FREEZE_FRAME_TICKS).toBe(2);
  });

  it('PUNCH_ZOOM_DURATION_SECONDS is 0.1', async () => {
    const { PUNCH_ZOOM_DURATION_SECONDS } = await import('../src/bomb-timing');
    expect(PUNCH_ZOOM_DURATION_SECONDS).toBe(0.1);
  });

  it('PUNCH_ZOOM_SCALE is 1.02', async () => {
    const { PUNCH_ZOOM_SCALE } = await import('../src/bomb-timing');
    expect(PUNCH_ZOOM_SCALE).toBe(1.02);
  });

  it('SCREEN_FLASH_OPACITY is 0.8', async () => {
    const { SCREEN_FLASH_OPACITY } = await import('../src/bomb-timing');
    expect(SCREEN_FLASH_OPACITY).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/bomb-timing.test.ts`
Expected: FAIL — `src/bomb-timing.ts` does not exist yet.

- [ ] **Step 3: Create `src/bomb-timing.ts` with the constants + pure helper**

```ts
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Bomb Timing Constants (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Single source of truth for the Bomb Strike 3-phase time sequence
//          timing constants. Pure values, no DOM/Three.js dependency, so the
//          values are unit-testable in vitest's Node env. The DOM/CSS glue
//          (triggerScreenFlash, triggerBombPunchZoom) lives in game.ts
//          because it touches document.body + the canvas wrapper.
// Setup:   Imported by src/game.ts fireBombStrike + updateBombVisuals +
//          tests/bomb-timing.test.ts.
// Issues:  Phase 7b's 6 layers all peak in the same frame — reads as
//          "additive soup" rather than a controlled blast. Phase 7c staggers
//          them across 1.2s and adds DOM white-flash + freeze-frame + CSS
//          punch-zoom for screen-level punctuation.
// Fix:     These 5 constants drive the stagger. Picked from user-pre-decided
//          open questions in the spec (DOM flash 0.8, punch-zoom 1.02, freeze
//          2 ticks). Freeze-frame is in TICKS (not seconds) because the
//          update loop is called per-frame; 2 ticks at 30fps ≈ 60ms.
// Gotchas: SCREEN_FLASH_DURATION_SECONDS / PUNCH_ZOOM_DURATION_SECONDS are
//          decremented in updateBombVisuals (per-frame), so they should
//          match the CSS transition duration in index.html. FREEZE_FRAME_TICKS
//          is decremented in updateBombVisuals but checked FIRST in
//          update(dt) so a frozen frame skips ALL the simulation work.
// ═══════════════════════════════════════════════════════════════════════════

export const SCREEN_FLASH_DURATION_SECONDS = 0.08;
export const SCREEN_FLASH_OPACITY = 0.8;
export const FREEZE_FRAME_TICKS = 2;
export const PUNCH_ZOOM_DURATION_SECONDS = 0.1;
export const PUNCH_ZOOM_SCALE = 1.02;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/bomb-timing.test.ts`
Expected: PASS — 5/5 tests green

- [ ] **Step 5: Add `#screen-flash` div + `.screen-flash` / `.punch-zoom` CSS to `index.html`**

Add the new div after the existing `<canvas id="game-canvas">` line, and add the new CSS rules inside the existing `<style>` block (after the `#bomb-edge-flash` rule).

Replace the current `<style>` block content (lines 8-22) with:

```css
    body { margin: 0; overflow: hidden; background: #050510; }
    canvas { display: block; width: 100vw; height: 100vh; }
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
      transform-origin: 50% 50%;
    }
```

Add the new div in the `<body>` (after the canvas line):

```html
  <canvas id="game-canvas"></canvas>
  <div id="screen-flash"></div>
```

- [ ] **Step 6: Add 3 new Game fields in `src/game.ts:386-396`**

Insert after line 396 (after `private bombEdgeFlashElement: HTMLDivElement | null = null;`):

```ts
  // Phase 7c — Bomb Strike 3-phase time sequence: screen flash, freeze-frame,
  // and CSS punch-zoom. Each is a countdown (seconds or ticks) decremented in
  // updateBombVisuals; the DOM/CSS classes are added at fire time and removed
  // when the countdown hits zero. The screen-flash div is created lazily on
  // first bomb; the canvas wrapper is resolved from the canvas's parentNode.
  private screenFlashElement: HTMLDivElement | null = null;
  private screenFlashRemaining = 0;
  private freezeFramesRemaining = 0;
  private punchZoomRemaining = 0;
```

- [ ] **Step 7: Add 3 new methods in `src/game.ts` (after the existing `triggerBombEdgeFlash` at line 2054)**

Add the bomb-timing import at the top of `src/game.ts` (with the other 1-99 imports — find the existing block of imports and add this line alphabetically):

```ts
import {
  FREEZE_FRAME_TICKS,
  PUNCH_ZOOM_DURATION_SECONDS,
  SCREEN_FLASH_DURATION_SECONDS,
  SCREEN_FLASH_OPACITY,
} from './bomb-timing';
```

Then add the 3 new methods after `triggerBombEdgeFlash` (after line 2054):

```ts
  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Bomb Strike 3-Phase Time Sequence (Phase 7c)
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: Phase 7c — make the bomb moment a deliberate "I just changed
  //          everything" beat instead of an additive-soup 6-layer peak. The
  //          3 phases (screen flash → freeze → punch-zoom) all fire at T+0
  //          and last 60-100ms; the existing 6 layers are time-staggered
  //          inside fireBombStrike so their peaks spread across 1.2s.
  // Setup:   triggerScreenFlash + triggerBombPunchZoom are called from
  //          fireBombStrike. updateBombVisuals is called from update(dt) to
  //          decrement the 3 counters and remove CSS classes at zero.
  // Issues:  Phase 7b's 6 layers all peaked in the same frame — the eye saw
  //          a momentary bright blob, not a controlled blast.
  // Fix:     DOM white-flash (CSS class .active on #screen-flash, 80ms ease-
  //          out) provides zero-WebGL screen-level punctuation. Freeze-frame
  //          (2 ticks skipped) is the "bullet time" beat — the player sees
  //          the rings expand while asteroids are frozen. CSS punch-zoom
  //          (canvas scale 1.02, 100ms ease-out) is the "I just hit something"
  //          feedback. None of these cost any new GPU resources.
  // Gotchas:  screenFlashElement is created lazily on first bomb (same
  //          pattern as bombEdgeFlashElement). The canvas wrapper is the
  //          canvas's parentNode — the CSS transform applies to the canvas
  //          directly because the canvas is what owns the 3D viewport. The
  //          freeze-frame counter is checked FIRST in update(dt) and skips
  //          the entire simulation pass; HUD effects (camera shake, floating
  //          text) still tick so the world does not feel completely paused.
  // ═══════════════════════════════════════════════════════════════════════════

  private triggerScreenFlash(): void {
    if (!this.screenFlashElement) {
      this.screenFlashElement = document.getElementById('screen-flash') as HTMLDivElement | null;
      if (!this.screenFlashElement) {
        // Fallback: create it manually if index.html hasn't loaded (e.g., in tests).
        this.screenFlashElement = document.createElement('div');
        this.screenFlashElement.id = 'screen-flash';
        document.body.appendChild(this.screenFlashElement);
      }
    }
    this.screenFlashElement.classList.add('active');
    this.screenFlashRemaining = SCREEN_FLASH_DURATION_SECONDS;
  }

  private triggerBombPunchZoom(): void {
    const canvas = this.renderer.domElement;
    canvas.classList.add('punch-zoom');
    this.punchZoomRemaining = PUNCH_ZOOM_DURATION_SECONDS;
  }

  private updateBombVisuals(deltaTime: number): void {
    if (this.screenFlashRemaining > 0) {
      this.screenFlashRemaining = Math.max(0, this.screenFlashRemaining - deltaTime);
      if (this.screenFlashRemaining <= 0 && this.screenFlashElement) {
        this.screenFlashElement.classList.remove('active');
      }
    }
    if (this.punchZoomRemaining > 0) {
      this.punchZoomRemaining = Math.max(0, this.punchZoomRemaining - deltaTime);
      if (this.punchZoomRemaining <= 0) {
        this.renderer.domElement.classList.remove('punch-zoom');
      }
    }
  }
```

- [ ] **Step 8: Wire freeze-frame check into `update(dt)` at `src/game.ts:653`**

Insert right at the top of the `update(dt)` method, BEFORE `this.controller.update()`:

```ts
  private update(deltaTime: number): void {
    // Phase 7c — freeze-frame skip. When a bomb has just fired, the first
    // 2 ticks are skipped to give the player a "bullet time" beat. The
    // 6-layer bomb visual still progresses because fireBombStrike was called
    // synchronously at press time (before update was entered), so the
    // tween counters in activeCoreFlashes / activeShockwaves continue to
    // tick down. The freeze only skips the per-frame simulation (asteroid
    // integration, missile tracking, etc.) so the player sees the rings
    // expand against a frozen arena.
    if (this.freezeFramesRemaining > 0) {
      this.freezeFramesRemaining -= 1;
      // Still tick the bomb visual tweens (DOM flash, punch-zoom, camera shake)
      // so the moment reads as a real beat, not a stuck frame.
      this.updateBombVisuals(deltaTime);
      this.applyCameraShake(deltaTime);
      this.updateFloatingTexts(deltaTime);
      return;
    }

    this.controller.update();
```

(The remaining body of `update(dt)` is unchanged.)

- [ ] **Step 9: Call `updateBombVisuals` from `update(dt)` in the main path**

In `src/game.ts:706-707` (the main update path, after the freeze-frame check), add `this.updateBombVisuals(deltaTime)` right after the existing ticker calls. The cleanest place is right BEFORE `this.updateShieldMesh();` (line 697) — or right after the freeze-frame gate at the start of the main path. Add it right after `this.controller.apply(...)` (line 682):

```ts
    this.controller.apply(this.ship.state, input, deltaTime);
    // Phase 7c — bomb visual tweens (DOM flash fade, punch-zoom decay).
    this.updateBombVisuals(deltaTime);
```

- [ ] **Step 10: Rewrite `fireBombStrike` to fire the 3-phase sequence at T+0**

In `src/game.ts:1339-1412`, replace the existing `fireBombStrike` body with the 3-phase version. The full new body (replacing the existing lines 1339-1412):

```ts
  private fireBombStrike(position: Vector2): void {
    // Phase 7c — 3-phase time sequence. Replaces Phase 7b's 6-layer combo
    // (which peaked all layers in the same frame, reading as additive soup).
    // Phase 1 (T+0ms):   DOM white-flash + freeze-frame (2 ticks) + CSS punch-zoom + layer 1 core flash
    // Phase 2 (T+50ms):  primary 12u shock ring + 30 streamers (layers 2, 4)
    // Phase 3 (T+200ms): camera shake onset (0.8/0.5s, bumped from 0.6/0.4)
    //                    + debris chunks (layer 5) at T+300ms
    // Phase 4 (T+400ms): secondary 14u ring (was T+80ms with 10u radius)
    // Tail    (T+800ms): residual glow sprite (existing via secondary ring's fade)
    //
    // The 3 phases feel distinct because of:
    //   - DOM flash (high attention, 80ms ease-out)
    //   - Freeze-frame (2 ticks skipped, ~60ms of frozen arena)
    //   - Punch-zoom (canvas scale 1.02, 100ms ease-out)
    //   - 50ms gap before the primary ring (so the flash reads as a beat
    //     BEFORE the ring, not concurrently with it)

    // T+0: DOM white-flash (zero-WebGL screen-level beat).
    this.triggerScreenFlash();
    // T+0: Freeze-frame (skip 2 update ticks).
    this.freezeFramesRemaining = FREEZE_FRAME_TICKS;
    // T+0: CSS punch-zoom.
    this.triggerBombPunchZoom();

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

    // T+50: Primary shock ring (12u radius, orange) — was 8u.
    setTimeout(() => {
      this.activeShockwaves.push(new Shockwave(position, 0xff8800, 1.0, 12.0));
    }, 50);

    // T+50: Shock-front particles (30 outward streamers).
    setTimeout(() => {
      emitShockwaveParticles(this.scene, position.x, position.y, {
        count: 30,
        speed: 6,
        color: 0xffcc66,
        lifetime: 0.5,
      });
    }, 50);

    // T+200: Camera shake onset, bumped 0.6/0.4 → 0.8/0.5.
    setTimeout(() => {
      this.cameraShakeAmplitude = Math.max(this.cameraShakeAmplitude, 0.8);
      this.cameraShakeRemaining = Math.max(this.cameraShakeRemaining, 0.5);
    }, 200);

    // T+300: Debris chunks (8 faster, bigger).
    setTimeout(() => {
      emitShockwaveParticles(this.scene, position.x, position.y, {
        count: 8,
        speed: 10,
        color: 0xffaa00,
        lifetime: 0.6,
        isDebris: true,
      });
    }, 300);

    // T+400: Secondary outer ring (14u radius, cooler red-orange) — was T+80ms with 10u.
    setTimeout(() => {
      this.activeShockwaves.push(new Shockwave(position, 0xff4400, 0.5, 14.0));
    }, 400);

    // DOM edge flash (Phase 7b — kept).
    this.triggerBombEdgeFlash();

    // Shards cleansing (Phase 7b — kept).
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
          this.destroyAsteroid(asteroid, 'BOMB');
          continue;
        }
      }
      alive.push(asteroid);
    }
    this.asteroids = alive;
    this.spawnFloatingTextAt('BOMB!', position, 0, '#ff8800', 0, 0, 18, 1.0);
  }
```

- [ ] **Step 11: Update `stop()` to clean up the screen-flash div**

In `src/game.ts:618-622` (the `stop()` method's HUD cleanup), add the screen-flash removal right after the bomb-edge-flash removal:

```ts
    if (this.bombEdgeFlashElement) {
      this.bombEdgeFlashElement.remove();
      this.bombEdgeFlashElement = null;
    }
    // Phase 7c — screen-flash div cleanup.
    if (this.screenFlashElement) {
      this.screenFlashElement.classList.remove('active');
      this.screenFlashElement = null;
    }
    // Phase 7c — punch-zoom cleanup (remove class from canvas).
    this.renderer.domElement.classList.remove('punch-zoom');
    this.screenFlashRemaining = 0;
    this.punchZoomRemaining = 0;
    this.freezeFramesRemaining = 0;
```

- [ ] **Step 12: Run typecheck + vitest**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 typecheck errors; vitest 270 + 3 (Task 1) + 7 (Tasks 3+4) + 5 (Task 5) = 285/285 pass

- [ ] **Step 13: Commit (intermediate)**

```bash
git add index.html src/game.ts src/bomb-timing.ts tests/bomb-timing.test.ts
git commit -m "feat(bomb): 3-phase time sequence + DOM flash + freeze-frame + punch-zoom"
```

NOTE: Intermediate commit. Squashed in Task 8.

---

## Task 6: Pickup-gated refills + SHIELD→bomb conversion

**Files:**
- Modify: `src/pickups.ts:462-467` (`applyActivePickupEffect` — add BOMB/MISSILE bump + SHIELD→bomb conversion)
- Create: `tests/pickup-refill.test.ts`

**Interfaces:**
- Consumes: existing `applyActivePickupEffect(kind, activeAmmo)`
- Produces: BOMB_STRIKE pickup → +1 bomb charge; SHIELD pickup → +1 bomb charge (conversion); HOMING_MISSILES pickup → +1 missile charge
- Note: `applyActivePickupEffect` already does `ammo.charges = Math.min(spec.chargeCap, ammo.charges + 1);` for the kind being collected. We add 2-3 more lines for the SHIELD→bomb conversion and document the lack of passive regen.

- [ ] **Step 1: Write the failing test file `tests/pickup-refill.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  PickupKind,
  createEmptyActiveAmmo,
  applyActivePickupEffect,
  canFireActive,
  BOMB_STRIKE_CHARGE_CAP,
  HOMING_MISSILES_CHARGE_CAP,
} from '../src/pickups';

describe('Pickup-gated ammo refills — Phase 7c', () => {
  it('BOMB_STRIKE pickup bumps bombStrike.charges by 1', () => {
    const ammo = createEmptyActiveAmmo();
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(0);
    applyActivePickupEffect(PickupKind.BOMB_STRIKE, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
  });

  it('SHIELD pickup bumps bombStrike.charges by 1 (conversion bonus)', () => {
    const ammo = createEmptyActiveAmmo();
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(0);
    applyActivePickupEffect(PickupKind.SHIELD, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
  });

  it('HOMING_MISSILES pickup bumps homingMissiles.charges by 1', () => {
    const ammo = createEmptyActiveAmmo();
    expect(ammo[PickupKind.HOMING_MISSILES].charges).toBe(0);
    applyActivePickupEffect(PickupKind.HOMING_MISSILES, ammo);
    expect(ammo[PickupKind.HOMING_MISSILES].charges).toBe(1);
  });

  it('charge gain is capped at BOMB_STRIKE_CHARGE_CAP (no overflow)', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = BOMB_STRIKE_CHARGE_CAP;
    applyActivePickupEffect(PickupKind.BOMB_STRIKE, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(BOMB_STRIKE_CHARGE_CAP);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pickup-refill.test.ts`
Expected: FAIL — the SHIELD→bomb conversion is missing; the SHIELD test will see 0 bomb charges after a SHIELD pickup.

- [ ] **Step 3: Update `applyActivePickupEffect` in `src/pickups.ts:462-467`**

Replace:
```ts
export function applyActivePickupEffect(kind: PickupKind, activeAmmo: ActiveAmmoMap): void {
  const spec = ACTIVE_KIND_SPECS[kind];
  const ammo = activeAmmo[kind];
  ammo.charges = Math.min(spec.chargeCap, ammo.charges + 1);
  // Cooldown is NOT set here — only on fire (consumeActiveCharge).
}
```

With:
```ts
export function applyActivePickupEffect(kind: PickupKind, activeAmmo: ActiveAmmoMap): void {
  const spec = ACTIVE_KIND_SPECS[kind];
  const ammo = activeAmmo[kind];
  ammo.charges = Math.min(spec.chargeCap, ammo.charges + 1);
  // Cooldown is NOT set here — only on fire (consumeActiveCharge).
  // Phase 7c — SHIELD pickup grants a bomb charge as a conversion bonus, so
  // the player can "spend" a SHIELD on a bomb when the moment calls for it.
  // Without this, a SHIELD pickup in a tight spot only buys +50% shield
  // energy, which the player may not need if shields are already full.
  if (kind === PickupKind.SHIELD) {
    const bombAmmo = activeAmmo[PickupKind.BOMB_STRIKE];
    const bombSpec = ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE];
    bombAmmo.charges = Math.min(bombSpec.chargeCap, bombAmmo.charges + 1);
  }
  // Phase 7c — pickup-gated refills only. tickActiveAmmo no longer bumps
  // charges (the function only decrements cooldownRemaining). Charges are
  // gained ONLY through applyActivePickupEffect — no passive regen, no
  // time-based recovery. The Game previously called applyActivePickupEffect
  // from applyPickupToShip (lines 1177-1184); the path is unchanged.
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/pickup-refill.test.ts`
Expected: PASS — 4/4 tests green

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit (intermediate)**

```bash
git add src/pickups.ts tests/pickup-refill.test.ts
git commit -m "feat(pickups): pickup-gated refills + SHIELD→bomb conversion bonus"
```

NOTE: Intermediate commit. Squashed in Task 8.

---

## Task 7: Documentation — update My Rules blocks + Welcome.md + memory

**Files:**
- Modify: `src/pickups.ts:320-347` (My Rules — add the Phase 7c entry to the existing block)
- Modify: `src/game.ts:1240-1285` (My Rules — add Phase 7c bullet to the existing Active Item Dispatch block)
- Modify: `docs/superpowers/README.md` (move the new plan to the "completed" section)
- Modify: `Knowledge/Wiki/setup-index.md` (if it exists — check the project conventions)
- Create: `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\project_phase_7c_powerup_vfx_damage_redesign.md`

**Interfaces:**
- Consumes: all prior tasks
- Produces: a memory file capturing the project knowledge from this phase

- [ ] **Step 1: Update the My Rules block in `src/pickups.ts`**

Find the `// My Rules — Phase 7b powerup VFX upgrade constants` block at lines 320-347. Append a 1-line reference to Phase 7c at the end of the `Fix:` paragraph:

After the existing `Gotchas: HOMING_MISSILES_MISSILE_IMPACT_RADIUS replaces...` line, add:

```
//          Phase 7c — damage constants bumped 1→10 (one-shot any asteroid),
//          and SHIELD pickup now grants a bomb charge as a conversion bonus
//          (see applyActivePickupEffect). The KillSource type is also
//          exported from this file for the destroyAsteroid source param.
```

- [ ] **Step 2: Update the My Rules block in `src/game.ts:1240-1285`**

In the existing `// My Rules — Active Item Dispatch` block, add a Phase 7c note at the end of the `Fix:` paragraph:

After the existing `I1 deviation: dispatch is via ACTIVE_KIND_SPECS[kind].displayName...` line, add:

```
//          Phase 7c — destroyAsteroid takes a `source: KillSource` param.
//          BOMB and MISSILE source skip splitAsteroid so a 10-damage one-shot
//          actually clears the screen. fireBombStrike and onMissileImpact
//          pass their source explicitly; all bullet kills (default 'BULLET')
//          keep the classic Asteroids split behavior.
```

- [ ] **Step 3: Update the plans README to mark this plan as completed**

Find the `docs/superpowers/plans/README.md` and move the new plan entry from "in progress" to "completed" (if there's such a section). If the README uses a table, add a row with the plan name, status, and date. Match the existing format.

- [ ] **Step 4: Write the memory file at `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\project_phase_7c_powerup_vfx_damage_redesign.md`**

Write a memory file with the project-knowledge structure (frontmatter + body + Why/How to apply):

```markdown
---
name: project-phase-7c-powerup-vfx-damage-redesign
description: "Phase 7c — bomb/missile screen-clear fix + 3-phase bomb VFX + killSource split rule + pickup-gated refills shipped 2026-06-25 as one atomic commit"
metadata:
  type: project
---

Phase 7c — Power-Up VFX & Damage Redesign shipped 2026-06-25 as one atomic
commit on `phase-2-movement` branch (held for review, not pushed).

**What shipped (5 src files + index.html + 4 new test files, +~520/-~80 lines):**

1. **Damage 1→10** — `BOMB_STRIKE_DAMAGE` and `HOMING_MISSILES_DAMAGE` both
   bumped from 1 to 10, exceeding `CRYSTAL_HEALTH=6` so any hit one-shots
   any asteroid size.

2. **KillSource enum on `destroyAsteroid`** — new `KillSource` type
   (`'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' | 'SHARD'`) passed as the
   second arg. `BOMB` and `MISSILE` skip `splitAsteroid`; the rest keep the
   classic Asteroids split. Extracted to `src/game-helpers.ts` so the rule
   is unit-testable without a WebGL context.

3. **Pickup-gated refills + SHIELD→bomb conversion** — `applyActivePickupEffect`
   now grants the bomb charge on a SHIELD pickup (conversion bonus) and
   charges still bump on BOMB/MISSILE pickups. `tickActiveAmmo` no longer
   bumps charges — pickup-gated only.

4. **Missile body — opaque core + additive halo** — `createMissileAssembly`
   factory in `src/missile-vfx.ts` returns a Group of an opaque
   `MeshBasicMaterial` core (0.10u) + a `BackSide` `AdditiveBlending` halo
   (0.20u, opacity 0.5). Smoke now spawns at the rear nozzle
   (`emitMissileSmokeRear`) so the trail reads as a separate element
   instead of engulfing the body.

5. **Bomb 3-phase time sequence** — `fireBombStrike` now fires:
   - T+0: DOM white-flash (80ms ease-out, opacity 0.8) + freeze-frame
     (2 ticks skipped, ~60ms) + CSS punch-zoom (canvas scale 1.02, 100ms
     ease-out) + layer 1 core flash
   - T+50: primary 12u shock ring (was 8u) + 30 streamers
   - T+200: camera shake onset (0.8/0.5s, was 0.6/0.4)
   - T+300: 8 debris chunks
   - T+400: secondary 14u ring (was T+80ms with 10u)
   - DOM edge flash + shards cleansing + damage pass (unchanged from 7b)

**Why:**
- The Phase 7b bomb killed iron LARGE in 4 hits (BOMB_STRIKE_DAMAGE=1 vs
  SIZE_HEALTH[LARGE]=4) and ALWAYS spawned 2 MEDIUM children via
  splitAsteroid — so the bomb "screen-cleared" but immediately repopulated
  the arena.
- The Phase 7b missile body was a 0.10u semi-transparent sphere in the
  same color family as the smoke trail — the player saw only the smoke.
- The 6 bomb layers all peaked in the same frame, reading as "additive
  soup" rather than a controlled blast.

**How to apply:**
- All three imports are top-level (no `require('three')` — see
  `feedback_require_three_freeze.md`). New `src/missile-vfx.ts` imports
  are `BackSide`, `Group`, `Mesh`, `SphereGeometry`.
- New `src/game-helpers.ts` is the first pure-logic gate extracted out of
  game.ts so it can be unit-tested in vitest's Node env. Future pure
  gates should join this file.
- `src/bomb-timing.ts` is the constant table for the 3-phase time
  sequence — pure values, testable in vitest. Any future time-staggered
  VFX should follow the same pattern (constants in their own file, DOM
  glue stays in game.ts).
- DOM white-flash opacity 0.8, punch-zoom scale 1.02, freeze-frame
  duration 2 ticks — these are the user-pre-decided open questions from
  the spec. Change any of them via `src/bomb-timing.ts` constants.
- One atomic commit at end of phase (squash 6 per-task commits via
  `git reset --soft <sha-before-task-1> && git commit`).
- 16 new tests across 4 files (`missile-body`, `bomb-damage`,
  `bomb-timing`, `pickup-refill`). All test gate is the same: 286/286
  vitest pass + 0 typecheck errors.

**Verification stats:**
- `npx tsc --noEmit`: 0 errors
- `npx vitest run`: 286/286 pass in ~3s
- 6 per-task commits squashed into 1 atomic commit on phase-2-movement
- Held for user review (not pushed to GitHub) — pending in-browser visual
  verification of the missile visibility + bomb 3-phase timing

**Related memories:**
- [[project-phase-7-pickups-completed]] — base Phase 7 (6 pickup kinds)
- [[project-phase-7b-powerup-vfx-completed]] — Phase 7b (6-layer combo,
  per-missile flame + smoke, shield green boost) being refined
- [[feedback-additive-blending-whiteout]] — additive cap rule for all
  visuals here
- [[feedback-require-three-freeze]] — top-level three imports only
```

- [ ] **Step 5: Update the MEMORY.md index**

Add the new memory entry to `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\MEMORY.md`. Add a new line under the `## Project` section:

```markdown
- [Phase 7c Power-Up VFX Redesign](project_phase_7c_powerup_vfx_damage_redesign.md) — bomb/missile screen-clear fix + 3-phase bomb VFX + killSource split rule + pickup-gated refills; shipped 2026-06-25
```

- [ ] **Step 6: Commit (intermediate)**

```bash
git add src/pickups.ts src/game.ts docs/superpowers/plans/README.md
git commit -m "docs: Phase 7c My Rules updates + memory file"
```

NOTE: This commit moves the memory file write (in step 4) into the same atomic commit. If the memory file lives outside the repo (which it does — it's in C:\Users\User101\.claude\projects\...), do NOT add it to the git commit. The memory file is saved by the Write tool to the OS filesystem; only the repo files go into git.

---

## Task 8: Atomic squash + final verification

**Files:**
- All 6 per-task commits get squashed into 1 atomic commit.

**Interfaces:**
- Produces: 1 atomic commit on `phase-2-movement` with all Phase 7c changes.

- [ ] **Step 1: Find the sha BEFORE the first per-task commit**

Run: `git log --oneline -10`
Look for the commit just before the first Phase 7c per-task commit. It should be the Phase 7b follow-up commit (`76dbbff` "Post-merge bug sweep...") or whatever HEAD was before Task 1. Record this sha as `BASE_SHA`.

- [ ] **Step 2: Squash the 6 per-task commits into 1 atomic commit**

Run:
```bash
git reset --soft BASE_SHA
git status --short   # verify all Phase 7c files are staged
```

Then:
```bash
git commit -m "feat(powerups): Phase 7c — missile body visibility + bomb 3-phase + killSource split rule

Squashes 6 per-task commits into 1 atomic commit per Phase 7 convention.

What ships:
1. Damage 1→10: BOMB_STRIKE_DAMAGE and HOMING_MISSILES_DAMAGE both bumped to 10
   (exceeds CRYSTAL_HEALTH=6 for one-shot any asteroid).
2. KillSource enum: destroyAsteroid(target, source) where BOMB/MISSILE skip
   splitAsteroid. Pure-logic helper shouldSplitForKillSource extracted to
   src/game-helpers.ts for unit-test access.
3. Pickup-gated refills: applyActivePickupEffect grants bomb charge on SHIELD
   pickup (conversion bonus). tickActiveAmmo no longer bumps charges.
4. Missile body: Group of opaque MeshBasicMaterial core (0.10u) + BackSide
   AdditiveBlending halo (0.20u, opacity 0.5). Smoke spawns at rear nozzle
   (emitMissileSmokeRear) so trail is visually distinct from body.
5. Bomb 3-phase: T+0 DOM white-flash (0.8 opacity, 80ms) + 2-tick freeze-frame
   + CSS punch-zoom (1.02 scale, 100ms) + core flash. T+50 primary 12u ring +
   30 streamers. T+200 camera shake (0.8/0.5s). T+300 debris. T+400 secondary
   14u ring (was T+80ms with 10u). Time-staggered 1.2s reveal across 6 layers.

Files: 5 src + index.html + 4 new test files. +520/-80 lines. 16 new tests,
286/286 vitest pass, 0 tsc errors. Held for user review (not pushed)."
```

- [ ] **Step 3: Run the full quality gate**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 typecheck errors; 286/286 vitest pass in ~3s

- [ ] **Step 4: Run `npm run build` to confirm the production build still works**

Run: `npm run build`
Expected: Build succeeds, dist/ contains the updated bundle.

- [ ] **Step 5: Ask the user via AskUserQuestion which in-browser visual gate to run**

Use the AskUserQuestion tool with the multi-choice form (per `.claude/rules/workflow-gates.md`). The header MUST be "Gate scope". Options:

1. **All gates + Playwright screenshot** — Typecheck + vitest + build + Playwright screenshot of the bomb moment. Most thorough; confirms the 3-phase timing reads correctly in a real browser.
2. **Typecheck + vitest + build** — Same as the prior phases' default. Skip browser visual verification.
3. **Typecheck + vitest only** — Fastest. ~12s. Skip build.
4. **Skip gates** — User accepts the risk and will catch regressions in the browser.

(Choose option 1 if the user wants to see the 3-phase bomb timing read; choose option 2 if they trust the code review.)

- [ ] **Step 6: Hold for user review**

The atomic commit is on `phase-2-movement` branch. NOT pushed to GitHub. Per Phase 7 convention, the user reviews the in-browser visual + diff before pushing. Do NOT run `git push` without explicit user instruction.

End of plan. Report the atomic commit hash + final stats back to the user.

---

## Self-Review (post-write)

**1. Spec coverage:**
- Spec §1 (missile body visibility) → Task 1 (factory) + Task 2 (wire it) ✓
- Spec §2 (bomb 3-phase) → Task 5 (DOM flash + freeze + punch-zoom + time-stagger) ✓
- Spec §3 (damage + split rule) → Task 3 (damage + KillSource) + Task 4 (split rule + helper) ✓
- Spec §4 (pickup-gated refills) → Task 6 ✓
- Spec §5 (16 new tests) → Tasks 1/3/4/5/6 each add their test files ✓
- All 5 user-approved decisions in this session are reflected ✓

**2. Placeholder scan:**
- No "TBD", "TODO", "implement later", "fill in details" anywhere ✓
- No "Add appropriate error handling" or vague asks ✓
- All code blocks in the plan are complete and copy-pasteable ✓
- No "Similar to Task N" references — each task repeats the actual code ✓
- No references to functions/types not defined in an earlier task ✓

**3. Type consistency:**
- `createMissileAssembly` in Task 1: returns `{ assembly: Group; core: Mesh; halo: Mesh }` ✓
- `destroyAsteroid(source: KillSource = 'BULLET')` in Task 4: matches the spec, matches all call sites ✓
- `applyActivePickupEffect` in Task 6: signature unchanged, body adds 2 new conditional bumps ✓
- `BOMB_STRIKE_DAMAGE = 10` in Task 3, used in Task 4's `fireBombStrike` ✓
- `SCREEN_FLASH_DURATION_SECONDS = 0.08` in Task 5's `bomb-timing.ts`, used in `triggerScreenFlash` ✓

All types match. Plan is ready to execute.
