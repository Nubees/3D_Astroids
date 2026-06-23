import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { LightningStrike } from './vendor/three-r149-LightningStrike.js';
import {
  BURST_INTERVAL_SECONDS,
  BURST_SCHEDULE,
  CLUTCH_WINDOW_SECONDS,
  FIRST_BURST_DELAY_SECONDS,
  FractureBurstState,
  SATURATION_DURATION_SECONDS,
  ULTRA_CLEAN_WINDOW_SECONDS,
  Vector2,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Crystal FX (Phase 6d — Vendored LightningStrike)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure helpers + scene classes for the crystal-fracture effect.
//          The visual story is "the crystal is overloaded and discharging"
//          (charge-driven pulse, scale breathe, vendored fractal-branched
//          lightning strikes, per-crystal spark particles). The cracked-vein
//          texture (Phase 6c1), the halo-style ElectricityArc (Phase 6c2),
//          and the Phase 6c3 ExtrudingBolt zigzag have all been removed/
//          replaced — see git history if you need to resurrect any of them.
// Setup:   Imported by src/game.ts and tests/shard-burst.test.ts.
// Issues:  Phase 6c3's ExtrudingBolt used a hand-rolled zigzag polyline
//          rebuilt every frame from `computeBoltEndpoints`. With 5 bolts ×
//          8-10 segments each, every frame rewrote the same 50 vertices
//          with new jitter. The result read as "stiff scribbles" — too
//          uniform, no real branching, and the jitter didn't feel like
//          crackling electricity.
// Fix:     Phase 6d's CrystalLightning wraps the vendored r149
//          `LightningStrike` (BufferGeometry subclass from
//          src/vendor/three-r149-LightningStrike.js). The library does
//          the fractal subdivision via 4D simplex noise `noise4d(x, y, z,
//          time)`, so per-frame flicker comes "for free" from the time
//          component. STRIKES_PER_CRYSTAL=4 independent strikes per crystal
//          read as a Tesla-coil / plasma-globe multi-streamer. Each strike
//          has its own birthTime/deathTime (50-150ms lifetime) so adjacent
//          strikes overlap slightly and the visual feels continuous rather
//          than blinky. CrystalLightning has the same
//          `attach/detach/update/dispose/setResolution` surface as the old
//          ExtrudingBolt, so game.ts wire-up was a one-line rename.
// Gotchas:
//  - crystalCharge uses timeToNextBurst (NOT a free-running sine) so the
//    pulse visibly intensifies as the next burst approaches — same shape as
//    the old getCrackPulse (0.3 → 1.0) but with a steeper t³ so the visual
//    is more dramatic at the end.
//  - CrystalLightning.mesh is a `Mesh` with an empty `BufferGeometry` and
//    a SHARED `MeshBasicMaterial`. The strike meshes are CHILDREN of this
//    parent (each with their own `LightningStrike` BufferGeometry), and all
//    strikes reference the parent's material — so a single
//    `material.opacity = ...` mutates every strike at once. The test file
//    relies on `bolt.mesh.material.blending` / `.opacity`; keep that
//    surface intact.
//  - The parent's `position` is updated each frame to follow the crystal
//    in WORLD space — do NOT parent the bolt to the crystal Group in
//    game.ts, or the position would be relative and double-transform.
//  - LightningStrike requires a NON-NEGATIVE `time` argument to
//    `update(currentTime)`. The internal `currentTime` accumulator
//    starts at 0 and only moves forward.
//  - When a strike's lifetime expires, we dispose the old geometry and
//    `new LightningStrike(...)` to refresh birthTime/deathTime cleanly.
//    `LightningStrike.copyParameters` exists for partial refreshes, but
//    full disposal+rebuild is simpler and the cost is bounded (4 strikes,
//    every 50-150ms).
//  - setResolution(w, h) on CrystalLightning is a no-op kept for API compat
//    with the old ExtrudingBolt interface (game.ts calls it on construction
//    AND on canvas resize). LightningStrike doesn't need viewport
//    resolution.
//  - CrystalBoltSparks is a per-crystal Points pool: one geometry, one
//    material, one draw call per crystal. The pool size is 40; when full,
//    oldest particles recycle.
//  - createFracturedMaterial returns a bright cyan MeshStandardMaterial with
//    no emissiveMap (the texture is gone) and an emissiveIntensity that the
//    Game drives from crystalCharge each frame. emissive color is the same
//    cyan as the base color so the pulse reads as "the crystal is glowing
//    brighter" rather than "an emissive map is being revealed."
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cap on the number of bursts fired in a single scheduler update. Defends
 * against tab-unfocus or frame-pause events that would otherwise let the
 * scheduler catch up multiple bursts at once and overwhelm MAX_SHARDS.
 */
const MAX_BURSTS_PER_UPDATE = 1;

/**
 * Time spent before a burst's predicted shard spawn direction is telegraphed.
 * The telegraph mesh is shown for this long before the real shards leave, so
 * the player has 0.15s of dodge information.
 */
export const TELEGRAPH_DURATION_SECONDS = 0.15;

/**
 * Number of segments per arc. Each arc is a polyline drawn from the crystal
 * center to a target on the surface, jittered with intermediate waypoints to
 * read as a lightning bolt. 4 segments per arc is the sweet spot — too few
 * reads as a straight line, too many looks noisy.
 */
const ARC_SEGMENTS_PER_BOLT = 4;

/**
 * How many independent arcs to draw per fractured crystal. One primary
 * long arc + two shorter secondary arcs gives the eye multiple things to
 * track without the geometry rebuild thrashing the CPU.
 */
const ARCS_PER_CRYSTAL = 3;

/**
 * How often (in seconds) the arc geometry regenerates. 70 ms = ~14 redraws
 * per second, which is fast enough to look like flickering electricity but
 * slow enough that the GPU isn't constantly rewriting vertex buffers.
 */
const ARC_REBUILD_INTERVAL_SECONDS = 0.07;

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
 * Score-tier result returned by computeTimeBonusTier. `bonus` is the integer
 * to add to the wave score; `text` is the floating-text label to spawn (or
 * `null` for tiers that emit no text); `color` is the CSS color string.
 */
export interface TierBonus {
  readonly bonus: number;
  readonly text: string | null;
  readonly color: string;
}

/**
 * Classify a crystal kill by how long it lived past fracture.
 *  - elapsed === 0 → CLEAN KILL (crystal died before it ever fractured)
 *  - elapsed < ULTRA_CLEAN_WINDOW_SECONDS (4s) → ULTRA CLEAN
 *  - elapsed < SATURATION_DURATION_SECONDS (10s) → LATE
 *  - else → SURVIVOR (the cascade fully fired; player let it time out)
 */
export function computeTimeBonusTier(elapsed: number): TierBonus {
  if (elapsed <= 0) {
    // Bright cyan — instant reward for the perfect play.
    return { bonus: 100, text: '+100 CLEAN KILL', color: '#00ffe5' };
  }
  if (elapsed < ULTRA_CLEAN_WINDOW_SECONDS) {
    // Vivid gold — the player got in fast, treat it like a medal.
    return { bonus: 75, text: '+75 ULTRA CLEAN', color: '#ffcc00' };
  }
  if (elapsed < SATURATION_DURATION_SECONDS) {
    // Hot orange — late but not dead yet.
    return { bonus: 25, text: '+25 LATE', color: '#ff7733' };
  }
  // Dim silver — the cascade ran out on its own.
  return { bonus: 10, text: '+10 SURVIVOR', color: '#bbbbbb' };
}

/**
 * Per-crystal scheduler. Owns the `nextBurstAt` and `burstIndex` fields from
 * FractureBurstState. The Game constructs one when the crystal first
 * fractures and stores it in a Map keyed by stable asteroid id.
 */
export class CrystalFractureScheduler {
  readonly state: FractureBurstState;

  constructor(crystalId: number, now: number) {
    this.state = {
      crystalId,
      startedAt: now,
      nextBurstAt: now + FIRST_BURST_DELAY_SECONDS,
      burstIndex: 0,
    };
  }

  /**
   * Compute elapsed game-time since the crystal fractured.
   */
  elapsed(now: number): number {
    return Math.max(0, now - this.state.startedAt);
  }

  /**
   * Game-time until the next burst fires (clamped to >= 0).
   */
  getTimeToNextBurst(now: number): number {
    return Math.max(0, this.state.nextBurstAt - now);
  }

  /**
   * Has the saturation cap (last step in BURST_SCHEDULE) fired? After this,
   * the Game destroys the crystal for +10 SURVIVOR.
   */
  isExpired(now: number): boolean {
    return this.state.burstIndex >= BURST_SCHEDULE.length && this.state.nextBurstAt <= now;
  }

  /**
   * Advance the scheduler. Returns the shard counts to fire THIS frame,
   * capped at MAX_BURSTS_PER_UPDATE (1) to defend against frame-pause spikes.
   * Mutates `state.nextBurstAt` and `state.burstIndex` so subsequent calls
   * reflect the progress.
   */
  update(now: number): { burstsToFire: number[]; done: boolean } {
    const result: number[] = [];
    while (
      result.length < MAX_BURSTS_PER_UPDATE &&
      this.state.burstIndex < BURST_SCHEDULE.length &&
      this.state.nextBurstAt <= now
    ) {
      result.push(BURST_SCHEDULE[this.state.burstIndex]);
      this.state.burstIndex += 1;
      this.state.nextBurstAt += BURST_INTERVAL_SECONDS;
    }
    return { burstsToFire: result, done: this.state.burstIndex >= BURST_SCHEDULE.length };
  }
}

/**
 * Charge curve in [0, 1] that drives all four fracture visuals (color pulse,
 * scale breathe, electric arc opacity, spark emission). 0 right after a
 * burst fires (full interval remaining), 1 just before the next burst (no
 * time left). Uses t³ instead of t² for a steeper rise at the end — the
 * "about to burst" moment should feel sudden and electric.
 *
 * Visual driver for the new "overloaded crystal" look:
 *   - emissiveIntensity lerp(0.3, 1.4, charge)
 *   - scale = 1 + 0.05 * sin(charge * π)  (±5% breathe)
 *   - electric arc opacity = charge^2
 *   - spark emission rate = charge^2 * 80 particles/sec
 */
export function crystalCharge(timeToNextBurst: number): number {
  const t = 1 - Math.max(0, Math.min(1, timeToNextBurst / BURST_INTERVAL_SECONDS));
  return t * t * t;
}

/**
 * Flash intensity in [0, 1] over a 0.15s window after a burst fires. Peaks at
 * 1.0 at t=0.075s, returns to 0 at t=0.15s. Used to spike
 * emissiveIntensity on top of the crystalCharge curve for the per-burst
 * flash frame.
 *
 * Formula: sin(π * t / 0.15). Replaces the 2nd-pass bug `2.5*sin(t*π)` which
 * peaks at t=0.5s and never reaches peak in a 0.15s window.
 */
export function getBurstFlash(t: number): number {
  return Math.sin((Math.PI * t) / TELEGRAPH_DURATION_SECONDS);
}

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

/**
 * Build the crystal material used when a crystal is fractured.
 * Phase 6d follow-up (round 3): the user said 'disable all these effects,
 * and return the lightling' — the crystal's own emissive body glow
 * (cyan, driven by emissiveIntensity 0.5 + 0.6 * charge² + 0.4 burst flash)
 * was overpowering the lightning and reading as a 'blooming light flash'.
 * Emissive is now zero, so the crystal body is its base diffuse color
 * (0x88e6ff cyan) with no self-illumination. The lightning is the only
 * luminous effect on the crystal now.
 *
 * `transparent: true` is kept at creation so the death tween's opacity
 * fade works without forcing a shader recompile at runtime.
 */
export function createFracturedMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0x88e6ff,
    emissive: 0x000000,
    emissiveIntensity: 0,
    flatShading: true,
    metalness: 0,
    roughness: 0.35,
    envMapIntensity: 0,
    transparent: true,
    opacity: 1.0,
  });
}

/**
 * Arc color. Phase 6c tuning: switched from cyan to yellow so the arcs stand
 * out against the cyan crystal bloom. Yellow on cyan = complementary color
 * contrast = the arcs punch through the halo instead of getting swallowed
 * by it. RGB channels are kept saturated (1.0, 0.88, 0.4) so AdditiveBlending
 * pushes them above the bloom threshold even at low intensity values.
 */
export const ARC_COLOR_R = 1.0;
export const ARC_COLOR_G = 0.88;
export const ARC_COLOR_B = 0.4;

/**
 * Spark particle color. Phase 6c follow-up: was cyan (0.6, 0.97, 1.0) by
 * accident — the arcs were changed to yellow but the SparkParticles shader
 * uniform was never updated, so the user saw bloom-bleed off cyan core
 * rather than actual yellow particles. Matches ARC_COLOR_R/G/B so arcs and
 * sparks read as the same "electrical discharge" event.
 */
export const SPARK_COLOR_R = 1.0;
export const SPARK_COLOR_G = 0.88;
export const SPARK_COLOR_B = 0.4;

/**
 * Lightning color (white-hot, slightly warm). Kept as RGB constants so the
 * bolt color and the spark color (in CrystalBoltSparks) both reference the
 * same source of truth.
 */
export const BOLT_COLOR_R = 1.0;
export const BOLT_COLOR_G = 0.98;
export const BOLT_COLOR_B = 0.92;

/**
 * How many independent LightningStrike instances per fractured crystal.
 * Phase 6d follow-up: was 4 (multi-streamer Tesla-coil look). User reported
 * the resulting additive glow as "too big and strong" — 4 strikes at full
 * thickness summed past 1.0 even with the dimmed color and capped opacity.
 * 2 strikes still reads as a crackling multi-streamer but with ~half the
 * additive contribution per frame, so the bolt reads as "small electric
 * arcs around the crystal" not "the whole crystal is electrified".
 */
const STRIKES_PER_CRYSTAL = 2;

/**
 * Per-strike lifetime range. The yomboprime demo uses 1.0–2.5s for ground
 * strikes; we want shorter (50-150ms) so the strikes feel like rapid
 * crackling rather than sustained beams. Adjacent strikes overlap
 * slightly so the visual stays continuous.
 */
const STRIKE_LIFETIME_MIN_S = 0.05;
const STRIKE_LIFETIME_MAX_S = 0.15;

/**
 * Strike radius range. Phase 6d follow-up: trunk thickness halved (0.05 → 0.025)
 * and tip thickness halved (0.02 → 0.012) so the bolts read as fine electrical
 * arcs instead of thick ribbons. With 2 strikes (down from 4) and the new
 * opacity cap of 0.35 (down from 0.55), the per-frame additive contribution
 * drops by ~6× from the Phase 6d initial tuning — visually a much quieter
 * crackle, still readable against the cyan crystal.
 */
const STRIKE_RADIUS0_FRAC = 0.025;
const STRIKE_RADIUS1_FRAC = 0.012;

/**
 * ── My Rules ──
 * Purpose: Phase 6d drop-in replacement for the rejected Phase 6c3
 *   hand-rolled zigzag bolt. Wraps the vendored r149 `LightningStrike`
 *   so the visual reads as real fractal-branched lightning instead of a
 *   stiff hand-rolled zigzag polyline.
 * Setup:  Imported by `src/game.ts` as `CrystalLightning`. Constructor
 *   takes a per-crystal `seed` (currently unused — the time-varying
 *   geometry comes from `LightningStrike`'s internal 4D simplex noise).
 *   Each frame the Game calls `update(dt, charge, worldPos, radius, seed)`;
 *   the parent mesh's position is set to `worldPos` and the shared
 *   material's opacity is driven by `0.3 + 0.7 * charge`. The strike
 *   meshes are CHILDREN of `this.mesh` (a parent `Mesh` with empty
 *   BufferGeometry + shared `MeshBasicMaterial`) so the test can read
 *   `bolt.mesh.material` directly and a single opacity change affects
 *   every strike.
 * Issues: Phase 6c3's per-frame regenerate() rewrote the same ~150
 *   vertex buffers every frame; the bolts visibly shifted but the
 *   geometry was a 2D polyline so it read as "scribble" not "lightning".
 * Fix:    LightningStrike uses `noise4d(x, y, z, time)` to generate fractal
 *   ramification per call to `geometry.update(currentTime)`. Multiple
 *   strikes (STRIKES_PER_CRYSTAL=4) with short, overlapping lifetimes
 *   (50-150ms) give a continuous crackling "Tesla coil" reading.
 * Gotchas:
 *   - `mesh` MUST be a `Mesh` (not a `Group`) because the test asserts
 *     `bolt.mesh.material.blending` and the parent surface needs a
 *     `material` property. Use an empty `BufferGeometry` as the geometry.
 *   - Each strike has its OWN `LightningStrike` geometry instance. They
 *     all SHARE the parent's `MeshBasicMaterial` — that's how a single
 *     opacity assignment propagates to every strike.
 *   - When a strike's lifetime expires we dispose the geometry and `new
 *     LightningStrike(...)` to refresh birthTime/deathTime cleanly.
 *     The library exposes `LightningStrike.copyParameters` for partial
 *     refreshes, but full disposal+rebuild is simpler and bounded.
 *   - `setResolution(w, h)` is a no-op kept for API compat with the old
 *     ExtrudingBolt interface (`game.ts` calls it on construction AND on
 *     canvas resize). LightningStrike doesn't need viewport resolution.
 */
export class CrystalLightning {
  readonly mesh: Mesh;
  private readonly strikes: Array<{
    geometry: LightningStrike;
    mesh: Mesh;
    nextBirth: number;
    lifetime: number;
  }> = [];
  private readonly material: MeshBasicMaterial;
  private currentTime = 0;
  private attached = false;

  constructor(seed: number) {
    void seed;
    // Color: pale cyan-white at 0.55 intensity (NOT full 0xfff0d0).
    //   With 4 overlapping strikes + AdditiveBlending, a near-white color
    //   at full opacity sums past 1.0 in every channel and the framebuffer
    //   clamps to white — washing out the whole screen. The 0.55 base
    //   leaves headroom so 4 strikes at peak charge sum to a bright
    //   cyan-white flash, not pure white. Matches the existing crystal
    //   cyan tint so the lightning reads as the same "electrical discharge"
    //   event, not a separate yellow/white fire.
    this.material = new MeshBasicMaterial({
      color: 0x8cd0ff,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    // Parent Mesh: empty BufferGeometry + shared material. The strike
    // meshes are added as children so a single `material.opacity = ...`
    // mutates every strike at once.
    this.mesh = new Mesh(new BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    // Build the strike pool. Each strike is born at a slightly different
    // time (staggered by i * 0.05s) so they don't all fire in lockstep —
    // the result is continuous crackling rather than a single flash.
    for (let i = 0; i < STRIKES_PER_CRYSTAL; i += 1) {
      const strike = this.makeStrike(i * STRIKE_LIFETIME_MIN_S, 1.0);
      this.strikes.push(strike);
      this.mesh.add(strike.mesh);
    }
  }

  /**
   * Build a single LightningStrike + its Mesh wrapper. The strike is born
   * `birthOffset` seconds in the future, lives for `lifetime` seconds, and
   * samples its source/dest offsets from a sphere of the given `radius`.
   */
  private makeStrike(birthOffset: number, radius: number): {
    geometry: LightningStrike;
    mesh: Mesh;
    nextBirth: number;
    lifetime: number;
  } {
    const lifetime =
      STRIKE_LIFETIME_MIN_S +
      Math.random() * (STRIKE_LIFETIME_MAX_S - STRIKE_LIFETIME_MIN_S);
    const nextBirth = birthOffset;
    const geometry = new LightningStrike({
      sourceOffset: this.randomSurfacePoint(radius),
      destOffset: this.randomOuterPoint(radius),
      radius0: radius * STRIKE_RADIUS0_FRAC,
      radius1: radius * STRIKE_RADIUS1_FRAC,
      birthTime: nextBirth,
      deathTime: nextBirth + lifetime,
      isEternal: false,
      ramification: 5,
      recursionProbability: 0.6,
      maxIterations: 5,
      roughness: 0.9,
      straightness: 0.6,
      propagationTimeFactor: 0.1,
      vanishingTimeFactor: 0.9,
    });
    // Cast: vendored LightningStrike extends BufferGeometry at runtime;
    // our .d.ts declares it as a plain class so tsc does not auto-
    // promote the type. The Mesh constructor requires a BufferGeometry.
    const mesh = new Mesh(geometry as unknown as BufferGeometry, this.material);
    mesh.frustumCulled = false;
    return { geometry, mesh, nextBirth, lifetime };
  }

  /**
   * Set the viewport resolution in pixels. No-op kept for API compat with
   * `ExtrudingBolt` — `game.ts` calls this on construction AND on canvas
   * resize. LightningStrike does not need it.
   */
  setResolution(width: number, height: number): void {
    void width;
    void height;
  }

  /**
   * Add the bolt to a scene. Idempotent.
   */
  attach(scene: { add: (obj: Mesh) => void }): void {
    if (this.attached) return;
    scene.add(this.mesh);
    this.attached = true;
  }

  /**
   * Remove the bolt from its scene. Idempotent.
   */
  detach(scene: { remove: (obj: Mesh) => void }): void {
    if (!this.attached) return;
    scene.remove(this.mesh);
    this.attached = false;
  }

  /**
   * Per-frame tick. `charge` is crystalCharge (0..1); `worldPos` is the
   * crystal's current world position (already includes shake); `radius`
   * is the crystal's visual radius; `seed` is a per-crystal seed so
   * adjacent crystals don't share strike patterns.
   */
  update(
    deltaTime: number,
    charge: number,
    worldPos: Vector2,
    radius: number,
    seed: number,
  ): void {
    void seed;
    this.currentTime += deltaTime;
    this.mesh.position.set(worldPos.x, worldPos.y, 0.1);
    // Recycle strikes whose lifetime has expired. Disposal + rebuild keeps
    // birthTime/deathTime clean and avoids the partial-refresh path through
    // `LightningStrike.copyParameters`.
    for (const s of this.strikes) {
      if (this.currentTime >= s.nextBirth + s.lifetime) {
        s.geometry.dispose();
        // Detach the old child mesh and replace with a fresh one.
        this.mesh.remove(s.mesh);
        const fresh = this.makeStrike(this.currentTime, radius);
        s.geometry = fresh.geometry;
        s.mesh = fresh.mesh;
        s.nextBirth = fresh.nextBirth;
        s.lifetime = fresh.lifetime;
        this.mesh.add(s.mesh);
      }
      // Re-sample source/dest each frame so the strike's origin point on
      // the crystal surface shifts slightly (read as "energy moving"
      // rather than "same bolt re-rendered"). LightningStrike stores
      // its parameters on `rayParameters`, NOT on the instance itself
      // (verified: vendored init() does `this.rayParameters = rayParameters`).
      s.geometry.rayParameters.sourceOffset.copy(this.randomSurfacePoint(radius));
      s.geometry.rayParameters.destOffset.copy(this.randomOuterPoint(radius));
      // LightningStrike.update(time) regenerates the fractal subdivision
      // using `noise4d(x, y, z, time)` — the time component is what makes
      // the geometry crackle frame-to-frame.
      s.geometry.update(this.currentTime);
    }
    // Drive opacity on the shared material so every strike fades together.
    // Phase 6d follow-up (round 2): the round-1 dial-down (peak 0.35,
    // 2 strikes) made the bolts so faint that the crystal's bloom-flash
    // completely washed them out — the user reported "no lightling effect,
    // just the blooming light flashes". Round 1 overshot; the bolts
    // needed to be brighter to compete with the crystal's emissive.
    //
    // New peak 0.50 (round 1 was 0.35, white-out fix was 0.55). 2 strikes
    // × 0.50 = 1.0 per channel peak — right at the saturation boundary
    // but not over it (no white-out). The fractional channel
    // overshoot doesn't matter because cyan (0x8cd0ff) is far from
    // pure white — channel peaks at 1.0 give a bright cyan, not white.
    //
    // Floor 0.18 (round 1 was 0.10): round 1's 0.10 floor made the bolts
    // almost invisible at the start of the burst window; the user sees
    // "lightning" only in the last 30% of the cycle. 0.18 keeps a
    // visible crackle throughout the window so the discharge reads
    // continuously, not as a final-frame pop.
    this.material.opacity = 0.18 + 0.32 * charge;
  }

  /**
   * Uniformly sample a point on a sphere of given radius (Marsaglia method).
   * Output is multiplied by `radius * 0.95` so the point sits just INSIDE
   * the crystal surface, giving the bolt a clear origin.
   */
  private randomSurfacePoint(radius: number): Vector3 {
    let x1: number;
    let x2: number;
    let s: number;
    do {
      x1 = Math.random() * 2 - 1;
      x2 = Math.random() * 2 - 1;
      s = x1 * x1 + x2 * x2;
    } while (s >= 1 || s === 0);
    const factor = 2 * Math.sqrt(1 - s);
    return new Vector3(
      x1 * factor * radius * 0.95,
      x2 * factor * radius * 0.95,
      (1 - 2 * s) * radius * 0.95,
    );
  }

  /**
   * Sample a point in the space OUTSIDE the crystal surface — used as the
   * strike's destination so the bolt visibly extends beyond the body.
   * Phase 6d follow-up: was 1.5..2.5 crystal-radii (bolts reaching far
   * into the background). User feedback said the bolts were "too big";
   * narrowed to 1.0..1.4 so the strikes stay close to the crystal, reading
   * as surface discharge rather than long arcs to the background.
   */
  private randomOuterPoint(radius: number): Vector3 {
    const surface = this.randomSurfacePoint(radius);
    const extension = 1.0 + Math.random() * 0.4;
    return surface.multiplyScalar(extension / 0.95);
  }

  /**
   * Release GPU resources. Also detaches every strike child mesh from the
   * parent and clears the strikes array — this prevents stale geometry
   * references from lingering if `this.mesh` is ever re-added to a scene
   * after dispose (defensive: current game.ts callers always detach before
   * disposing, but a stale child mesh with a disposed material could draw
   * as a "ghost mark" if the parent re-entered the scene graph).
   */
  dispose(): void {
    for (const s of this.strikes) {
      // Remove the strike's Mesh from the parent before disposing its
      // geometry, so the child slot is truly empty.
      this.mesh.remove(s.mesh);
      s.geometry.dispose();
    }
    this.strikes.length = 0;
    this.material.dispose();
  }
}

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
 *           in the vertex shader, where charge² is read from the per-vertex
 *           `aChargeSq` attribute (baked at birth, frozen until the particle
 *           is recycled). The fade opacity is a separate `aAlpha` attribute
 *           driven by `update()` each frame; the two channels no longer share
 *           storage. Distance scaling via standard perspective-projection
 *           trick.
 */
export class CrystalBoltSparks {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly alphas: Float32Array;       // fade opacity, written by update() each frame
  private readonly chargeSqs: Float32Array;    // charge^2 baked at birth, frozen until recycled
  private nextIndex = 0;

  constructor(seed: number) {
    void seed;
    this.positions = new Float32Array(SPARK_POOL_SIZE * 3);
    this.velocities = new Float32Array(SPARK_POOL_SIZE * 3);
    this.ages = new Float32Array(SPARK_POOL_SIZE).fill(SPARK_LIFETIME_SECONDS);
    this.alphas = new Float32Array(SPARK_POOL_SIZE);
    this.chargeSqs = new Float32Array(SPARK_POOL_SIZE);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1));
    geometry.setAttribute('aChargeSq', new BufferAttribute(this.chargeSqs, 1));
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
        attribute float aChargeSq;
        varying float vAlpha;
        uniform float uSize;
        uniform float uChargeSizeMul;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float sizeMul = 1.0 + uChargeSizeMul * aChargeSq;
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
      // aAlpha carries the fade opacity (1.0 at birth; update() drives it down).
      // aChargeSq carries the squared charge the particle was born with; the
      // vertex shader reads it directly for sprite-size scaling so the size
      // stays correct across the full lifetime instead of decaying with the
      // fade channel.
      this.alphas[i] = 1.0;
      this.chargeSqs[i] = charge * charge;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aChargeSq') as BufferAttribute).needsUpdate = true;
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
        this.chargeSqs[i] = 0;
        alphaDirty = true;
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * deltaTime;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * deltaTime;
      const lifeFrac = this.ages[i] / SPARK_LIFETIME_SECONDS;
      // Slight ease-out fade; aChargeSq is frozen at birth so size stays correct.
      this.alphas[i] = (1 - lifeFrac) * (1 - lifeFrac);
      alphaDirty = true;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    if (alphaDirty) {
      (this.points.geometry.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true;
      (this.points.geometry.getAttribute('aChargeSq') as BufferAttribute).needsUpdate = true;
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

/**
 * Build a LineSegments telegraph showing the predicted shard travel
 * directions. Each pair of points draws a thin cyan line. Caller is
 * responsible for adding it to the scene and removing it 0.15s later.
 */
export function createBurstTelegraph(position: Vector2, angles: readonly number[]): LineSegments {
  const length = 4.0;
  const positions = new Float32Array(angles.length * 6);
  for (let i = 0; i < angles.length; i += 1) {
    const angle = angles[i];
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const base = i * 6;
    positions[base] = position.x;
    positions[base + 1] = position.y;
    positions[base + 2] = 0;
    positions[base + 3] = position.x + dx;
    positions[base + 4] = position.y + dy;
    positions[base + 5] = 0;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: 0x88ffff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  return new LineSegments(geometry, material);
}

/**
 * Is the CLUTCH bonus applicable? Returns true if the kill landed within the
 * CLUTCH_WINDOW_SECONDS (0.5s) window before the crystal's next burst would
 * have fired AND the kill happened in the ULTRA_CLEAN window (fractured).
 */
export function isClutchApplicable(elapsed: number, timeToNextBurst: number): boolean {
  return (
    elapsed > 0 &&
    elapsed < ULTRA_CLEAN_WINDOW_SECONDS &&
    timeToNextBurst < CLUTCH_WINDOW_SECONDS
  );
}

/**
 * Is the PERFECT bonus applicable? PERFECT fires when the player absorbed
 * zero shards during the crystal's lifetime. Pre-fracture kills qualify by
 * definition (no shards were ever released).
 */
export function isPerfectApplicable(shardsAbsorbed: number): boolean {
  return shardsAbsorbed === 0;
}
