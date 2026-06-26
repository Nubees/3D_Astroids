# Phase 6d — Vendored LightningStrike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manually-built `ExtrudingBolt` zigzag in `src/crystal-fx.ts` with a wrapper around `THREE.LightningStrike` (vendored from three.js r149 examples), so the crystal "overloaded / about to burst" FX shows real fractal-branched, 4D-noise-flickered lightning instead of a stiff polyline.

**Architecture:** Vendor `LightningStrike.js` + `SimplexNoise.js` from three.js r149 examples into `src/vendor/` (MIT license). Build a thin `CrystalLightning` class in `src/crystal-fx.ts` that owns N short-lived `LightningStrike` instances (50-150 ms each), projects their `sourceOffset` onto the crystal surface and `destOffset` 1.5-2.5 crystal-radii outward, and calls `update(time)` each frame. The 4D simplex noise (`noise4d(x,y,z,time)`) inside `LightningStrike` produces per-frame flicker for free — no per-frame geometry rebuild in our code.

**Tech Stack:** Three.js r149 legacy examples (`LightningStrike` + `SimplexNoise`), our existing three@0.184.0 import paths, Vite + TypeScript.

## Global Constraints

These constraints apply to every task below. They are copied verbatim from CLAUDE.md and the design discussion; reviewer should treat any deviation as a defect.

- **Code style** (`.claude/rules/code-style.md`): 2-space indent, single quotes, semicolons required, max line length 100, PascalCase classes, camelCase functions, UPPER_SNAKE_CASE constants, named exports preferred.
- **"My Rules" comments**: Every non-trivial block must include Purpose/Setup/Issues/Fix/Gotchas. See `Knowledge/Frameworks/code-section-notes.md`.
- **Atomic actions**: Do exactly what the task brief says. No cascading side effects.
- **Surgical changes**: Touch only what the task requires. Don't "improve" adjacent code.
- **Match existing style**: Even if you'd do it differently, match the file you're editing.
- **Search before building**: Reuse existing patterns; only add new files if necessary.
- **Vendor provenance**: Every vendored file must include a header block listing source URL, original license (MIT for three.js examples), and the SHA/version of the source we vendored from. See `Knowledge/Frameworks/code-section-notes.md` for the template.
- **No bloom**: `src/post-processing.ts` stays at "bloom disabled" (the no-op `composer: null` stub). Do not re-enable bloom in this plan.
- **Sparks unchanged**: `CrystalBoltSparks` class in `src/crystal-fx.ts` is not modified by this plan. Only the bolt class is replaced.
- **Public API stability**: The replacement class must keep the same `attach / detach / update / dispose / setResolution` surface that `ExtrudingBolt` exposed, so `src/game.ts` wire-up is a no-op (just a class name swap).
- **No vendoring of unused code**: If `LightningStorm.js` is not needed by `CrystalLightning`, do not vendor it.

---

### Task 1: Vendor LightningStrike + SimplexNoise

**Files:**
- Create: `src/vendor/three-r149-SimplexNoise.js`
- Create: `src/vendor/three-r149-LightningStrike.js`
- Create: `src/vendor/README.md` (provenance + license note)

**Interfaces:**
- Consumes: nothing
- Produces: `LightningStrike` (named export, subclass of `BufferGeometry`) and `SimplexNoise` (named export, plain class). Both vendored files use ES module `export {}` syntax so Vite imports them directly.

**Source verbatim copy (no edits to algorithm):**
- Source URL: `https://raw.githubusercontent.com/mrdoob/three.js/r149/examples/jsm/geometries/LightningStrike.js`
- Source URL: `https://raw.githubusercontent.com/mrdoob/three.js/r149/examples/jsm/math/SimplexNoise.js`
- License: MIT (Three.js examples are MIT)
- Both files were fetched and verified on 2026-06-23 (see `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\research_threejs_lightning_2026-06-23.md`)

**Required edit in vendored `LightningStrike.js`:**
- The original imports `from '../math/SimplexNoise.js'`. Rewrite this to `from './three-r149-SimplexNoise.js'` since both files will live flat in `src/vendor/`.

**Required header in each vendored file (vendor provenance):**
```
// ═══════════════════════════════════════════════════════════════════════════
// Vendor Provenance — three.js r149 example
// ═══════════════════════════════════════════════════════════════════════════
// Source : https://github.com/mrdoob/three.js/blob/r149/examples/jsm/...
// License: MIT (Copyright © 2010–present three.js authors)
// Pulled : 2026-06-23 for the Phase 6d crystal-lightning FX.
// Why     : three.js core (since r150) no longer ships these in examples/jsm/.
//           They live in three-stdlib; vendoring avoids adding a dep.
// Edits   : (a) added this provenance block; (b) rewrote the SimplexNoise
//           import path to point at the flat sibling file in src/vendor/.
//           The algorithm is UNCHANGED — diff against upstream must show
//           only the two edits above.
// ═══════════════════════════════════════════════════════════════════════════
```

- [ ] **Step 1: Write `src/vendor/three-r149-SimplexNoise.js`**
  - Paste the verbatim contents from the r149 raw URL.
  - Add the vendor provenance block at the top.
  - No other edits.

- [ ] **Step 2: Write `src/vendor/three-r149-LightningStrike.js`**
  - Paste the verbatim contents from the r149 raw URL.
  - Add the vendor provenance block at the top.
  - Rewrite the single import `from '../math/SimplexNoise.js'` to `from './three-r149-SimplexNoise.js'`.
  - No other edits.

- [ ] **Step 3: Write `src/vendor/README.md`**
  - One paragraph explaining what's vendored, where it came from, the license, and why we vendored instead of pulling `three-stdlib`.
  - Note the two edited lines (provenance block + import path) and that the algorithm is otherwise unchanged.

- [ ] **Step 4: Verify the files compile in isolation**
  - Run: `npm run typecheck`
  - Expected: PASS. Vite doesn't run typecheck on `node_modules` paths, but the vendored files live in `src/` so they ARE typechecked. The vendored code uses `import` from `'three'` which our tsconfig resolves correctly.

- [ ] **Step 5: Commit**
  - `git add src/vendor/`
  - `git commit -m "vendor(three): add r149 LightningStrike + SimplexNoise from three.js examples (MIT)"`

---

### Task 2: Replace ExtrudingBolt with CrystalLightning

**Files:**
- Modify: `src/crystal-fx.ts`
- Test: `tests/crystal-lightning.test.ts`

**Interfaces:**
- Consumes: `LightningStrike` from `../vendor/three-r149-LightningStrike.js`
- Consumes: `Mesh`, `MeshBasicMaterial`, `AdditiveBlending`, `Vector3` from `three`
- Consumes: existing types `Vector2`, `CrystalFractureScheduler`, etc. (already in scope)
- Produces: `CrystalLightning` class — drop-in replacement for `ExtrudingBolt`

**Behavior contract:**
- Constructor takes `(seed: number)` — matches old signature.
- `attach(scene)`, `detach(scene)`, `dispose()` — match old signatures.
- `setResolution(width, height)` — present (no-op, kept for API compat with game.ts which calls it on construction + resize).
- `update(deltaTime, charge, worldPos, radius, seed)` — match old signature.
- Internally: owns `STRIKES_PER_CRYSTAL` (e.g. 4) `LightningStrike` geometries, each wrapped in its own `Mesh(geometry, MeshBasicMaterial)`. Each strike has its own `birthTime` / `deathTime`. When a strike's lifetime expires, it gets a new birthTime so it appears to fire continuously.
- Each frame, all strikes get `update(currentTime)` where `currentTime` is a monotonic clock (the Game's now seconds). The strike re-generates its fractal subdivision using `noise4d(x,y,z,time)` — per-frame flicker is built in.
- Each frame, before `update()`:
  - `sourceOffset` is set to a random point on the crystal surface (`worldPos + radius * 0.95 * unitSphereSample`)
  - `destOffset` is set to `worldPos + radius * (1.5..2.5) * unitSphereSample` (different random direction)
- Strike parameters:
  - `radius0` = `radius * 0.05` (thin at source)
  - `radius1` = `radius * 0.02` (thinner at dest)
  - `ramification: 5`
  - `recursionProbability: 0.6`
  - `maxIterations: 5` (balance between detail and CPU)
  - `roughness: 0.9`
  - `straightness: 0.6`
  - `propagationTimeFactor: 0.1`
  - `vanishingTimeFactor: 0.9`
  - `isEternal: false`
  - `birthTime` = previous strike's deathTime + 20ms jitter (so adjacent strikes overlap slightly)
  - `deathTime` = `birthTime + 0.05..0.15` seconds (50-150 ms lifetime per the spec)
- `mesh.material.opacity` is driven by `0.3 + 0.7 * charge` each frame (0.3 floor, 1.0 ceiling).
- `mesh.position` is set to `worldPos` each frame.

**Why this matches the user's visual ask:**
- Real 3D fractal-branched geometry (not a 2-segment polyline)
- 4D simplex noise (x, y, z, **time**) gives per-frame flicker for free — no per-frame geometry rebuild in our code
- `noise4d` is the proven trick the research subagent identified
- `radius0/radius1` small → thin bolts that read as "lightning" not "lines"
- Short lifetimes (50-150ms) with overlapping strikes → continuous crackling appearance
- Multiple strikes per crystal → "Tesla coil" / "plasma globe" multi-streamer reading

- [ ] **Step 1: Write failing test `tests/crystal-lightning.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Vector2 } from '../src/types';
import { CrystalLightning } from '../src/crystal-fx';

describe('CrystalLightning', () => {
  it('constructor produces a non-null mesh with the expected material setup', () => {
    const bolt = new CrystalLightning(42);
    expect(bolt.mesh).toBeDefined();
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).blending).toBe(THREE.AdditiveBlending);
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).transparent).toBe(true);
    bolt.dispose();
  });

  it('update(dt, charge=0) keeps bolts visible (low opacity floor)', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 0, new Vector2(0, 0), 1.0, 42);
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeGreaterThanOrEqual(0.25);
    bolt.dispose();
  });

  it('update(dt, charge=1) hits peak opacity', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 1, new Vector2(0, 0), 1.0, 42);
    expect((bolt.mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(1.0, 1);
    bolt.dispose();
  });

  it('mesh.position follows worldPos', () => {
    const bolt = new CrystalLightning(42);
    bolt.update(0.016, 0.5, new Vector2(7, -3), 1.0, 42);
    expect(bolt.mesh.position.x).toBeCloseTo(7, 5);
    expect(bolt.mesh.position.y).toBeCloseTo(-3, 5);
    bolt.dispose();
  });

  it('dispose releases GPU resources', () => {
    const bolt = new CrystalLightning(42);
    expect(() => bolt.dispose()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
  - Run: `npm test -- --run tests/crystal-lightning.test.ts`
  - Expected: FAIL with "CrystalLightning is not exported from src/crystal-fx"

- [ ] **Step 3: Implement CrystalLightning class in `src/crystal-fx.ts`**

```ts
import { LightningStrike } from './vendor/three-r149-LightningStrike.js';

// (Keep all existing imports from 'three' and add:)
import { Mesh, MeshBasicMaterial } from 'three';

/**
 * How many independent LightningStrike instances per fractured crystal.
 * 4 strikes a balance — enough to read as a multi-streamer, few enough that
 * the per-frame subdivision cost stays under 1ms even on mid-range laptops.
 */
const STRIKES_PER_CRYSTAL = 4;

/**
 * Per-strike lifetime range. The yomboprime demo uses 1.0–2.5s for ground
 * strikes; we want shorter (50-150ms) so the strikes feel like rapid
 * crackling rather than sustained beams.
 */
const STRIKE_LIFETIME_MIN_S = 0.05;
const STRIKE_LIFETIME_MAX_S = 0.15;

/**
 * Strike radius range. The r149 defaults are 1.0; we want thin bolts that
 * read as "lightning" not "ribbon" so we scale to crystal-radius fractions.
 */
const STRIKE_RADIUS0_FRAC = 0.05;
const STRIKE_RADIUS1_FRAC = 0.02;

export class CrystalLightning {
  readonly mesh: Mesh; // parent Group containing all strike meshes
  private readonly strikes: Array<{
    geometry: LightningStrike;
    mesh: Mesh;
    nextBirth: number;
    lifetime: number;
  }> = [];
  private readonly material: MeshBasicMaterial;
  private currentTime = 0;
  private currentCharge = 0;
  private attached = false;

  constructor(seed: number) {
    void seed;
    this.material = new MeshBasicMaterial({
      color: 0xfff0d0, // warm white-hot
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    // Parent group holds all strike meshes so attach() adds one object.
    this.mesh = new Mesh(new BufferGeometry(), this.material); // placeholder; replaced below
    // Build the strike pool
    const pool: typeof this.strikes = [];
    for (let i = 0; i < STRIKES_PER_CRYSTAL; i += 1) {
      pool.push(this.makeStrike(i * 0.05));
    }
    // Replace placeholder mesh with a parent group containing the strike meshes
    const parent = new Mesh(new BufferGeometry(), this.material);
    // (We use Mesh here because the rest of the code expects Mesh; but we need
    // a Group for multiple children. Use Object3D and cast.)
    // Actually: use Group. The game.ts wire-up calls .mesh.position.set so any
    // Object3D works. Use Group for cleanliness.
    // ...
    // [See full implementation in src/crystal-fx.ts for the Group pattern]
  }

  private makeStrike(birthOffset: number): { ... } {
    // Build one LightningStrike with parameters that read as "thin, branched,
    // short-lived" lightning.
    // ...
  }

  setResolution(width: number, height: number): void {
    // No-op kept for API compat with ExtrudingBolt.
    void width; void height;
  }

  attach(scene: { add: (obj: Object3D) => void }): void {
    if (this.attached) return;
    scene.add(this.mesh);
    this.attached = true;
  }

  detach(scene: { remove: (obj: Object3D) => void }): void {
    if (!this.attached) return;
    scene.remove(this.mesh);
    this.attached = false;
  }

  update(
    deltaTime: number,
    charge: number,
    worldPos: Vector2,
    radius: number,
    seed: number,
  ): void {
    void seed;
    this.currentTime += deltaTime;
    this.currentCharge = charge;
    this.mesh.position.set(worldPos.x, worldPos.y, 0.1);
    // Recycle strikes whose lifetime has expired
    for (const s of this.strikes) {
      if (this.currentTime >= s.nextBirth + s.lifetime) {
        s.nextBirth = this.currentTime;
        s.lifetime = STRIKE_LIFETIME_MIN_S + Math.random() * (STRIKE_LIFETIME_MAX_S - STRIKE_LIFETIME_MIN_S);
        // Reset ray parameters (LightningStrike supports updating sourceOffset
        // and destOffset but birthTime/deathTime require re-init via copyParameters)
        // For simplicity, dispose and rebuild the geometry on recycle.
        s.geometry.dispose();
        s.geometry = new LightningStrike({
          sourceOffset: this.randomSurfacePoint(radius),
          destOffset: this.randomOuterPoint(radius),
          radius0: radius * STRIKE_RADIUS0_FRAC,
          radius1: radius * STRIKE_RADIUS1_FRAC,
          birthTime: s.nextBirth,
          deathTime: s.nextBirth + s.lifetime,
          isEternal: false,
          ramification: 5,
          recursionProbability: 0.6,
          maxIterations: 5,
          roughness: 0.9,
          straightness: 0.6,
          propagationTimeFactor: 0.1,
          vanishingTimeFactor: 0.9,
        });
        s.mesh.geometry = s.geometry;
      }
      s.geometry.sourceOffset.copy(this.randomSurfacePoint(radius));
      s.geometry.destOffset.copy(this.randomOuterPoint(radius));
      s.geometry.update(this.currentTime);
    }
    // Drive opacity on the shared material
    this.material.opacity = 0.3 + 0.7 * charge;
  }

  private randomSurfacePoint(radius: number): Vector3 {
    // Uniformly sample a point on a sphere of given radius (Marsaglia)
    let x1: number, x2: number, s: number;
    do {
      x1 = Math.random() * 2 - 1;
      x2 = Math.random() * 2 - 1;
      s = x1 * x1 + x2 * x2;
    } while (s >= 1 || s === 0);
    const factor = 2 * Math.sqrt(1 - s);
    return new Vector3(x1 * factor * radius * 0.95, x2 * factor * radius * 0.95, (1 - 2 * s) * radius * 0.95);
  }

  private randomOuterPoint(radius: number): Vector3 {
    const surface = this.randomSurfacePoint(radius);
    const extension = 1.5 + Math.random() * 1.0;
    return surface.multiplyScalar(extension / 0.95);
  }

  dispose(): void {
    for (const s of this.strikes) {
      s.geometry.dispose();
    }
    this.material.dispose();
  }
}
```

  **Notes for the implementer:**
  - The full code goes in `src/crystal-fx.ts` and replaces the existing `ExtrudingBolt` class entirely.
  - Use `Group` (not `Mesh`) as `this.mesh` since we have multiple child meshes. The wire-up in `game.ts` accesses `.mesh.position` and `.mesh.material`, both of which work on `Group` (Group extends Object3D; `material` won't exist on Group — see compatibility note below).
  - **API compatibility shim**: game.ts currently does `(bolt.mesh as any).material.opacity` OR passes the material through some other mechanism. Check `src/game.ts` to confirm how the bolt's opacity is currently driven; if it accesses `bolt.mesh.material.opacity` directly, we need to either (a) keep `CrystalLightning.mesh` as a Mesh with a transparent material and put the strikes as children, or (b) expose a `material` getter. Option (a) is cleaner — use a Mesh with an empty BufferGeometry as the parent, attach strike meshes as children, and have the strike meshes share the same material. Then `bolt.mesh.material.opacity = ...` still works on the parent.

- [ ] **Step 4: Run test to verify it passes**
  - Run: `npm test -- --run tests/crystal-lightning.test.ts`
  - Expected: PASS (5/5 tests)

- [ ] **Step 5: Run full vitest suite to verify nothing else broke**
  - Run: `npm test -- --run`
  - Expected: PASS (existing tests untouched)

- [ ] **Step 6: Commit**
  - `git add src/crystal-fx.ts tests/crystal-lightning.test.ts`
  - `git commit -m "feat(crystal-fx): replace ExtrudingBolt zigzag with vendored LightningStrike"`

---

### Task 3: Wire CrystalLightning into game.ts

**Files:**
- Modify: `src/game.ts` (replace `ExtrudingBolt` references with `CrystalLightning`)
- Modify: `src/crystal-fx.ts` (remove the now-unused `ExtrudingBolt` class and `computeBoltEndpoints` helper)

**Interfaces:**
- Consumes: `CrystalLightning` from `src/crystal-fx`
- Produces: no public API change. game.ts already constructs `ExtrudingBolt` per crystal; we just swap the class name.

- [ ] **Step 1: Read `src/game.ts` to find all `ExtrudingBolt` references**
  - Use Grep. Expect: import statement + constructor call inside the crystal FX construction path.
  - Document the exact line numbers in the task report.

- [ ] **Step 2: Swap `ExtrudingBolt` → `CrystalLightning` in game.ts**
  - Update the import.
  - Update the constructor call. Signature is identical (`new ExtrudingBolt(seed)` → `new CrystalLightning(seed)`).
  - No other changes needed if the API surface matched in Task 2.

- [ ] **Step 3: Remove the now-unused `ExtrudingBolt` class from `src/crystal-fx.ts`**
  - Delete the `ExtrudingBolt` class definition.
  - Delete the `computeBoltEndpoints` pure helper (only used by ExtrudingBolt).
  - Delete the `BOLT_*` constants and `BOLT_REBUILD_INTERVAL_SECONDS` (now dead).
  - Delete the `Line2`, `LineGeometry`, `LineMaterial` imports if no other code uses them.

- [ ] **Step 4: Run full test suite**
  - Run: `npm test -- --run`
  - Expected: PASS

- [ ] **Step 5: Run typecheck**
  - Run: `npm run typecheck`
  - Expected: PASS

- [ ] **Step 6: Commit**
  - `git add src/crystal-fx.ts src/game.ts`
  - `git commit -m "refactor(game): swap ExtrudingBolt → CrystalLightning in crystal wire-up"`

---

### Task 4: Quality gates + manual visual check

This task has NO new code — it verifies the work compiles, tests pass, and the bolt is visually visible in the browser. After this task, ask the user via AskUserQuestion which gate scope to run before pushing.

- [ ] **Step 1: Run typecheck**
  - `npm run typecheck`
  - Expected: PASS

- [ ] **Step 2: Run vitest**
  - `npm test -- --run`
  - Expected: PASS

- [ ] **Step 3: Run build**
  - `npm run build`
  - Expected: PASS

- [ ] **Step 4: Capture verification screenshot via Playwright**
  - Use the existing `playwright` test that boots the game and waits for a fractured crystal. Confirm visually that the bolt is visible, branched, and flickering.
  - Save the screenshot to `crystal-lightning-vendored.png` (or follow the project's existing screenshot naming convention).
  - Report the screenshot path in the task report.

- [ ] **Step 5: Commit (if any code change happened)**
  - Only commit if Playwright config or test files changed. Vendor artifacts and screenshots committed per project convention.

---

## Done criteria

All four tasks complete, all quality gates green, screenshot shows visible branching lightning. After Task 4, prompt the user via AskUserQuestion to choose gate scope for the final push to `phase-2-movement`.
