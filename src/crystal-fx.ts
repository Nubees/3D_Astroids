import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  MeshStandardMaterial,
  Points,
  ShaderMaterial,
} from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
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
// My Rules — Crystal FX (Phase 6c3 — Extruding Lightning)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure helpers + scene classes for the crystal-fracture effect.
//          The visual story is "the crystal is overloaded and discharging"
//          (charge-driven pulse, scale breathe, extruding lightning bolts,
//          per-crystal spark particles). The cracked-vein texture, the
//          halo-style ElectricityArc (Phase 6c2), and the scene-wide
//          SparkParticles pool have all been removed/replaced — see git
//          history if you need to resurrect any of them.
// Setup:   Imported by src/game.ts and tests/shard-burst.test.ts.
// Issues:  Phase 6c2's ElectricityArc drew bolts BETWEEN two random surface
//          points, which read as "halo decoration" rather than "lightning
//          coming out" — the player didn't connect the visual to "about to
//          burst" (the cue is energy leaving the crystal, not circling it).
// Fix:     Phase 6c3's ExtrudingBolt starts each bolt at a point on the
//          crystal surface (radius * 0.95) and extrudes it OUTWARD 1.5–2.5
//          crystal-radii along a perturbed radial direction. The reading is
//          "Tesla coil" / "plasma globe" — energy leaving the surface, not
//          circling it. 5 bolts × 8–10 segments each, regenerated every
//          60ms. Per-vertex color = white-hot tint × (0.6 + 0.8·charge²).
// Gotchas:
//  - crystalCharge uses timeToNextBurst (NOT a free-running sine) so the
//    pulse visibly intensifies as the next burst approaches — same shape as
//    the old getCrackPulse (0.3 → 1.0) but with a steeper t³ so the visual
//    is more dramatic at the end.
//  - ExtrudingBolt pre-allocates the largest-possible position/color
//    buffers (BOLTS_PER_CRYSTAL × (BOLT_SEGMENT_MAX + 1) vertices) and
//    rewrites them in place on every regenerate(). This avoids per-frame
//    Float32Array allocation and keeps the per-crystal alloc count at 1.
//  - SparkParticles is a scene-wide Points pool: one geometry, one material,
//    one draw call for the whole game regardless of how many crystals are
//    fractured. The pool size is 120; when full, oldest particles recycle.
//    (Phase 6c3 plan will scope sparks per-crystal in a later task; this
//    file still ships the scene-wide pool until then.)
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
 * Spark pool size. Shared across all fractured crystals; when full, the
 * oldest particle is recycled. 120 is the worst-case budget (4 crystals
 * fractured at once × 30 active particles each); most gameplay sees 1-2
 * crystals fractured, so the pool is rarely near-full.
 */
const SPARK_POOL_SIZE = 120;

/**
 * Per-particle lifetime in seconds. 0.6s gives a spark enough time to drift
 * outward and fade without lingering in the air after the burst.
 */
const SPARK_LIFETIME_SECONDS = 0.6;

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
 * Build the bright cyan MeshStandardMaterial used for fractured crystals.
 * Replaces the previous cracked-vein material. The Game drives the
 * emissiveIntensity from crystalCharge + getBurstFlash each frame.
 *
 * Phase 6c follow-up: emissiveIntensity dropped 0.5 → 0.25 AND emissive
 * color shifted from saturated cyan (#22f0ff = 0.13, 0.94, 1.0) to a
 * darker cyan (#0e8fa0 = 0.055, 0.56, 0.63). The two brightest channels
 * were both > 0.9, which crossed UnrealBloomPass's threshold (0.15) by a
 * wide margin and produced a white-out halo that swallowed the yellow
 * arcs. Halving intensity + darkening the color keeps the crystal visibly
 * glowing but drops both peak channels below 0.45 so the bloom kernel
 * only catches the brightest moments (pre-burst spikes + arc flash frames).
 *
 * `transparent: true` is set at creation so the death tween's opacity
 * fade actually works — setting it at runtime forces a shader recompile
 * that produced ghost marks on the inner mesh (Phase 6c follow-up bug:
 * user reported "marks that don't disappear" after destruction).
 *
 * The electricity arcs and sparks carry the actual color now — the crystal
 * is the "power source" silhouette, not the "glow centerpiece."
 */
export function createFracturedMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0x88e6ff,
    emissive: 0x0e8fa0,
    emissiveIntensity: 0.25,
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

/**
 * Scene-wide spark particle pool. One Points geometry, one PointsMaterial,
 * one draw call for the entire game. Crystals emit sparks into the pool
 * each frame at a rate proportional to crystalCharge²; particles drift
 * outward, fade, and recycle when their lifetime ends.
 *
 * Setup:    `Game` constructs one SparkParticles and adds it to the scene
 *           at startup. Each frame, for each fractured crystal, call
 *           `sparks.emit(crystalCharge, worldPos, radius, seed, deltaTime)`.
 *           Call `sparks.update(deltaTime)` once per frame regardless of
 *           whether any crystals are fractured.
 * Issues:   Per-crystal particle pools (one Points per crystal) would mean
 *           N draw calls for N crystals and would scale poorly when the
 *           burst cascade fires 4 crystals at once.
 * Fix:      Single scene-wide pool of SPARK_POOL_SIZE particles. Emission
 *           is keyed on crystalCharge², so the back half of the burst
 *           window sees the most sparks and the front half sees almost
 *           none. Particles drift radially outward at 1.5–3.0 units/s,
 *           gravity-free, with additive blending so they read as
 *           electricity rather than dust.
 * Gotchas:  The position/velocity/age arrays are preallocated. Writing to
 *           index `i` while another frame reads from index `j` is safe
 *           because each particle owns one slot for its entire lifetime.
 *           The `nextIndex` cursor wraps at SPARK_POOL_SIZE so the pool
 *           is strictly bounded; older particles are overwritten when the
 *           pool is full.
 */
export class SparkParticles {
  readonly points: Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly ages: Float32Array;
  private readonly alphas: Float32Array;
  private nextIndex = 0;

  constructor() {
    this.positions = new Float32Array(SPARK_POOL_SIZE * 3);
    this.velocities = new Float32Array(SPARK_POOL_SIZE * 3);
    this.ages = new Float32Array(SPARK_POOL_SIZE).fill(SPARK_LIFETIME_SECONDS);
    this.alphas = new Float32Array(SPARK_POOL_SIZE);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    // Per-particle alpha attribute drives the fade in the custom shader below.
    // Stock PointsMaterial has a single shared opacity, so we use a small
    // ShaderMaterial that reads per-vertex alpha and fades each particle
    // independently over its lifetime.
    geometry.setAttribute('aAlpha', new BufferAttribute(this.alphas, 1));
    const material = new ShaderMaterial({
      uniforms: {
        // Phase 6c follow-up: uColor was cyan (0.6, 0.97, 1.0) which read as
        // "more of the same glow" rather than yellow discharge particles.
        // Now matches ARC_COLOR_R/G/B so arcs + sparks read as one cohesive
        // electric event.
        uColor: { value: { x: SPARK_COLOR_R, y: SPARK_COLOR_G, z: SPARK_COLOR_B } },
        // Phase 6c follow-up: bumped 9.0 → 14.0 so the sparks are clearly
        // visible as discrete dots rather than single-pixel stars lost in the
        // cyan bloom. Combined with the yellow color fix this is what makes
        // the "electricity flashing outward" cue actually land.
        uSize: { value: 14.0 * (typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1) },
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uSize;
        void main() {
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          // Circular falloff so each spark reads as a glowing dot, not a square.
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
    // Init particles to a far-away position so they don't render at origin
    // when the pool is empty.
    for (let i = 0; i < SPARK_POOL_SIZE; i += 1) {
      this.positions[i * 3] = 9999;
      this.positions[i * 3 + 1] = 9999;
      this.positions[i * 3 + 2] = 0;
    }
  }

  /**
   * Emit sparks for one crystal this frame. `charge` is the crystalCharge
   * curve (0..1); emission rate is `max(8, charge^2 * 140)` particles/sec
   * (Phase 6c follow-up: was `charge^2 * 80` — too sparse to see), capped
   * at 12 per frame per crystal to prevent single-frame spikes.
   *
   * The `max(8, ...)` floor guarantees at least ~8 sparks/sec (≈ 1 every
   * other frame at 60fps) even at very low charge, so the player sees a
   * continuous "fizz" off the crystal instead of nothing-then-burst.
   */
  emit(charge: number, worldPos: Vector2, radius: number, seed: number, deltaTime: number): void {
    if (charge <= 0) return;
    const rate = Math.max(8, charge * charge * 140);
    const count = Math.min(12, Math.floor(rate * deltaTime + Math.random()));
    if (count === 0) return;
    const rng = mulberry32(seed * 31 + Math.floor(performance.now() * 1000));
    for (let n = 0; n < count; n += 1) {
      const i = this.nextIndex;
      this.nextIndex = (this.nextIndex + 1) % SPARK_POOL_SIZE;
      const dir = sampleUnitVector(rng);
      // Phase 6c follow-up: was 1.5–3.0 units/s — sparks barely moved before
      // their 0.6s lifetime ended. Bumped to 3.0–6.0 so they actually travel
      // 1.8–3.6 units of distance (= roughly 1–2 crystal radii) before
      // fading, reading as "sparks shooting outward" rather than "sparks
      // winking in place".
      const speed = 3.0 + rng() * 3.0;
      this.positions[i * 3] = worldPos.x + dir.x * radius * 0.8;
      this.positions[i * 3 + 1] = worldPos.y + dir.y * radius * 0.8;
      this.positions[i * 3 + 2] = 0.1;
      this.velocities[i * 3] = dir.x * speed;
      this.velocities[i * 3 + 1] = dir.y * speed;
      this.velocities[i * 3 + 2] = 0;
      this.ages[i] = 0;
      this.alphas[i] = 0.7 + rng() * 0.3;
    }
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('aAlpha') as BufferAttribute).needsUpdate = true;
  }

  /**
   * Tick the pool: advance positions, age out dead particles, and recompute
   * per-particle alpha so the custom shader can fade each one independently.
   * Called once per frame regardless of how many crystals are emitting.
   */
  update(deltaTime: number): void {
    let alphaDirty = false;
    for (let i = 0; i < SPARK_POOL_SIZE; i += 1) {
      this.ages[i] += deltaTime;
      if (this.ages[i] >= SPARK_LIFETIME_SECONDS) {
        // Park the particle off-screen so it doesn't render at its last
        // position with a stale alpha.
        this.positions[i * 3] = 9999;
        this.positions[i * 3 + 1] = 9999;
        this.positions[i * 3 + 2] = 0;
        this.alphas[i] = 0;
        alphaDirty = true;
        continue;
      }
      this.positions[i * 3] += this.velocities[i * 3] * deltaTime;
      this.positions[i * 3 + 1] += this.velocities[i * 3 + 1] * deltaTime;
      // Linear fade: alpha = 1 at birth, 0 at expiry. The custom shader
      // multiplies this by the radial glow falloff so each spark is a
      // bright center fading to a soft edge.
      const lifeFrac = this.ages[i] / SPARK_LIFETIME_SECONDS;
      // Slight ease-out so the particle looks "punchy" at birth then fades
      // smoothly to nothing.
      this.alphas[i] = (1 - lifeFrac) * (1 - lifeFrac);
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

// ═══════════════════════════════════════════════════════════════════════════
// Vector helpers for the arc geometry (kept local to avoid cluttering
// src/utils with single-file math).
// ═══════════════════════════════════════════════════════════════════════════

function sampleUnitVector(rng: () => number): { x: number; y: number; z: number } {
  // Marsaglia method: pick (x, y) uniformly in the unit disk, then project.
  let x1: number;
  let x2: number;
  let s: number;
  do {
    x1 = rng() * 2 - 1;
    x2 = rng() * 2 - 1;
    s = x1 * x1 + x2 * x2;
  } while (s >= 1 || s === 0);
  const factor = 2 * Math.sqrt(1 - s);
  return { x: x1 * factor, y: x2 * factor, z: 1 - 2 * s };
}

function scaleVec(v: { x: number; y: number; z: number }, s: number): { x: number; y: number; z: number } {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function lerpVec(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

function addVec(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Mulberry32 seeded RNG. Produces deterministic floats in [0, 1) so the
 * same crystal seed always generates the same arc pattern and spark
 * distribution (per emit frame — `Math.random` in `emit()` is intentional
 * for inter-frame variety on the same crystal).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
 *
 * ── My Rules ──
 * Purpose: Pure helper that lets ExtrudingBolt (Task 3) wrap a jagged,
 *   white-hot polyline in a Line2 mesh without pulling WebGL/Three.js
 *   into the unit tests. Determinism matters because the same crystal
 *   seed must always produce the same bolt shape.
 * Setup:  Reuses `mulberry32`, `sampleUnitVector`, `scaleVec`, `addVec`,
 *   `lerpVec`, and the new `normalize` helper from this file.
 * Issues: WebGL/Three.js types forced us to keep the geometry math in
 *   a separate file or to mock Three.js in vitest.
 * Fix:    Made the function pure — returns Float32Arrays only, no Mesh,
 *   so vitest can call it directly without a WebGL context.
 * Gotchas:
 *   - The end direction is `normalize(startDir + 0.3*jitter)`. If
 *     `startDir` and `jitter` happen to point exactly opposite each
 *     other the result is the zero vector; `normalize` returns the
 *     origin vector in that case, which then scales to (0,0,0). In
 *     practice this is vanishingly rare with mulberry32; if it ever
 *     becomes a problem, retry the jitter until dot(startDir,jitter)
 *     is non-negative.
 *   - Colors are baked at construction; runtime intensity must be
 *     applied by the caller (ExtrudingBolt), not here.
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
