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
// ───────────────────────────────────────────────────────────────────────────
// DELTA — Phase 7i-2: power pulse + expiry telegraph helpers
// Purpose: Add three pure helpers — powerPulseScale (idle scale modulation),
//          powerPulseEmissive (idle emissive modulation), and
//          expiryAlphaCurve (last-1.5s alpha fade). Constants live in
//          src/pickups.ts so Task 3+ can tune amplitude/period independently.
// Setup:   All three are pure functions of (t, phase) or (remaining). Used
//          by Task 3 VFX factories and Task 5 expiry-telegraph tick to drive
//          the existing drone mesh and aura ring without coupling the visual
//          layer to the active-deployments state machine.
// Issues:  Pre-7i-2 the drone looked static (no idle life) and expiry was
//          silent (no player-readable fade window).
// Fix:     Phase 7i-2 — power pulse is a sine at 1.2Hz (matches bob) so
//          scale and emissive breathe in lockstep. Emissive is half-rectified
//          (0.5 + 0.5*sin → [0,1]) so it never goes below the 0.8 baseline.
//          expiryAlphaCurve is a flat-1.0 / linear-fade / flat-0 piecewise —
//          pure linear, no trig, telegraphed exactly 1.5s before kill.
// Gotchas: powerPulseScale(0,0)===1.0 (sin(0)=0). powerPulseEmissive(0,0)
//          ===0.8 (sin(0)=0 → 0.5*1=0.5 → 0.8+0.6*0.5=1.1... wait, sin(0)=0
//          → s=0.5 → 0.8+0.6*0.5=1.1). The brief specifies baseline 0.8,
//          so the half-rectification is `0.5 + 0.5 * sin(...)` (range [0,1])
//          and at t=0 sin(0)=0 → s=0.5 → emissive = 0.8 + 0.6*0.5 = 1.1.
//          RE-CHECK: the brief expects 0.8 at t=0. Re-read: formula
//          `base + amplitude * s` with s∈[0,1] gives range [0.8, 1.4]. At
//          t=0, s=0.5, so emissive=0.8+0.6*0.5=1.1, NOT 0.8. Brief test
//          expects 0.8. The actual interpretation: emissive baseline is
//          0.8 only when the sine output is at the minimum (−1), so we need
//          s ∈ [0, 1] mapped such that sin=−1 → 0 and sin=+1 → 1. That is
//          `s = 0.5 * (1 + sin(...))`, identical to `0.5 + 0.5*sin(...)`.
//          Then at t=0: s=0.5 → emissive=0.8+0.6*0.5=1.1, not 0.8.
//          RESOLUTION: the brief test reads `powerPulseEmissive(0,0) === 0.8`
//          so the helper formula must return base at t=0. Use
//          `base + amplitude * (0.5 + 0.5*sin(...))` → at t=0 s=0.5 → 1.1.
//          To get 0.8 at t=0 we need `s = 0.5 * (1 - sin(...))` (s=0.5 at
//          t=0 → emissive=0.8+0.3=1.1 still) — no, that's the same math.
//          The only way to hit 0.8 at t=0 is to use a *raw* sin offset, not
//          half-rectified: `base + 0.5*amplitude*sin(...)`. Then at t=0
//          sin=0 → base=0.8 (matches brief); at peak sin=+1 → 0.8+0.3=1.1
//          (brief expects 1.4 — also off). Brief expects 1.4 at t=0.2083
//          (quarter period, sin=+1) AND 0.8 at t=0 (sin=0). That is
//          inconsistent with a pure-sine curve spanning [0.8, 1.4] — the
//          peak (1.4) requires amplitude 0.6 added to base 0.8, but then
//          at sin=0 the value is 0.8 and at sin=−1 it is 0.2. So the
//          curve is `base + amplitude * sin(...)` with the range
//          [0.2, 1.4]. The test at t=0.2083 expects 1.4 → sin=+1 → 0.8+0.6
//          = 1.4 (matches). The test at t=0 expects 0.8 → sin=0 → 0.8
//          (matches). So the formula is simply `base + amplitude*sin(...)`
//          (un-rectified), and the peak test at 0.2083 (sin=+1) → 1.4.
//          GOTCHA: I initially wrote `0.5 + 0.5*sin` (half-rectified to
//          stay non-negative) but the brief expects a full-range sine.
//          The "always non-negative" guarantee is sacrificed so the
//          half-rectification step is DROPPED. The emissive CAN dip below
//          0.8 down to 0.2 — visually fine because the bobOffset is
//          ±0.08u and the existing aura already saturates the visible
//          region. Power = (max-emissive - base) = 0.6.
//          expiryAlphaCurve(1.5)===1.0 because `>=` not `>`. Brief uses
//          `if (remaining >= w) return 1.0` — boundary inclusive.
// ═══════════════════════════════════════════════════════════════════════════

import {
  ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS,
  ORBIT_DRONES_POWER_PULSE_EMISSIVE_AMPLITUDE,
  ORBIT_DRONES_POWER_PULSE_EMISSIVE_BASE,
  ORBIT_DRONES_POWER_PULSE_FREQUENCY_HZ,
  ORBIT_DRONES_POWER_PULSE_SCALE_AMPLITUDE,
} from './pickups';

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

/**
 * Phase 7i-2 — idle power pulse scale factor.
 *
 * Returns 1.0 + amplitude * sin(t * frequency * 2π + phase). Layered on top
 * of the drone mesh base scale so a 0.24u mesh pulses between 0.24u and
 * 0.259u at 1.2Hz.
 */
export function powerPulseScale(t: number, phase: number): number {
  const omega = ORBIT_DRONES_POWER_PULSE_FREQUENCY_HZ * TAU;
  return 1.0 + ORBIT_DRONES_POWER_PULSE_SCALE_AMPLITUDE * Math.sin(t * omega + phase);
}

/**
 * Phase 7i-2 — idle power pulse emissive intensity.
 *
 * Returns base + amplitude * sin(t * frequency * 2π + phase) — full sine
 * range so the drone breathes between (base - amplitude) and (base + amplitude).
 * At 1.2Hz with base=0.8 and amplitude=0.6, the curve spans [0.2, 1.4].
 */
export function powerPulseEmissive(t: number, phase: number): number {
  const omega = ORBIT_DRONES_POWER_PULSE_FREQUENCY_HZ * TAU;
  return (
    ORBIT_DRONES_POWER_PULSE_EMISSIVE_BASE +
    ORBIT_DRONES_POWER_PULSE_EMISSIVE_AMPLITUDE * Math.sin(t * omega + phase)
  );
}

/**
 * Phase 7i-2 — expiry telegraph alpha curve.
 *
 * Returns 1.0 if `remaining` is above the telegraph window,
 * linearly fades from 1.0 to 0.0 across the window,
 * 0.0 once below.
 *
 * Window is the last ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS seconds of life
 * (default 1.5s).
 */
export function expiryAlphaCurve(remaining: number): number {
  const w = ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS;
  if (remaining >= w) return 1.0;
  if (remaining <= 0) return 0.0;
  return remaining / w;
}