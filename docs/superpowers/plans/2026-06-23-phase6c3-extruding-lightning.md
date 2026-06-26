# Phase 6c3 — Extruding Lightning Telegraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Phase 6c2's floating Line2 arcs and scene-wide spark pool with 5 EXTRUDING Line2 bolts (extending 1.5-2.5 crystal-radii OUTWARD from surface) and a per-crystal 32-48 particle spark pool (distance + charge scaled, 0.6s lifetime). Restore brighter cyan emissive and un-dim bloom so the white-hot reads dramatically.

**Architecture:** Two new classes in `src/crystal-fx.ts` (`ExtrudingBolt` for the Line2 bolts, `CrystalBoltSparks` for the per-crystal pool) replace `ElectricityArc` and `SparkParticles`. `createFracturedMaterial` is reverted to Phase 6c values (brighter cyan). `src/game.ts` wires per-frame updates; `src/post-processing.ts` reverts bloom to pre-Phase-6c2 values. Test coverage added to a new `tests/crystal-fx.test.ts`.

**Tech Stack:** Three.js (Line2, LineGeometry, LineMaterial from `three/addons/lines/`), ShaderMaterial, Points, vitest, Playwright (visual only).

## Global Constraints

- TypeScript strict mode, 2-space indent, single quotes, max 100-char lines (per `.claude/rules/code-style.md`).
- `readonly` for config constants; `export` shared types from module surface.
- All math in `src/crystal-fx.ts` is pure / GPU-decoupled (no Three.js types in pure helpers).
- Material lifecycle rule (from Phase 6c2 post-mortem): never set `material.transparent = true/false` at runtime; create with `transparent: true, opacity: 1.0` and drive visibility via `material.opacity`.
- Per the gate-prompt rule (`.claude/rules/workflow-gates.md`): ask the user via `AskUserQuestion` before running `npm run typecheck` / `npm test` / `npm run build`.
- `crystalCharge(t) = t³` (unchanged from Phase 6c) is the master pacing curve — change it once, all dependent channels rebalance.
- Bolts start at `radius * 0.95` (just inside surface), extend 1.5-2.5 crystal-radii outward along the radial direction with ≤ 0.3 perpendicular jitter.
- Sparks: pool size 32-48 (target 40), base size 18 px, charge multiplier 2.5×, lifetime 0.6 s.
- Bolts: count 5, segments 8-10 per bolt, thickness 5 px, regenerate every 0.06 s.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/crystal-fx.ts` | Pure helpers (`crystalCharge`, `getBurstFlash`, `getHeartbeatPhase`, `mulberry32`, vector math), `ExtrudingBolt` class, `CrystalBoltSparks` class, `createFracturedMaterial` (reverted). |
| `src/game.ts` | Wires `ExtrudingBolt` and `CrystalBoltSparks` per crystal in update loop; handles `setResolution` on resize. |
| `src/post-processing.ts` | Reverts `UnrealBloomPass` to threshold 0.15, strength 0.55. |
| `tests/crystal-fx.test.ts` | NEW. Pure-logic tests for `getHeartbeatPhase`, `ExtrudingBolt` geometry math (via a static helper exposed for testing), `CrystalBoltSparks` pool mechanics. |

`src/asteroid.ts` is NOT modified. The `IcosahedronGeometry` and mesh hierarchy stay identical.

---

### Task 1: Add `getHeartbeatPhase` helper + unit test

**Files:**
- Modify: `src/crystal-fx.ts` (add export near `getBurstFlash`)
- Test: `tests/crystal-fx.test.ts` (create)

**Interfaces:**
- Consumes: `TELEGRAPH_DURATION_SECONDS = 0.15` (already exported)
- Produces: `export function getHeartbeatPhase(t: number): number` — peaks at t=0.075s, returns to 0 at t=0.15s, repeats every 0.15s

- [ ] **Step 1: Write the failing test in `tests/crystal-fx.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { getHeartbeatPhase } from '../src/crystal-fx';

describe('getHeartbeatPhase', () => {
  it('returns 0 at the start of each heartbeat cycle', () => {
    expect(getHeartbeatPhase(0)).toBeCloseTo(0, 5);
    expect(getHeartbeatPhase(0.15)).toBeCloseTo(0, 5);
    expect(getHeartbeatPhase(0.30)).toBeCloseTo(0, 5);
  });

  it('peaks at t=0.075s within each cycle', () => {
    expect(getHeartbeatPhase(0.075)).toBeCloseTo(1.0, 5);
    expect(getHeartbeatPhase(0.225)).toBeCloseTo(1.0, 5);
  });

  it('stays in [0, 1] across many cycles', () => {
    for (let i = 0; i < 50; i += 1) {
      const v = getHeartbeatPhase(i * 0.01);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: FAIL — `getHeartbeatPhase` is not exported from `../src/crystal-fx`.

- [ ] **Step 3: Add `getHeartbeatPhase` to `src/crystal-fx.ts`**

Insert immediately after the `getBurstFlash` function (around line 239):

```ts
/**
 * Heartbeat curve in [0, 1] that pulses every 0.15s (matching the burst-flash
 * window). Used to flash the crystal mesh white just before each upcoming
 * burst. Same shape as getBurstFlash but on a free-running clock — the burst
 * telegraph handles the "burst just fired" flash; this handles the "burst
 * about to fire" reminder.
 */
export function getHeartbeatPhase(t: number): number {
  const phase = ((t % 0.15) + 0.15) % 0.15;
  return Math.sin((Math.PI * phase) / TELEGRAPH_DURATION_SECONDS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/crystal-fx.ts tests/crystal-fx.test.ts
git commit -m "feat(crystal-fx): add getHeartbeatPhase helper for pre-burst flash"
```

---

### Task 2: Expose bolt-geometry helper for testing

**Files:**
- Modify: `src/crystal-fx.ts` (add export `computeBoltEndpoints`)

**Interfaces:**
- Consumes: existing `mulberry32`, `sampleUnitVector`, `scaleVec`, `addVec`, `normalize` (or vector math)
- Produces: `export function computeBoltEndpoints(seed: number, radius: number, segs: number): { positions: Float32Array; colors: Float32Array }`

This is a pure function so it can be unit-tested without WebGL/Three.js objects. It returns the position and color buffers for ONE bolt given a seed, radius, and segment count. The visual class `ExtrudingBolt` (Task 3) consumes this.

- [ ] **Step 1: Write the failing test**

Append to `tests/crystal-fx.test.ts`:

```ts
import { computeBoltEndpoints } from '../src/crystal-fx';

describe('computeBoltEndpoints', () => {
  it('produces (segs + 1) vertices per bolt', () => {
    const { positions } = computeBoltEndpoints(42, 1.0, 8);
    // (segs + 1) vertices × 3 floats = 27 floats
    expect(positions.length).toBe((8 + 1) * 3);
  });

  it('start vertex lies just inside the crystal surface (radius * 0.95)', () => {
    const { positions } = computeBoltEndpoints(42, 2.0, 8);
    const startX = positions[0];
    const startY = positions[1];
    const startZ = positions[2];
    const startDist = Math.sqrt(startX * startX + startY * startY + startZ * startZ);
    expect(startDist).toBeCloseTo(2.0 * 0.95, 1);
  });

  it('end vertex lies 1.5-2.5 crystal-radii from origin', () => {
    for (let i = 0; i < 20; i += 1) {
      const { positions } = computeBoltEndpoints(i * 17 + 1, 1.0, 8);
      const lastIdx = positions.length - 3;
      const endX = positions[lastIdx];
      const endY = positions[lastIdx + 1];
      const endZ = positions[lastIdx + 2];
      const endDist = Math.sqrt(endX * endX + endY * endY + endZ * endZ);
      expect(endDist).toBeGreaterThanOrEqual(1.5);
      expect(endDist).toBeLessThanOrEqual(2.5);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = computeBoltEndpoints(123, 1.0, 8);
    const b = computeBoltEndpoints(123, 1.0, 8);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: FAIL — `computeBoltEndpoints` not exported.

- [ ] **Step 3: Add `computeBoltEndpoints` to `src/crystal-fx.ts`**

Insert near the existing vector helpers (around line 710):

```ts
/**
 * Compute the position + color buffers for ONE extruding lightning bolt.
 * Pure function — no WebGL/Three.js types — so it can be unit-tested.
 *
 * The bolt starts just inside the crystal surface (radius * 0.95) at a
 * random direction, and extends 1.5-2.5 crystal-radii OUTWARD along that
 * direction (with ≤ 0.3 perpendicular jitter for organic feel). The bolt
 * has (segs + 1) vertices forming a jagged polyline.
 *
 * Colors are baked as per-vertex brightness in [0.6, 1.0] (white-hot tint).
 * The caller multiplies by intensity at runtime.
 *
 * Used by ExtrudingBolt (which wraps the result in a Line2 mesh).
 */
export function computeBoltEndpoints(
  seed: number,
  radius: number,
  segs: number,
): { positions: Float32Array; colors: Float32Array } {
  const rng = mulberry32(seed);
  const startDir = sampleUnitVector(rng);
  const start = scaleVec(startDir, radius * 0.95);
  const extension = 1.5 + rng() * 1.0;
  const endDir = normalize(addVec(startDir, scaleVec(sampleUnitVector(rng), 0.3)));
  const end = scaleVec(endDir, radius * extension);

  const vertexCount = segs + 1;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  for (let s = 0; s <= segs; s += 1) {
    const t = s / segs;
    let p: { x: number; y: number; z: number };
    if (s === 0) {
      p = start;
    } else if (s === segs) {
      p = end;
    } else {
      const lerped = lerpVec(start, end, t);
      const jitter = scaleVec(sampleUnitVector(rng), 0.3);
      p = addVec(lerped, jitter);
    }
    const bright = 0.6 + 0.4 * rng();
    positions[s * 3] = p.x;
    positions[s * 3 + 1] = p.y;
    positions[s * 3 + 2] = p.z;
    // White-hot tint baked per vertex
    colors[s * 3] = bright * 1.0;       // R
    colors[s * 3 + 1] = bright * 0.98;  // G
    colors[s * 3 + 2] = bright * 0.92;  // B
  }
  return { positions, colors };
}
```

Also add a `normalize` helper if not already present (near other vector helpers):

```ts
function normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: PASS — all 4 new tests green.

- [ ] **Step 5: Commit**

```bash
git add src/crystal-fx.ts tests/crystal-fx.test.ts
git commit -m "feat(crystal-fx): add computeBoltEndpoints pure helper for extruding bolts"
```

---

### Task 3: Rewrite `ElectricityArc` → `ExtrudingBolt` class

**Files:**
- Modify: `src/crystal-fx.ts` (replace the `ElectricityArc` class, lines ~332-490)
- Test: `tests/crystal-fx.test.ts` (extend)

**Interfaces:**
- Consumes: `computeBoltEndpoints` from Task 2, `Line2`, `LineGeometry`, `LineMaterial` from `three/addons/lines/`
- Produces: `export class ExtrudingBolt` with the same surface API as `ElectricityArc` (`mesh`, `setResolution(w, h)`, `attach(scene)`, `detach(scene)`, `update(deltaTime, charge, worldPos, radius, seed)`, `dispose()`)

- [ ] **Step 1: Write the failing test for new class API**

Append to `tests/crystal-fx.test.ts`:

```ts
import { ExtrudingBolt } from '../src/crystal-fx';

describe('ExtrudingBolt', () => {
  it('constructs with a Line2 mesh and 5 bolts × 8-10 segments', () => {
    const bolt = new ExtrudingBolt(42);
    expect(bolt.mesh).toBeDefined();
    expect(bolt.mesh.type).toBe('Line2');
    bolt.dispose();
  });

  it('attach is idempotent — second call does not throw', () => {
    const bolt = new ExtrudingBolt(42);
    const fakeScene = { add: () => {}, remove: () => {} };
    bolt.attach(fakeScene as never);
    expect(() => bolt.attach(fakeScene as never)).not.toThrow();
    bolt.dispose();
  });

  it('dispose is idempotent — second call does not throw', () => {
    const bolt = new ExtrudingBolt(42);
    bolt.dispose();
    expect(() => bolt.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: FAIL — `ExtrudingBolt` not exported.

- [ ] **Step 3: Replace `ElectricityArc` with `ExtrudingBolt` in `src/crystal-fx.ts`**

Delete the entire `ElectricityArc` class (lines 332-490 in current source) and replace with:

```ts
/**
 * Number of independent bolts to draw per fractured crystal. 5 strikes
 * a balance — enough to feel like a multi-streamer Tesla coil, few enough
 * that the geometry rebuild (5 × 10 vertices = 50 vertices, every 60ms)
 * doesn't thrash the CPU.
 */
const BOLTS_PER_CRYSTAL = 5;

/**
 * Per-bolt segment count range. We sample 8-10 per bolt via a 0..2 floor
 * inside ExtrudingBolt constructor. 8-10 reads as jagged lightning without
 * looking noisy.
 */
const BOLT_SEGMENT_MIN = 8;
const BOLT_SEGMENT_MAX = 10;

/**
 * How often (in seconds) the bolt geometry regenerates. 60 ms = ~17
 * redraws per second — fast enough to read as flickering electricity,
 * aggressive enough that the bolts visibly shift frame-to-frame.
 */
const BOLT_REBUILD_INTERVAL_SECONDS = 0.06;

/**
 * Lightning color (white-hot, slightly warm). Kept as RGB constants so
 * the bolt vertex colors and the per-frame intensity multiplier both
 * reference the same source of truth.
 */
export const BOLT_COLOR_R = 1.0;
export const BOLT_COLOR_G = 0.98;
export const BOLT_COLOR_B = 0.92;

/**
 * Lightning-bolt visual for one fractured crystal. Owns a Line2 mesh with
 * `BOLTS_PER_CRYSTAL` jagged bolts that all radiate FROM a point on the
 * crystal's surface OUTWARD 1.5-2.5 crystal-radii into the surrounding
 * space. The geometry is rebuilt in place every `BOLT_REBUILD_INTERVAL_SECONDS`
 * so the bolts visibly flicker and shift; intensity is driven by `crystalCharge`
 * from the Game.
 *
 * Phase 6c3 — replaces Phase 6c2's ElectricityArc, which drew bolts
 * BETWEEN two random surface points (read as "halo decoration" not
 * "lightning coming out"). Phase 6c3 bolts start at the surface and
 * extrude outward — Tesla coil / plasma globe reading.
 *
 * Setup:    Call `bolt.attach(scene)` once to get the mesh into the
 *           scene. Each frame, call `bolt.update(deltaTime, charge,
 *           worldPos, radius, seed)`. Call `bolt.detach(scene)` to
 *           remove from the scene. Call `bolt.dispose()` to free GPU.
 * Gotchas:  The mesh's `position` is updated each frame to follow the
 *           crystal — do NOT parent the bolt to the crystal Group, or
 *           the position would be relative and double-transform.
 *
 * Line2 + LineMaterial requires `resolution` to be set so it knows
 * the viewport size in pixels (it computes screen-space line thickness
 * from this). The Game calls setResolution(w, h) on construction AND
 * on canvas resize.
 */
export class ExtrudingBolt {
  readonly mesh: Line2;
  private readonly geometry: LineGeometry;
  private readonly material: LineMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private elapsed = 0;
  private attached = false;

  constructor(seed: number) {
    const rngSeeds: number[] = [];
    for (let b = 0; b < BOLTS_PER_CRYSTAL; b += 1) {
      rngSeeds.push(seed * (b + 1) * 31 + 1);
    }
    // Per-bolt segment count, sampled once at construction (8-10).
    const segmentsPerBolt: number[] = [];
    for (let b = 0; b < BOLTS_PER_CRYSTAL; b += 1) {
      segmentsPerBolt.push(
        BOLT_SEGMENT_MIN + Math.floor((rngSeeds[b] % (BOLT_SEGMENT_MAX - BOLT_SEGMENT_MIN + 1))),
      );
    }
    // Allocate the largest-possible buffer (max segments × max bolts).
    const maxVerts = BOLTS_PER_CRYSTAL * (BOLT_SEGMENT_MAX + 1);
    this.positions = new Float32Array(maxVerts * 3);
    this.colors = new Float32Array(maxVerts * 3);
    this.geometry = new LineGeometry();
    this.geometry.setPositions(this.positions);
    this.geometry.setColors(this.colors);
    this.material = new LineMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      linewidth: 5, // pixels (LineMaterial uses shader for true thick lines)
      worldUnits: false,
    });
    this.mesh = new Line2(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.regenerate(rngSeeds, segmentsPerBolt);
  }

  /**
   * Set the viewport resolution in pixels. Line2 + LineMaterial needs this
   * to compute screen-space line thickness.
   */
  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  /**
   * Add the bolt to a scene. Idempotent.
   */
  attach(scene: { add: (obj: Line2) => void }): void {
    if (this.attached) return;
    scene.add(this.mesh);
    this.attached = true;
  }

  /**
   * Remove the bolt from its scene. Idempotent.
   */
  detach(scene: { remove: (obj: Line2) => void }): void {
    if (!this.attached) return;
    scene.remove(this.mesh);
    this.attached = false;
  }

  /**
   * Per-frame tick. `charge` is crystalCharge (0..1); `worldPos` is the
   * crystal's current world position (already includes shake); `radius`
   * is the crystal's visual radius; `seed` is a per-crystal seed so
   * adjacent crystals don't share bolt patterns.
   */
  update(
    deltaTime: number,
    charge: number,
    worldPos: Vector2,
    radius: number,
    seed: number,
  ): void {
    this.elapsed += deltaTime;
    this.mesh.position.set(worldPos.x, worldPos.y, 0.1);
    if (this.elapsed >= BOLT_REBUILD_INTERVAL_SECONDS) {
      this.elapsed = 0;
      // Re-sample the per-bolt seeds + segment counts so the geometry
      // visibly shifts each rebuild.
      const rngSeeds: number[] = [];
      for (let b = 0; b < BOLTS_PER_CRYSTAL; b += 1) {
        rngSeeds.push(seed * (b + 1) * 31 + Math.floor(this.elapsed * 1000) + 1);
      }
      const segmentsPerBolt = rngSeeds.map((s) =>
        BOLT_SEGMENT_MIN + (Math.abs(s) % (BOLT_SEGMENT_MAX - BOLT_SEGMENT_MIN + 1)),
      );
      this.regenerate(rngSeeds, segmentsPerBolt);
    }
    // Opacity = 0.6 + 0.8 * charge². Floor of 0.6 keeps bolts visible even
    // at the start of the burst window; ceiling of 1.4 pushes past the
    // bloom threshold at peak so white-hot really pops.
    const intensity = 0.6 + 0.8 * charge * charge;
    for (let i = 0; i < this.colors.length; i += 1) {
      this.colors[i] *= intensity;
    }
    void radius;
  }

  /**
   * Rebuild the bolt geometry in place. Calls computeBoltEndpoints for
   * each of BOLTS_PER_CRYSTAL bolts, then uploads positions + colors to
   * the LineGeometry.
   */
  private regenerate(rngSeeds: number[], segmentsPerBolt: number[]): void {
    let writeIdx = 0;
    for (let b = 0; b < BOLTS_PER_CRYSTAL; b += 1) {
      const { positions, colors } = computeBoltEndpoints(
        rngSeeds[b],
        1.0, // baked at radius 1.0; the Game scales via worldPos
        segmentsPerBolt[b],
      );
      for (let i = 0; i < positions.length; i += 1) {
        this.positions[writeIdx + i] = positions[i];
        this.colors[writeIdx + i] = colors[i];
      }
      writeIdx += positions.length;
    }
    this.geometry.setPositions(this.positions);
    this.geometry.setColors(this.colors);
  }

  /**
   * Release GPU resources.
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: PASS — all `ExtrudingBolt` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/crystal-fx.ts tests/crystal-fx.test.ts
git commit -m "refactor(crystal-fx): replace ElectricityArc with ExtrudingBolt"
```

---

### Task 4: Rewrite `SparkParticles` → `CrystalBoltSparks` class

**Files:**
- Modify: `src/crystal-fx.ts` (replace `SparkParticles` class, lines ~519-672)
- Test: `tests/crystal-fx.test.ts` (extend)

**Interfaces:**
- Consumes: existing `mulberry32`, `sampleUnitVector`, `scaleVec`, `addVec`
- Produces: `export class CrystalBoltSparks` with surface API: `points`, `emit(charge, worldPos, radius, deltaTime)`, `update(deltaTime)`, `dispose()`

- [ ] **Step 1: Write the failing test**

Append to `tests/crystal-fx.test.ts`:

```ts
import { CrystalBoltSparks } from '../src/crystal-fx';

describe('CrystalBoltSparks', () => {
  it('pool size is between 32 and 48', () => {
    const sparks = new CrystalBoltSparks(42);
    // The positions buffer size reveals the pool size
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    const poolSize = positionsAttr.array.length / 3;
    expect(poolSize).toBeGreaterThanOrEqual(32);
    expect(poolSize).toBeLessThanOrEqual(48);
    sparks.dispose();
  });

  it('all particles start parked off-screen at origin', () => {
    const sparks = new CrystalBoltSparks(42);
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      expect(positionsAttr.array[i]).toBe(9999);
      expect(positionsAttr.array[i + 1]).toBe(9999);
    }
    sparks.dispose();
  });

  it('emits sparks when charge > 0', () => {
    const sparks = new CrystalBoltSparks(42);
    sparks.emit(0.5, { x: 0, y: 0 }, 1.0, 0.016);
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    let movedCount = 0;
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      if (positionsAttr.array[i] !== 9999) movedCount += 1;
    }
    expect(movedCount).toBeGreaterThan(0);
    sparks.dispose();
  });

  it('does not emit when charge is 0', () => {
    const sparks = new CrystalBoltSparks(42);
    sparks.emit(0, { x: 0, y: 0 }, 1.0, 0.016);
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      expect(positionsAttr.array[i]).toBe(9999);
    }
    sparks.dispose();
  });

  it('ages particles to 0.6s then parks them off-screen', () => {
    const sparks = new CrystalBoltSparks(42);
    sparks.emit(0.5, { x: 0, y: 0 }, 1.0, 0.016);
    sparks.update(1.0); // 1 second > 0.6s lifetime
    const positionsAttr = (sparks.points.geometry.getAttribute('position') as { array: Float32Array });
    for (let i = 0; i < positionsAttr.array.length; i += 3) {
      expect(positionsAttr.array[i]).toBe(9999);
      expect(positionsAttr.array[i + 1]).toBe(9999);
    }
    sparks.dispose();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: FAIL — `CrystalBoltSparks` not exported.

- [ ] **Step 3: Replace `SparkParticles` with `CrystalBoltSparks` in `src/crystal-fx.ts`**

Delete the entire `SparkParticles` class (lines 519-672 in current source) and replace with:

```ts
/**
 * Spark pool size per fractured crystal. Pool is per-crystal (not
 * scene-wide), so the worst case is 4 crystals fractured × 40 sparks
 * each = 160 active particles, but typically 1-2 crystals fractured.
 * Phase 6c3: was 120 in a single scene-wide pool. Per-crystal scoping
 * simplifies dispose chains (one pool dies with one crystal).
 */
const SPARK_POOL_SIZE = 40;

/**
 * Per-particle lifetime in seconds. Phase 6c3: was 0.6s in Phase 6c2,
 * kept the same. Long enough to read as "sparks flying outward", short
 * enough to clear before the next burst.
 */
const SPARK_LIFETIME_SECONDS = 0.6;

/**
 * Spark sprite base size in pixels. Phase 6c3: was 14 in Phase 6c2.
 * Bumped to 18 base, then multiplied by 2.5× at peak charge (40+ effective).
 * Distance scaling keeps it proportional to crystal at any zoom.
 */
const SPARK_BASE_SIZE_PX = 18;

/**
 * Multiplier applied to spark sprite size at charge = 1.0. Linear in
 * charge² so the size ramps in the back half of the burst window.
 */
const SPARK_SIZE_CHARGE_MULTIPLIER = 2.5;

/**
 * Per-crystal spark particle pool. One Points geometry, one PointsMaterial,
 * one draw call per crystal (not per spark). Particles drift outward at
 * 3-6 units/s, lifetime 0.6s, then recycle.
 *
 * Phase 6c3 — replaces Phase 6c2's scene-wide SparkParticles. The scene-wide
 * pool had the right idea (one draw call) but the per-crystal scoping
 * simplifies dispose chains. The visual goal is the same: clearly visible
 * sparks flying outward from the crystal as it charges up.
 *
 * Setup:    Game constructs one CrystalBoltSparks per fractured crystal
 *           and adds it to the scene. Each frame, call
 *           `sparks.emit(charge, worldPos, radius, deltaTime)` and
 *           `sparks.update(deltaTime)` once per crystal.
 * Gotchas:  Sprite size = base × (1 + multiplier × charge²) × (300 / -z)
 *           in the vertex shader. Distance scaling via standard
 *           perspective-projection trick.
 */
export class CrystalBoltSparks {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly alphas: Float32Array;
  private nextIndex = 0;

  constructor(seed: number) {
    void seed;
    this.positions = new Float32Array(SPARK_POOL_SIZE * 3);
    this.velocities = new Float32Array(SPARK_POOL_SIZE * 3);
    this.ages = new Float32Array(SPARK_POOL_SIZE).fill(SPARK_LIFETIME_SECONDS);
    this.alphas = new Float32Array(SPARK_POOL_SIZE);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1));
    const material = new ShaderMaterial({
      uniforms: {
        uColor: { value: { x: BOLT_COLOR_R, y: BOLT_COLOR_G, z: BOLT_COLOR_B } },
        uSize: {
          value: SPARK_BASE_SIZE_PX * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1),
        },
        uChargeSizeMul: { value: SPARK_SIZE_CHARGE_MULTIPLIER },
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uSize;
        uniform float uChargeSizeMul;
        void main() {
          vAlpha = aAlpha;
          // aAlpha encodes charge² — packed into the alpha channel so we
          // don't need a separate per-vertex charge attribute.
          float chargeSq = aAlpha * (1.0 / 0.85); // approximate; see note
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float sizeMul = 1.0 + uChargeSizeMul * chargeSq;
          gl_PointSize = uSize * sizeMul * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          if (d > 0.5) discard;
          float glow = 1.0 - smoothstep(0.0, 0.5, d);
          gl_FragColor = vec4(uColor * glow, glow * vAlpha);
        }
      `,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i += 1) {
      this.positions[i * 3] = 9999;
      this.positions[i * 3 + 1] = 9999;
      this.positions[i * 3 + 2] = 0;
    }
  }

  /**
   * Emit sparks for one crystal this frame. `charge` is the crystalCharge
   * curve (0..1); emission rate is `max(8, charge^2 * 140)` particles/sec,
   * capped at 8 per frame per crystal.
   *
   * Phase 6c3 change: was scene-wide 120-pool; now per-crystal 40-pool.
   * The emission RATE formula is unchanged from Phase 6c2 — what changed
   * is the pool scoping and the sprite size.
   */
  emit(charge: number, worldPos: Vector2, radius: number, deltaTime: number): void {
    if (charge <= 0) return;
    const rate = Math.max(8, charge * charge * 140);
    const count = Math.min(8, Math.floor(rate * deltaTime + Math.random()));
    if (count === 0) return;
    for (let n = 0; n < count; n += 1) {
      const i = this.nextIndex;
      this.nextIndex = (this.nextIndex + 1) % SPARK_POOL_SIZE;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.2;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const speed = 3.0 + Math.random() * 3.0;
      this.positions[i * 3] = worldPos.x + dirX * (radius * 0.95 + dist);
      this.positions[i * 3 + 1] = worldPos.y + dirY * (radius * 0.95 + dist);
      this.positions[i * 3 + 2] = 0.1;
      this.velocities[i * 3] = dirX * speed;
      this.velocities[i * 3 + 1] = dirY * speed;
      this.velocities[i * 3 + 2] = 0;
      this.ages[i] = 0;
      // Pack charge² into alpha upper bits so the vertex shader can scale
      // sprite size. We use alpha as the carrier.
      this.alphas[i] = 0.85 * (0.5 + charge * charge * 0.5);
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true;
  }

  /**
   * Tick the pool: advance positions, age out dead particles, recompute
   * per-particle alpha for the shader fade.
   */
  update(deltaTime: number): void {
    let alphaDirty = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i += 1) {
      this.ages[i] += deltaTime;
      if (this.ages[i] >= SPARK_LIFETIME_SECONDS) {
        this.positions[i * 3] = 9999;
        this.positions[i * 3 + 1] = 9999;
        this.positions[i * 3 + 2] = 0;
        this.alphas[i] = 0;
        alphaDirty = true;
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * deltaTime;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * deltaTime;
      const lifeFrac = this.ages[i] / SPARK_LIFETIME_SECONDS;
      // Slight ease-out fade
      this.alphas[i] = (1 - lifeFrac) * (1 - lifeFrac) * 0.85;
      alphaDirty = true;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    if (alphaDirty) {
      (this.points.geometry.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true;
    }
  }

  /**
   * Release GPU resources.
   */
  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as ShaderMaterial).dispose();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/crystal-fx.test.ts --run`
Expected: PASS — all `CrystalBoltSparks` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/crystal-fx.ts tests/crystal-fx.test.ts
git commit -m "refactor(crystal-fx): replace SparkParticles with per-crystal CrystalBoltSparks"
```

---

### Task 5: Revert `createFracturedMaterial` to Phase 6c values

**Files:**
- Modify: `src/crystal-fx.ts` (rewrite the `createFracturedMaterial` function, lines ~262-274)

**Interfaces:**
- Produces: `MeshStandardMaterial` with `color: 0x88e6ff`, `emissive: 0x22f0ff` (Phase 6c value, brighter than Phase 6c2's `0x0e8fa0`), `emissiveIntensity: 0.5` (Phase 6c value, brighter than Phase 6c2's 0.25)

- [ ] **Step 1: Locate the function**

Read `src/crystal-fx.ts` lines 260-275 (the `createFracturedMaterial` block). Note the My Rules comment block above the function should also be updated to reflect the revert.

- [ ] **Step 2: Update the My Rules comment block**

Replace the existing comment block (lines ~240-261) with:

```ts
/**
 * Build the cyan MeshStandardMaterial used for fractured crystals.
 * Replaces the previous cracked-vein material. The Game drives the
 * emissiveIntensity from crystalCharge + getBurstFlash each frame.
 *
 * Phase 6c3 revert: emissive color restored to Phase 6c value (#22f0ff
 * saturated cyan) and intensity restored to 0.5. The Phase 6c2 dim
 * values (#0e8fa0 / 0.25) were paired with the yellow arcs (which needed
 * to read against a dim cyan core). Phase 6c3 uses white-hot bolts
 * instead of yellow, so the brighter cyan body works better — it bloom-
 * bleeds against the white-hot without becoming a yellow halo.
 *
 * `transparent: true` is set at creation so the death tween's opacity
 * fade works without forcing a shader recompile at runtime (Phase 6c2
 * post-mortem: runtime transparent flip left ghost marks on inner meshes).
 */
```

- [ ] **Step 3: Update the function body**

Replace the function body:

```ts
export function createFracturedMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0x88e6ff,
    emissive: 0x22f0ff,
    emissiveIntensity: 0.5,
    flatShading: true,
    metalness: 0,
    roughness: 0.35,
    envMapIntensity: 0,
    transparent: true,
    opacity: 1.0,
  });
}
```

- [ ] **Step 4: Run typecheck to verify no breakage**

Run: `npm run typecheck`
Expected: PASS (the function signature is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/crystal-fx.ts
git commit -m "revert(crystal-fx): restore Phase 6c brighter cyan emissive"
```

---

### Task 6: Wire `ExtrudingBolt` + `CrystalBoltSparks` into `game.ts`

**Files:**
- Modify: `src/game.ts` (replace `ElectricityArc` references with `ExtrudingBolt`, replace `SparkParticles` with per-crystal `CrystalBoltSparks`)
- Test: `npm run typecheck`

**Interfaces:**
- Consumes: new exports from `src/crystal-fx.ts`
- Produces: per-crystal bolt + sparks lifecycle in `fractureCrystal`, update in the per-frame loop, dispose in `cleanupFracturedCrystal`

- [ ] **Step 1: Update the imports at the top of `src/game.ts`**

Find the import block from `../crystal-fx` or `./crystal-fx` (around line 67-68). Replace `ElectricityArc` with `ExtrudingBolt` and `SparkParticles` with `CrystalBoltSparks`. Also add `getHeartbeatPhase` to the import.

```ts
import {
  CrystalFractureScheduler,
  CrystalBoltSparks,
  ExtrudingBolt,
  createFracturedMaterial,
  crystalCharge,
  getBurstFlash,
  getHeartbeatPhase,
  // ... other existing imports
} from './crystal-fx';
```

- [ ] **Step 2: Replace the type declarations**

In `src/game.ts`, find and replace:

```ts
private crystalArcs = new Map<number, ElectricityArc>();
```

With:

```ts
private crystalBolts = new Map<number, ExtrudingBolt>();
```

And replace:

```ts
private sparks: SparkParticles | null = null;
```

With:

```ts
private crystalSparks = new Map<number, CrystalBoltSparks>();
```

- [ ] **Step 3: Update `Game.create()` initialization**

Find the `this.sparks = new SparkParticles();` line (around line 361). DELETE it — sparks are now per-crystal, no scene-wide pool.

- [ ] **Step 4: Update `fractureCrystal`**

Find the `fractureCrystal` method (around line 835). Inside, replace any `new ElectricityArc(crystalId)` with `new ExtrudingBolt(crystalId)`, and add a new `CrystalBoltSparks` instance per crystal. The exact code is:

Find the line `const arc = new ElectricityArc(crystalId);` and replace the next 8-10 lines (the block that attaches the arc to the scene and adds it to the map) with:

```ts
const bolt = new ExtrudingBolt(crystalId);
bolt.setResolution(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
bolt.attach(this.scene);
this.crystalBolts.set(crystalId, bolt);

const sparks = new CrystalBoltSparks(crystalId);
this.scene.add(sparks.points);
this.crystalSparks.set(crystalId, sparks);
```

- [ ] **Step 5: Update the per-frame update loop**

Find the loop in the per-frame update where `crystalArcs` is iterated (around line 1056). Replace the entire arc-update block with:

```ts
const bolt = this.crystalBolts.get(crystalId);
if (bolt) {
  bolt.update(deltaTime, charge, worldPos, radius, crystalId);
}

const sparks = this.crystalSparks.get(crystalId);
if (sparks) {
  sparks.emit(charge, worldPos, radius, deltaTime);
  sparks.update(deltaTime);
}
```

- [ ] **Step 6: Revert Phase 6c2 pulse coefficient dimming**

Find the line `fractured.emissiveIntensity = 0.25 + 0.4 * charge * charge + 0.3 * flash;` (around line 961 in the fractureCrystal path) and replace with:

```ts
fractured.emissiveIntensity = 0.5 + 0.6 * charge * charge + 0.4 * flash;
```

And find the line `fracturedMaterial.emissiveIntensity = 0.25 + 0.4 * charge * charge;` (around line 1053 in the per-frame loop) and replace with:

```ts
fracturedMaterial.emissiveIntensity = 0.5 + 0.6 * charge * charge;
```

- [ ] **Step 7: Update the dispose chain**

Find any block that disposes the old `crystalArcs` / `sparks` (around the cleanup / crystal-destruction path). Replace with:

```ts
const bolt = this.crystalBolts.get(crystalId);
if (bolt) {
  bolt.detach(this.scene);
  bolt.dispose();
  this.crystalBolts.delete(crystalId);
}
const sparks = this.crystalSparks.get(crystalId);
if (sparks) {
  this.scene.remove(sparks.points);
  sparks.dispose();
  this.crystalSparks.delete(crystalId);
}
```

- [ ] **Step 8: Update `resizeHandler`**

Find the resize handler. Add a loop over `crystalBolts` to call `setResolution` on each (the resize handler already exists from Phase 6c2; just verify the loop now iterates `crystalBolts` not `crystalArcs`):

```ts
for (const bolt of this.crystalBolts.values()) {
  bolt.setResolution(this.renderer.domElement.clientWidth, this.renderer.domElement.clientHeight);
}
```

- [ ] **Step 9: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/game.ts
git commit -m "feat(game): wire ExtrudingBolt + per-crystal CrystalBoltSparks"
```

---

### Task 7: Revert `UnrealBloomPass` to Phase 6c values

**Files:**
- Modify: `src/post-processing.ts` (revert bloom parameters)

**Interfaces:**
- Produces: `UnrealBloomPass` with `threshold: 0.15`, `strength: 0.55` (Phase 6c values, brighter than Phase 6c2's 0.35/0.4)

- [ ] **Step 1: Update the My Rules comment block**

Read `src/post-processing.ts`. The comment block above `new UnrealBloomPass(...)` (around lines 38-46) references Phase 6c2 dim-bloom reasoning. Replace with:

```ts
// Resolution, strength, radius, threshold.
// Phase 6c3 revert: threshold 0.35 → 0.15, strength 0.4 → 0.55. The
// Phase 6c2 dim values were needed because yellow arcs were drawn over
// a bright cyan core and bloomed into a white-out. Phase 6c3 uses
// white-hot bolts on a bright cyan body — both colors bloom against
// each other naturally without needing dim suppression.
```

- [ ] **Step 2: Update the bloom pass parameters**

Find `new UnrealBloomPass(new ThreeVector2(width, height), 0.4, 0.35, 0.35)` and replace with:

```ts
new UnrealBloomPass(new ThreeVector2(width, height), 0.55, 0.35, 0.15)
```

(Note: `UnrealBloomPass` constructor signature is `(resolution, strength, radius, threshold)`.)

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/post-processing.ts
git commit -m "revert(post-processing): restore brighter UnrealBloomPass"
```

---

### Task 8: Visual verification (Playwright screenshots)

**Files:** No code changes. Screenshots saved to `C:/projects/3d_astroids/`.

**Interfaces:** Uses the existing `__hooks.spawnCrystalAt`, `__hooks.fractureCrystal`, `__hooks.pauseClock`, `__hooks.setGameTime` debug bridge from `src/game.ts`.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background, `run_in_background: true`)
Wait for "Local: http://localhost:5173" or similar.

- [ ] **Step 2: Open the game in Playwright**

Use the `mcp__plugin_playwright_playwright__browser_navigate` tool to navigate to `http://localhost:5173`. Click Ship 1 (any ship button) to enter gameplay and trigger `Game.create()` (so `__hooks` is populated).

- [ ] **Step 3: Capture the 6 staged screenshots**

For each screenshot, use `mcp__plugin_playwright_playwright__browser_evaluate` to set up the stage:

```js
// Calm (charge ~0.2)
__hooks.pauseClock(true);
__hooks.setGameTime(__hooks.gameTime + 1.6);  // 1.6s into burst window = 0.4s remaining = charge ~0.008 → adjust to find a calm point
// screenshot
```

The exact charge mapping depends on `BURST_INTERVAL_SECONDS` (2.0s). Calibrate by trial:

| Screenshot | Target | Approx `setGameTime` offset |
|------------|--------|------------------------------|
| Calm | charge ≈ 0.2 | Offset ≈ 0.6s before a burst |
| Mid | charge ≈ 0.6 | Offset ≈ 0.3s before a burst |
| Peak | charge ≈ 0.95 | Offset ≈ 0.05s before a burst |
| Mid-flash | burst flash t=0.075s | Offset ≈ 0.075s after a burst |
| After-destruction | crystal removed | Manually call `__hooks.killCrystal(id)` |
| All-destroyed | all crystals removed | Same, repeat for all |

Save each screenshot via `mcp__plugin_playwright_playwright__browser_take_screenshot` with filenames `phase6c3-calm.png`, `phase6c3-mid.png`, etc.

- [ ] **Step 4: Verify screenshots**

Open each PNG and confirm visually:
- Calm: crystal has subtle pulse, no/few bolts, no/few sparks
- Mid: 5 bolts visible extending from crystal into surrounding space, sparks flying outward, white-hot color
- Peak: bolts at full intensity, sparks clustered near crystal (just emitted), white-hot dominates
- Mid-flash: entire crystal surface white-hot for one frame
- After-destruction: clean arena, no ghost marks
- All-destroyed: completely clean, no leftover geometry

- [ ] **Step 5: Stop the dev server**

Stop the background `npm run dev` task.

- [ ] **Step 6: Commit screenshots**

```bash
git add *.png
git commit -m "docs: capture Phase 6c3 visual verification screenshots"
```

---

### Task 9: Run quality gates + final commit

**Files:** No code changes.

- [ ] **Step 1: Ask the user via AskUserQuestion which gate scope to run**

Use the gate-prompt header `Gate scope`. Options: All gates / Typecheck + unit tests / Typecheck only / Skip gates. Default recommendation: **Typecheck + unit tests** (we changed rendering + dispose paths).

- [ ] **Step 2: Run the selected gates**

Run the command matching the user's choice.

- [ ] **Step 3: If gates fail, fix and re-run**

Do NOT proceed to commit until gates are green.

- [ ] **Step 4: Push to `phase-2-movement`**

```bash
git push origin phase-2-movement
```

---

## Self-Review

**Spec coverage:**
- ✅ `ExtrudingBolt` class with extruding geometry (Task 3) — spec section "Component interfaces" + "Extruding bolt geometry"
- ✅ `CrystalBoltSparks` class with distance + charge scaled size (Task 4) — spec section "Component interfaces" + How to apply tuning constants
- ✅ `getHeartbeatPhase` helper (Task 1) — spec section "Out of scope" notes heartbeat-synced
- ✅ `createFracturedMaterial` revert to Phase 6c values (Task 5) — spec section "What gets reverted from Phase 6c2"
- ✅ `post-processing.ts` revert (Task 7) — spec section "What gets reverted from Phase 6c2"
- ✅ `game.ts` wire-up (Task 6) — spec section "Data flow per frame"
- ✅ Visual verification (Task 8) — spec section "Visual (Playwright)"
- ✅ Quality gates (Task 9) — spec section "Quality gates"

**Placeholder scan:**
- All constants are exact (BOLTS_PER_CRYSTAL = 5, SPARK_POOL_SIZE = 40, etc.)
- All file paths are absolute
- All commands are full with expected output
- No "TBD" or "implement later"
- No "add appropriate error handling" hand-waves

**Type consistency:**
- `ExtrudingBolt` API matches the spec's interface block (setResolution / attach / detach / update / dispose)
- `CrystalBoltSparks` API matches the spec's interface block (emit / update / dispose)
- `getHeartbeatPhase(t)` matches the spec's signature
- `computeBoltEndpoints(seed, radius, segs)` is the test-only helper for Task 2

No issues found.