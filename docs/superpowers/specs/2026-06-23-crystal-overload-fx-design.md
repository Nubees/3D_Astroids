# Phase 6c3 — Surface Lightning Telegraph for Fractured Crystals

**Status:** Design approved 2026-06-23
**Branch:** `phase-2-movement`
**Prior art:** Phase 6c (cracked-vein texture), Phase 6c2 (yellow Line2 arcs + 120-particle scene pool)

## Problem

The current Phase 6c2 telegraph (yellow Line2 arcs + 120-particle `SparkParticles` scene pool + dim bloom) doesn't read as "electricity moving around the crystal" — the user reports it looks bad. The arcs float *around* the crystal rather than emanating *from* it; the sparks look like generic particles, not electrical discharge; the bloom dimming made the crystal lose its glow.

The user wants:
- Strip the current effects
- Keep ONLY the pulsing light glow + scale-breathe effects
- Research better visual approaches
- Implement a chosen approach
- **NEW (mid-spec feedback): the user reports "still looks the same, where are the sparks, add extruding lightning flashing strikes"** — the chosen approach must (a) make sparks far more visible, and (b) include lightning that EXTRUDES from the crystal (visibly sticks out into the surrounding space), not just lightning drawn on the surface.

## Chosen Approach — Extruding Lightning Bolts + Big Spark Bursts

Replace the floating Line2 arcs and scene-wide spark pool with two new layers designed for IMPACT, not subtlety:

1. **Extruding lightning bolts** — 4-6 Line2 bolts that radiate FROM the crystal's surface OUTWARD into the surrounding space by 1.5-2.5 crystal-radii. White-hot, 4-6 px thick (using the Line2 + LineMaterial pattern from Phase 6c2 since that works), but with much more dramatic flicker, branching, and intensity ramp. Each bolt has 8-10 jagged segments instead of the previous 4. The bolts visibly *stick out* of the crystal — like a Tesla coil's plasma streamers, not a halo.
2. **Big spark bursts** — per-crystal Points pool, 32-48 particles (up from the previous 12), each one ~2-3x larger than before, with much higher emission rate and longer lifetime (0.6s up from 0.2s). Sparks fly 1.5-2.5 units outward, then trail off and fade. They should be obviously visible at any zoom level.

The existing pulse + scale-breathe effects stay UNCHANGED. The inner-core shader glow (from the earlier design) is dropped — the user wants spectacle, not subtle inner detail.

The key difference from Phase 6c2: the bolts MUST visibly extrude from the crystal surface (not float around it at random angles), the sparks MUST be obviously visible (larger, longer-lived, more numerous), and the bloom should NOT be dimmed (we want the white-hot to bloom dramatically).

## Architecture

### File changes

| File | Change |
|------|--------|
| `src/crystal-fx.ts` | Replace `ElectricityArc` (3 bolts, 4 segments, on-sphere) with `ExtrudingBolt` (4-6 bolts, 8-10 segments, extending 1.5-2.5 radii OUTWARD). Replace `SparkParticles` (scene-wide 120 pool) with `CrystalBoltSparks` (per-crystal pool of 32-48 larger particles, 0.6s lifetime). Rewrite `createFracturedMaterial` to RESTORE the brighter cyan emissive (Phase 6c value: `0x22f0ff` color, intensity 0.5 — drop the dim Phase 6c2 values). Extend `getBurstFlash` to support heartbeat phases. Keep Line2 + LineMaterial imports (they work for the new extruding bolts). |
| `src/game.ts` | Wire per-frame `ExtrudingBolt.update(charge, deltaTime, worldPos, radius)` per crystal. Wire per-frame `CrystalBoltSparks.emit + update` per crystal. Revert Phase 6c2's pulse coefficient dimming (back to 0.5+0.6c²). Keep `material.transparent = true` removed (Phase 6c2 ghost-mark fix stays). |
| `src/post-processing.ts` | Revert `UnrealBloomPass` to threshold `0.15`, strength `0.55` (drop Phase 6c2 dim-bloom — we want the white-hot to bloom dramatically). |
| `src/asteroid.ts` | No changes — `IcosahedronGeometry` and mesh hierarchy stay identical. |
| `tests/crystal-fx.test.ts` | NEW. Unit tests for `getHeartbeatPhase`, `ExtrudingBolt` bolt-endpoint math (start at surface, end at 1.5-2.5 radii outward), `CrystalBoltSparks` pool (32-48 particles, ages increment correctly). |

### Component interfaces

```ts
// src/crystal-fx.ts

export class ExtrudingBolt {
  readonly mesh: Line2;
  constructor(seed: number);
  /** Per-frame tick — call once per fractured crystal. */
  update(deltaTime: number, charge: number, worldPos: Vector2, radius: number, seed: number): void;
  /** Set viewport resolution in pixels. Required for LineMaterial screen-space thickness. */
  setResolution(width: number, height: number): void;
  attach(scene: Scene): void;
  detach(scene: Scene): void;
  dispose(): void;
}

export class CrystalBoltSparks {
  readonly points: Points;
  constructor(seed: number);
  /** Emit sparks for this frame. charge is crystalCharge in [0,1]. */
  emit(charge: number, worldPos: Vector2, radius: number, deltaTime: number): void;
  /** Tick the pool. Call once per crystal per frame. */
  update(deltaTime: number): void;
  dispose(): void;
}

export function createFracturedMaterial(): MeshStandardMaterial;

/** Heartbeat curve in [0,1] for the surface-flash before each burst.
 *  Peaks at t=0.075s (matching the existing burst flash), repeats every 0.5s. */
export function getHeartbeatPhase(t: number): number;
```

### Extruding bolt geometry (the key visual)

```ts
// Concept — implemented in ExtrudingBolt.regenerate()
for (let bolt = 0; bolt < 5; bolt += 1) {
  // Start: a random point on the crystal surface
  const startDir = sampleUnitVector(rng);
  const start = scaleVec(startDir, radius * 0.95);  // just inside the surface

  // End: 1.5-2.5 crystal-radii OUTWARD from the start (in roughly the same direction)
  const extension = 1.5 + rng() * 1.0;
  const endDir = normalize(addVec(startDir, scaleVec(sampleUnitVector(rng), 0.3)));  // slight angle jitter
  const end = scaleVec(endDir, radius * extension);

  // Polyline: 8-10 segments with perpendicular noise jitter
  const segs = 8 + Math.floor(rng() * 3);
  for (let s = 0; s <= segs; s += 1) {
    const t = s / segs;
    let p = lerpVec(start, end, t);
    if (s > 0 && s < segs) {
      // Midpoints: jittered perpendicular to the bolt line
      p = addVec(p, scaleVec(sampleUnitVector(rng), 0.3));
    }
    positions.push(p);
  }
}
```

The Line2 + LineMaterial stays from Phase 6c2 (proven to render at 4-6 px, not the WebGL-spec 1px). Linewidth bumped 3 → 5 px. Bolts regenerate every 60ms (slightly faster than the previous 70ms) for more aggressive flicker.

### Data flow per frame

```
game.ts update loop
  ↓
for each fractured crystal:
  charge = crystalCharge(timeToNextBurst)
  burstFlash = getBurstFlash(t_since_last_burst)
  heartbeat = getHeartbeatPhase(timeToNextBurst)
  crystal.bolt.update(deltaTime, charge, worldPos, radius, crystalSeed)
  crystal.boltSparks.emit(charge, worldPos, radius, deltaTime)
  crystal.boltSparks.update(deltaTime)
  crystal.mesh.scale = 1 + 0.05 * sin(charge * π)   // unchanged
  crystal.fracturedMaterial.emissiveIntensity = 0.5 + 0.6 * charge²  // restored from Phase 6c
```

### Error handling / dispose

- `ExtrudingBolt.dispose()` → `geometry.dispose()` + `material.dispose()`. Idempotent.
- `CrystalBoltSparks.dispose()` → `points.geometry.dispose()` + `material.dispose()`. Idempotent.
- `game.ts` calls both in `cleanupFracturedCrystal(crystal)`.
- **Critical lesson from Phase 6c2:** never set `material.transparent = true/false` at runtime — it forces a shader recompile that leaves shared-material siblings in garbage state. `createFracturedMaterial` is created with `transparent: true, opacity: 1.0` at construction; the death-tween opacity fade uses `material.opacity` (we keep the Phase 6c2 fix).

## Testing

### Unit (vitest)

`tests/crystal-fx.test.ts` covers:
- `getHeartbeatPhase(t)`: peaks at t=0.075s, returns to 0 at t=0.15s, repeats
- `ExtrudingBolt` bolt-endpoint math: start lies on surface (radius * 0.95), end lies at 1.5-2.5x radius outward
- `ExtrudingBolt` segment count: 8-10 midpoints per bolt
- `CrystalBoltSparks` pool: 32-48 particles, ages increment correctly, recycles when full
- `CrystalBoltSparks` per-frame emission: scales with charge², capped at 8 per frame per crystal

### Visual (Playwright)

6 screenshots, deterministic staging via `__hooks.pauseClock + setGameTime`:
1. Calm (charge ~ 0.2) — surface dim, core barely visible, no forks
2. Mid (charge ~ 0.6) — surface forks appearing, core brighter, heartbeat visible
3. Peak (charge ~ 0.95) — forks at full intensity, core white-hot, heartbeat peak
4. Mid-burst-flash (t_since_burst = 0.075s) — full surface white-hot for 0.1s
5. After-destruction — no ghost marks, full cleanup verified
6. All-destroyed — completely clean arena (no marks, no leftovers)

## Quality gates

Per the workflow rule at `.claude/rules/workflow-gates.md`: ask the user via AskUserQuestion before running gates. Default recommendation:
- **Typecheck only** for shader tweaks
- **Typecheck + unit tests** for material lifecycle changes
- **All gates** if touching `game.ts` dispose path

User can skip gates if visual screenshots are sufficient.

## Out of scope

- Inner-core fbm shader glow (dropped per user mid-spec feedback — wants spectacle, not subtle)
- Surface-only lightning drawn on the UV plane (replaced by extruding bolts that visibly stick out)
- Audio cues (already missing — separate concern)
- Death tween improvements (current Phase 6c2 fix is correct — don't touch)

## How to apply

- Crystal FX tuning constants live in `src/crystal-fx.ts` (`BOLTS_PER_CRYSTAL = 5`, `BOLT_SEGMENTS = 8-10`, `BOLT_EXTENSION_MIN/MAX_RADII = 1.5/2.5`, `BOLT_REBUILD_INTERVAL_SECONDS = 0.06`, `SPARK_POOL_SIZE = 32-48`, `SPARK_LIFETIME_SECONDS = 0.6`, `SPARK_BASE_SIZE_PX = 18`, `SPARK_SIZE_CHARGE_MULTIPLIER = 2.5`). When changing, capture the 3 charge-phase screenshots (calm/mid/peak) to verify bolts read against bloom.
- `crystalCharge(t) = t³` remains the master pacing curve — change it once, both the bolt intensity AND the spark emission rate rebalance. Don't tune layers independently.
- White-hot lightning was chosen for thermal overload reading (no color clash with cyan body). The bolts' COLOR_STOPS: (0.0, 1.0, 0.98, 0.92) white-hot is the only sanctioned palette; if the crystal body color ever changes, the bolts stay white-hot.
- Bolts start at `radius * 0.95` (just inside the surface) and extend along the radial direction with slight jitter (≤ 0.3 perpendicular). This makes them look like they're EMANATING from the crystal, not floating in space around it. If the bolt start drifts off-surface, the visual will read as "halo" not "lightning."
- Material lifecycle: NEVER set `material.transparent = true/false` at runtime. If a fade is needed, use `material.opacity` (and set `transparent: true` at creation).
- `__hooks` debug bridge (`spawnCrystalAt`, `fractureCrystal`, `setGameTime`, `pauseClock`) is the canonical pattern for deterministic Playwright capture.

## Open questions

None — all design decisions approved by user 2026-06-23.

## Commit plan

Single commit, message:

> `Phase 6c3 — Extruding lightning bolts + big spark bursts from the crystal`
>
> Replace Phase 6c2's floating Line2 arcs (3 short bolts, on-sphere) with 5 EXTRUDING bolts (8-10 jagged segments each, extending 1.5-2.5 crystal-radii OUTWARD into surrounding space, 5 px thick via Line2). Replace scene-wide 120-particle pool with per-crystal 32-48 particle pool, 0.6s lifetime, 2-3x larger sprite, higher emission rate. Restore brighter cyan emissive (Phase 6c values: 0x22f0ff color, 0.5 intensity) and un-dim bloom (threshold 0.15, strength 0.55) — we want the white-hot to bloom dramatically. Revert game.ts pulse coefficient dimming from Phase 6c2.
>
> Bolts start at the crystal's surface and visibly stick out into space (Tesla coil / plasma globe reading), with the direction biased along the radial vector from crystal center. Sparks are obvious at any zoom level.
>
> Co-Authored-By: Claude <noreply@anthropic.com>`