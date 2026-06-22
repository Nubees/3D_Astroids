import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  LinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';
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
// My Rules — Crystal FX (Phase 6b Fracture Burst Cascade)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure helpers for the crystal-cascade feature — scheduler cadence,
//          crack-texture generator, crack-pulse curve, telegraph lines, and
//          score-tier classification. These are testable in isolation from
//          Three.js meshes; game.ts owns the live scene graph.
// Setup: Imported by src/game.ts and tests/shard-burst.test.ts.
// Issues: Score tiers + CLUTCH/PERFECT bonuses were originally scattered across
//         inline game.ts branches; testing required a full Game fixture.
// Fix:   Move the deterministic math into pure functions. The scheduler is a
//        class only because it carries mutable state across frames; everything
//        else is a top-level function.
// Gotchas:
//  - CrystalFractureScheduler.update(now) caps `burstsToFire.length` at 1 per
//    call to defend against tab-unfocus spikes where `now` jumps multiple
//    intervals in one frame (2nd-pass Risk 1 fix).
//  - getCrackPulse is driven by timeToNextBurst (NOT a free-running sine) so
//    the crack visibly intensifies as the next burst approaches — fixes the
//    2nd-pass MEDIUM #12 "pulse 2Hz too fast" finding.
//  - createBurstTelegraph returns a LineSegments mesh with thin cyan lines at
//    25% opacity along the predicted shard travel directions. The Game is
//    responsible for adding it to the scene and removing it 0.15s later.
//  - computeTimeBonusTier classifies a kill by `elapsed` (game-time since
//    fracture) into one of four tiers. Boundary tests use strict < and ≤ so
//    boundary conditions (3.99s, 4.01s) get distinct tiers.
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
    return { bonus: 100, text: '+100 CLEAN KILL', color: '#66ddee' };
  }
  if (elapsed < ULTRA_CLEAN_WINDOW_SECONDS) {
    return { bonus: 75, text: '+75 ULTRA CLEAN', color: '#ffdd44' };
  }
  if (elapsed < SATURATION_DURATION_SECONDS) {
    return { bonus: 25, text: null, color: '#4488aa' };
  }
  return { bonus: 10, text: '+10 SURVIVOR', color: '#888888' };
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
 * Crack pulse intensity in [0.3, 1.0]. 0.3 right after a burst fires (full
 * interval remaining), 1.0 just before the next burst fires (no time left).
 * Drives the cracked crystal's emissiveIntensity so it visibly intensifies as
 * the cascade approaches.
 */
export function getCrackPulse(timeToNextBurst: number): number {
  const t = 1 - Math.max(0, Math.min(1, timeToNextBurst / BURST_INTERVAL_SECONDS));
  return 0.3 + 0.7 * t * t;
}

/**
 * Flash intensity in [0, 1] over a 0.15s window after a burst fires. Peaks at
 * 1.0 at t=0.075s, returns to 0 at t=0.15s. Used to spike
 * emissiveIntensity on top of the crack pulse for the per-burst flash frame.
 *
 * Formula: sin(π * t / 0.15). Replaces the 2nd-pass bug `2.5*sin(t*π)` which
 * peaks at t=0.5s and never reaches peak in a 0.15s window.
 */
export function getBurstFlash(t: number): number {
  return Math.sin((Math.PI * t) / TELEGRAPH_DURATION_SECONDS);
}

/**
 * Draw 8 random crack polylines on a dark cyan base into the given 2D context.
 * Uses a `mulberry32` seeded RNG so the same crystal id always produces the
 * same crack pattern. Pure function — no Three.js types involved — so it can
 * be unit-tested with any 2D context (canvas, mock, or jsdom stub).
 */
export function drawCrackedCrystalPattern(ctx: CanvasRenderingContext2D, seed: number): void {
  // Dark cyan base.
  ctx.fillStyle = '#224455';
  ctx.fillRect(0, 0, 256, 256);

  // 8 random crack polylines seeded by `seed`.
  const rng = mulberry32(seed);
  ctx.strokeStyle = 'rgba(120, 240, 255, 0.85)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    let x = rng() * 256;
    let y = rng() * 256;
    ctx.moveTo(x, y);
    const segments = 4 + Math.floor(rng() * 4);
    for (let s = 0; s < segments; s += 1) {
      x += (rng() - 0.5) * 80;
      y += (rng() - 0.5) * 80;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/**
 * Generate a 256×256 cracked-crystal CanvasTexture for the cracked material.
 * Wraps drawCrackedCrystalPattern with a Three.js CanvasTexture.
 */
export function makeCrackedCrystalTexture(seed: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Crystal FX: failed to acquire 2D context for cracked texture');
  }
  drawCrackedCrystalPattern(ctx, seed);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
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
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: 0x88ffff,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  return new LineSegments(geometry, material);
}

/**
 * Build a cracked MeshStandardMaterial for the crystal. Caller is responsible
 * for disposing the texture when the crystal is disposed.
 */
export function createCrackedMaterial(texture: CanvasTexture): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: 0x224455,
    emissive: 0x55ccdd,
    emissiveMap: texture,
    emissiveIntensity: 1.0,
    flatShading: true,
    transparent: true,
    opacity: 1.0,
    metalness: 0,
    roughness: 0.4,
    envMapIntensity: 0,
  });
}

/**
 * Mulberry32 seeded RNG. Produces deterministic floats in [0, 1) so the
 * same crystal seed always generates the same crack pattern.
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
