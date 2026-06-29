import { describe, expect, it } from 'vitest';
import {
  ORBIT_DRONES_TIER_DRONE_COUNT,
  ORBIT_DRONES_TIER_COLOR,
  bobOffset,
  fireFlashCurve,
  spinAngles,
} from '../src/orbit-drone';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Orbit Drone Pure State Tests (Phase 7i Sprint 1 Task 1)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the pure-math helpers in src/orbit-drone.ts. These
//          pin the public contract that Tasks 2, 3, and 5 will build on:
//          tier table (charges → drone count + color), Y-bob sine curve,
//          per-fire flash decay, and accumulated Y/X spin angles.
// Setup:   Module under test is pure (no Three.js, no I/O). All inputs are
//          deterministic scalars. Tests run in Node via vitest.
// Issues:  Pre-Phase 7i the drones had no per-frame animation. These tests
//          lock in the chosen amplitudes (BOB 0.08u @ 1.2 Hz), spin rates
//          (Y 90°/s, X 60°/s), and the 80ms linear fire-flash ramp.
// Gotchas: bobOffset at half-period returns 0, not -0.08, because the
//          underlying sin(π) = 0. The quarter-period assertion (+0.08) and
//          the three-quarter-period assertion (-0.08) cross-check the sine
//          polarity without an off-by-pi mistake.
// ═══════════════════════════════════════════════════════════════════════════

describe('ORBIT_DRONES_TIER_DRONE_COUNT', () => {
  it('returns 2 drones for charges=1', () => {
    expect(ORBIT_DRONES_TIER_DRONE_COUNT(1)).toBe(2);
  });
  it('returns 3 drones for charges=2', () => {
    expect(ORBIT_DRONES_TIER_DRONE_COUNT(2)).toBe(3);
  });
  it('returns 4 drones for charges=3', () => {
    expect(ORBIT_DRONES_TIER_DRONE_COUNT(3)).toBe(4);
  });
});

describe('ORBIT_DRONES_TIER_COLOR', () => {
  it('returns 0x66ddff for tier=1', () => {
    expect(ORBIT_DRONES_TIER_COLOR(1)).toBe(0x66ddff);
  });
  it('returns 0xff66dd for tier=2', () => {
    expect(ORBIT_DRONES_TIER_COLOR(2)).toBe(0xff66dd);
  });
  it('returns 0xffcc44 for tier=3', () => {
    expect(ORBIT_DRONES_TIER_COLOR(3)).toBe(0xffcc44);
  });
});

describe('bobOffset', () => {
  it('returns 0 at t=0 with phase=0', () => {
    expect(bobOffset(0, 0)).toBeCloseTo(0, 5);
  });
  it('returns 0.08 at t such that sin(...)=1 (1/4 period)', () => {
    // period = 1/1.2 Hz = 0.833s; quarter period = 0.2083s
    // bobOffset(t,0) = 0.08 * sin(t * 1.2 * TAU + 0)
    // At t = 0.2083, sin(0.2083 * 1.2 * 2π) = sin(π/2) = 1 → 0.08
    expect(bobOffset(1 / 1.2 / 4, 0)).toBeCloseTo(0.08, 5);
  });
  it('returns 0 at full period (1/1.2)', () => {
    // sin(2π) = 0
    expect(bobOffset(1 / 1.2, 0)).toBeCloseTo(0, 5);
  });
  it('returns 0 at half-period (1/1.2/2)', () => {
    // sin(π) = 0 — NOT -0.08. The bob passes through zero at half-period.
    expect(bobOffset(1 / 1.2 / 2, 0)).toBeCloseTo(0, 5);
  });
  it('returns -0.08 at three-quarter period', () => {
    // sin(3π/2) = -1 → -0.08. Standard sine polarity.
    // bobOffset(0.625, 0) = 0.08 * sin(0.625 * 1.2 * 2π) = 0.08 * sin(3π/2) = -0.08
    expect(bobOffset(1 / 1.2 * 0.75, 0)).toBeCloseTo(-0.08, 5);
  });
  it('phase-shifted bobOffset(t=0, phase=π/2) returns 0.08', () => {
    expect(bobOffset(0, Math.PI / 2)).toBeCloseTo(0.08, 5);
  });
});

describe('fireFlashCurve', () => {
  it('returns 1.0 at age=0 (peak)', () => {
    expect(fireFlashCurve(0)).toBeCloseTo(1.0, 5);
  });
  it('returns 0.5 at age=40ms (halfway through 80ms)', () => {
    expect(fireFlashCurve(0.04)).toBeCloseTo(0.5, 5);
  });
  it('returns 0 at age=80ms (end of pop)', () => {
    expect(fireFlashCurve(0.08)).toBeCloseTo(0, 5);
  });
  it('returns 0 at age=200ms (past end)', () => {
    expect(fireFlashCurve(0.2)).toBeCloseTo(0, 5);
  });
});

describe('spinAngles', () => {
  it('accumulates Y rotation at 90°/s', () => {
    // After 1 second: y = π/2 (90°)
    const angles = spinAngles(1.0);
    expect(angles.y).toBeCloseTo(Math.PI / 2, 5);
  });
  it('accumulates X rotation at 60°/s', () => {
    // After 1 second: x = π/3 (60°)
    const angles = spinAngles(1.0);
    expect(angles.x).toBeCloseTo(Math.PI / 3, 5);
  });
  it('returns 0 at t=0', () => {
    const angles = spinAngles(0);
    expect(angles.x).toBeCloseTo(0, 5);
    expect(angles.y).toBeCloseTo(0, 5);
  });
});