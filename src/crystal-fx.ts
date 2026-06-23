import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
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
// My Rules — Crystal FX (Phase 6e — Body Telegraph via onBeforeCompile)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure helpers + scene classes for the crystal-fracture effect.
//          The visual story is "the crystal is overloaded and discharging"
//          (charge-driven pulse, scale breathe, vendored fractal-branched
//          lightning strikes, body-emissive fresnel + color-shift telegraph,
//          per-crystal spark particles). The cracked-vein texture (Phase 6c1),
//          the halo-style ElectricityArc (Phase 6c2), and the Phase 6c3
//          ExtrudingBolt zigzag have all been removed/replaced — see git
//          history if you need to resurrect any of them.
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
//    an onBeforeCompile injection that adds a fresnel rim + 3-stage color
//    shift (cyan → white → red) to `totalEmissiveRadiance`. The Game drives
//    the uniforms via updateFracturedMaterialTelegraph (uTime, uCharge, and
//    uRimColor lerp from white → red as charge ramps). The shader bypass
//    is safe because it flows through the standard PBR tone-mapper; no new
//    AdditiveBlending is introduced, so the additive-blending white-out
//    path stays closed (yellow spark particles were the actual culprit, not
//    the body emissive — see `feedback_additive_blending_whiteout`).
//  - customProgramCacheKey returns 'crystal-fractured-telegraph-v1' so all
//    fractured crystals share one compiled shader program.
//  - The crystal body emissive at rest (charge=0) is identical to the
//    pre-Phase-6e look — the uCharge multiplier keeps the tint and rim at
//    zero contribution when not actively charging.
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
 *
 * Phase 6e — re-introduce the body emissive as a TELEGRAPH channel via
 * `onBeforeCompile` injection. The 6d follow-up (round 3) wrongly disabled
 * the body emissive thinking it was the bloom-mess offender; the user found
 * by elimination that the yellow spark PARTICLES were the actual culprit
 * (see `feedback_additive_blending_whiteout` and `project_phase_6d_vendored_lightning`).
 * The body emissive was innocent. Phase 6e re-enables it, but as a
 * shader-driven fresnel rim + 3-stage color shift (cyan → white → red)
 * rather than a raw emissiveIntensity ramp — same visual goal, but the
 * shader injection routes the glow through `totalEmissiveRadiance` so it
 * benefits from the standard PBR tone-mapper and never bypasses scene
 * exposure. NO new AdditiveBlending is introduced; the additive-blending
 * white-out path stays closed.
 *
 * The Game ticks the uniforms per-frame via `updateFracturedMaterialTelegraph`
 * using the same `crystalCharge(t)` curve that drives the bolt + breathe +
 * shake, so all four telegraph channels peak together at the pre-burst moment.
 *
 * `transparent: true` is kept at creation so the death tween's opacity
 * fade works without forcing a shader recompile at runtime.
 *
 * Gotchas:
 *  - `material.userData.uniforms` is the JS-side handle the Game mutates.
 *    The actual GPU uniforms are wired inside `onBeforeCompile` via
 *    `Object.assign(shader.uniforms, ...)` so Three.js picks them up.
 *  - `customProgramCacheKey` returns a stable string so all fractured
 *    crystals share one compiled shader program (no per-crystal recompile).
 *  - `timeAccum` lives on the same `userData`; the Game reads/writes it
 *    each frame to drive the pulse rhythm. It is wiped to `undefined`
 *    by `disposeAsteroidMesh` because the whole `userData` is dropped
 *    on material disposal.
 *  - `envMapIntensity: 0` is intentional — the scene has no envmap
 *    (`pmremGenerator` is not run), so the fresnel term would otherwise
 *    pick up a black envmap reflection and wash out the rim.
 */
export function createFracturedMaterial(): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
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

  // Uniforms live in userData so the Game can mutate `.value` each frame
  // without reaching into the private Three.js shader object.
  const uniforms = {
    uTime: { value: 0 },
    uCharge: { value: 0 },
    uRimColor: { value: new Color(1.0, 1.0, 1.0) },
    uRimPower: { value: 2.5 },
    uRimStrength: { value: 0.9 },
  };
  // We also stash the time accumulator here so the Game can advance it
  // without a per-crystal closure (the Game already iterates fractured
  // crystals and reads timeToNextBurst, so adding a uniform write here
  // keeps the per-frame work co-located).
  (material.userData as { uniforms: typeof uniforms; timeAccum?: number }).uniforms = uniforms;

  // Stable cache key → all fractured crystals share one compiled program.
  material.customProgramCacheKey = (): string => 'crystal-fractured-telegraph-v1';

  material.onBeforeCompile = (shader: {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  }): void => {
    // Inject the uniform refs so the GPU sees them (Three.js will set
    // the GPU uniform from each ref's .value every frame).
    Object.assign(shader.uniforms, uniforms);

    // ── Vertex: pass view-space normal + position to fragment ──
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vViewNormalCS;
         varying vec3 vViewPosCS;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
         vViewNormalCS = normalize(transformedNormal);
         vViewPosCS = -mvPosition.xyz;`,
      );

    // ── Fragment: add fresnel rim + 3-stage color shift to emissive ──
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uCharge;
         uniform vec3 uRimColor;
         uniform float uRimPower;
         uniform float uRimStrength;
         varying vec3 vViewNormalCS;
         varying vec3 vViewPosCS;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           // Three-stage base color shift: cyan → white → red.
           // 0x88e6ff = (0.533, 0.902, 1.0); warning red = (1.0, 0.18, 0.10).
           vec3 cCalm    = vec3(0.533, 0.902, 1.000);
           vec3 cNeutral = vec3(1.0, 1.0, 1.0);
           vec3 cDanger  = vec3(1.0, 0.18, 0.10);
           vec3 baseTint;
           if (uCharge < 0.5) {
             baseTint = mix(cCalm, cNeutral, uCharge * 2.0);
           } else {
             baseTint = mix(cNeutral, cDanger, (uCharge - 0.5) * 2.0);
           }
           // Subtle breathing of the base tint itself (4 Hz, 15% depth).
           // Independent of the rim heartbeat so the two layers don't lockstep.
           float baseBreath = 0.85 + 0.15 * sin(uTime * 4.0);
           // uCharge multiplier: resting state (charge=0) is identical to
           // the pre-Phase-6e look; the tint only kicks in while charging.
           totalEmissiveRadiance += baseTint * baseBreath * uCharge * 0.6;

           // Fresnel rim. Bright at grazing angles, dark facing camera.
           // Pulse rate accelerates 1.5 → 9 Hz as charge ramps.
           vec3 V = normalize(vViewPosCS);
           float ndv = clamp(dot(normalize(vViewNormalCS), V), 0.0, 1.0);
           float fres = pow(1.0 - ndv, uRimPower);
           float pulseRate = mix(1.5, 9.0, uCharge);
           float pulse = 0.5 + 0.5 * sin(uTime * pulseRate * 6.2831);
           // uCharge² ease-in: rim barely visible at charge=0, dominant
           // in the back half of the burst window.
           float rimAmp = uCharge * uCharge;
           totalEmissiveRadiance += uRimColor * fres * pulse * uRimStrength * rimAmp;
         }`,
      );
  };

  return material;
}

/**
 * Per-frame tick for the crystal body telegraph uniforms. Mutates the
 * `uTime`, `uCharge`, and `uRimColor` uniform refs that
 * `createFracturedMaterial` stashed in `material.userData.uniforms`.
 * No-op on a material that does not have the telegraph scaffolding
 * (safety: don't crash if someone passes a plain MeshStandardMaterial).
 *
 * The Game is responsible for advancing `timeAccum` on userData and
 * passing the new total as `uTime` here; we keep the time accounting
 * out of this helper so the function stays pure (same input → same
 * uniform writes, no state mutation beyond the supplied refs).
 */
export function updateFracturedMaterialTelegraph(
  fracturedMaterial: MeshStandardMaterial,
  uTime: number,
  uCharge: number,
): void {
  const userData = fracturedMaterial.userData as {
    uniforms?: {
      uTime: { value: number };
      uCharge: { value: number };
      uRimColor: { value: Color };
    };
  };
  const u = userData.uniforms;
  if (!u) return;
  u.uTime.value = uTime;
  u.uCharge.value = uCharge;
  // Rim color lerps from white (calm) → red (imminent). The G and B
  // channels drop as charge increases; R stays at 1.0 throughout so
  // the rim never goes black. G drops 0 → 0.82×charge (so at full
  // charge the G channel is 0.18, matching the base-tint danger red).
  const rim = u.uRimColor.value;
  rim.setRGB(1.0, 1.0 - uCharge * 0.82, 1.0 - uCharge * 0.9);
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
 * Strike radius range. Phase 6d follow-up (round 4 → round 5):
 * round 4 set thickness to 0.06/0.025 with the bloom-competition FX
 * disabled; the bolt was then clearly visible but the user reported
 * "make the lightling thicker still". Round 5 bumps to 0.085/0.04
 * (1.7× the round-4 trunk, 2× the original Phase 6d tuning) now
 * that scale breathe / position shake / yellow sparks are also
 * re-enabled (round 5) and the bolt needs to be the visually
 * dominant FX. Per-pixel brightness is unchanged (still peak 0.50,
 * then bumped to 0.65 in round 5), so the saturation math is:
 *   2 strikes × 0.65 opacity × cyan color ≈ 1.3 per channel peak
 *   — slightly over 1.0 (mild saturation, not white-out). The trunk
 *   tapers 0.085 → 0.04 so the strike still attenuates with
 *   distance, matching how a real arc thins as it leaves the
 *   surface.
 */
const STRIKE_RADIUS0_FRAC = 0.085;
const STRIKE_RADIUS1_FRAC = 0.04;

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
    // Phase 6d follow-up (round 5): peak 0.50 → 0.65, floor 0.18 → 0.22.
    // The user said "make the lightling ... brighter" with scale
    // breathe / position shake / yellow sparks re-enabled. With those
    // competing FX back in the visual budget, the bolt needs more
    // brightness to remain the dominant element.
    //
    // 2 strikes × 0.65 opacity = 1.3 per channel at peak — slightly
    // above saturation but on the cyan color (not near-white), so the
    // result is a bright cyan-white crackle, not a pure-white screen.
    // The over-saturation is acceptable because it makes the bolt
    // pop against the now-animated crystal body.
    //
    // Floor 0.22 (was 0.18) keeps a visible crackle throughout the
    // burst window; round-3's 0.18 was already a low floor and the
    // bolt reads as more "alive" with a stronger base presence.
    this.material.opacity = 0.22 + 0.43 * charge;
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
   * curve (0..1); emission rate is `max(8, charge^2 * 140)` particles/sec
   * multiplied by `rateScale` (default 1.0), capped at 8 per frame per
   * crystal.
   *
   * Phase 6c3 change: was scene-wide 120-pool; now per-crystal 40-pool.
   * Phase 6d round 5: added `rateScale` parameter so game.ts can dial
   * the spark rate down (e.g. to 0.65) when re-enabling sparks alongside
   * other competing FX. This avoids duplicating the rate math in
   * game.ts and keeps the spark rate formula in one place.
   */
  emit(charge: number, worldPos: Vector2, radius: number, deltaTime: number, rateScale = 1.0): void {
    if (charge <= 0) return;
    const rate = Math.max(8, charge * charge * 140) * rateScale;
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
