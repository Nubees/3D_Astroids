// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Orbit Drone Pure State (Phase 7i)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure module owning the tier table (charges → drone count + color)
//          and the deterministic per-frame visual math (Y-bob amplitude,
//          Y/X spin accumulation, per-fire flash curve). No Three.js — this
//          is fully testable in Node.
// Setup:   Imported by src/active-deployments.ts (tick + spawn) and
//          src/orbit-drone-vfx.ts (visual factories). Game wires charges
//          on collect → tier is read at deploy time.
// Issues:  Pre-Phase 7i the drones had no per-frame animation. They moved
//          in a circle but never spun, bobbed, or flashed.
// Fix:     Phase 7i Sprint 1. The pure math here is the contract that the
//          VFX factories consume. Bob period = 1 / 1.2 Hz (~0.83s) →
//          2 cycles per second visible wobble. Spin axes Y (90°/s) + X
//          (60°/s) keep the jewel alive without distracting from the ship.
//          Fire flash decays linearly from 1.0 to 0 over 80ms — matches
//          the existing Vlambeer-style "scale pop" feel.
// Gotchas: bobOffset amplitude 0.08u is small enough not to disrupt the
//          orbit radius visual (1.5u). spinAngles returns RAD (Three.js
//          convention) so the VFX factory assigns directly to mesh.rotation.
//          fireFlashCurve is a piecewise linear ramp — easy to test, no
//          trig noise. The TIER_DRONE_COUNT table is keyed on the NUMBER
//          OF CHARGES the player had at deploy time (1/2/3), NOT on a
//          derived tier index — Sprint 3 will route charges → tier via the
//          Game class.
// ═══════════════════════════════════════════════════════════════════════════

const TAU = Math.PI * 2;
const BOB_AMPLITUDE = 0.08;
const BOB_FREQUENCY_HZ = 1.2;
const SPIN_Y_DEG_PER_SEC = 90;
const SPIN_X_DEG_PER_SEC = 60;
const FIRE_FLASH_DURATION_SECONDS = 0.08;

/**
 * Number of drones deployed for a given number of stacked charges. Indexed
 * by `charges` (1..3) at deploy time. Charge 1 = baseline (2 drones),
 * charge 3 = peak (4 drones).
 */
export function ORBIT_DRONES_TIER_DRONE_COUNT(charges: number): number {
  switch (charges) {
    case 1: return 2;
    case 2: return 3;
    case 3: return 4;
    default: return 2;
  }
}

/**
 * Tier color (hex int). Used by both the aura ring material and the drone
 * projectile class so the visual identity carries through.
 */
export function ORBIT_DRONES_TIER_COLOR(tier: 1 | 2 | 3): number {
  switch (tier) {
    case 1: return 0x66ddff; // cyan (current)
    case 2: return 0xff66dd; // magenta
    case 3: return 0xffcc44; // gold (shared with Magnet Booster — different slot OK)
    default: return 0x66ddff;
  }
}

/**
 * Y-axis bob offset for a drone at time `t` with unique phase offset. Pure
 * sine — deterministic at any `t`. Output range: [-0.08, +0.08].
 */
export function bobOffset(t: number, phase: number): number {
  return BOB_AMPLITUDE * Math.sin(t * BOB_FREQUENCY_HZ * TAU + phase);
}

/**
 * Per-fire scale/emissive flash curve. Returns 1.0 at the moment of fire,
 * ramps linearly to 0 over FIRE_FLASH_DURATION_SECONDS (80ms).
 */
export function fireFlashCurve(age: number): number {
  if (age < 0) return 0;
  if (age >= FIRE_FLASH_DURATION_SECONDS) return 0;
  return 1 - age / FIRE_FLASH_DURATION_SECONDS;
}

/**
 * Accumulated Y + X rotation angles (radians) for a drone after `t` seconds.
 * Y spins at 90°/s, X spins at 60°/s — independent axes so the jewel
 * tumbles naturally without looking like a parade formation.
 */
export function spinAngles(t: number): { x: number; y: number } {
  return {
    x: (SPIN_X_DEG_PER_SEC * Math.PI / 180) * t,
    y: (SPIN_Y_DEG_PER_SEC * Math.PI / 180) * t,
  };
}

export const ORBIT_DRONE_DEPLOY_LERP_DURATION_SECONDS = 0.5;
export const ORBIT_DRONE_DEPLOY_LERP_EASING = 'cubic-out' as const;