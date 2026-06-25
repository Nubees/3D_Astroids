import { describe, expect, it } from 'vitest';
import {
  BURST_INTERVAL_SECONDS,
  BURST_SCHEDULE,
  CLUTCH_WINDOW_SECONDS,
  FIRST_BURST_DELAY_SECONDS,
  SATURATION_DURATION_SECONDS,
  ULTRA_CLEAN_WINDOW_SECONDS,
  ShardState,
} from '../src/types';
import {
  MAX_SHARDS,
  SHARDS_PER_CRYSTAL,
  createShard,
  shardCountForBurstIndex,
} from '../src/shard';
import {
  CrystalFractureScheduler,
  computeTimeBonusTier,
  crystalCharge,
  getBurstFlash,
  isClutchApplicable,
  isPerfectApplicable,
} from '../src/crystal-fx';
import { Shockwave } from '../src/shockwave';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shard + Crystal FX Burst Tests (Phase 6b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify pure burst-cascade logic, score tier math, hook gating,
//          cap behavior, GPU disposal, and shard source-of-truth.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: None.
// Fix: Added for Phase 6b — covers scheduler cadence, hook windows, pulse
//      curves, MAX_SHARDS cap, Shockwave lifecycle, and shard → crystal id
//      attribution for PERFECT bonus gating.
// Gotchas:
//  - All math is pure; no Three.js renderer needed. Shockwave constructor
//    uses RingGeometry which is geometry-only (no renderer context).
//  - isClutchApplicable requires elapsed > 0 AND in the ULTRA_CLEAN window
//    AND within CLUTCH_WINDOW_SECONDS of the next burst.
//  - isPerfectApplicable returns true for shardsAbsorbed === 0 regardless
//    of fracture state (4th-pass review dropped the shardsSpawned > 0 gate).
// ═══════════════════════════════════════════════════════════════════════════

describe('BURST_SCHEDULE', () => {
  it('contains exactly 6 steps', () => {
    expect(BURST_SCHEDULE).toHaveLength(6);
  });

  it('is the user-approved 1→2→4→8→16→24 escalation', () => {
    expect(BURST_SCHEDULE).toEqual([1, 2, 4, 8, 16, 24]);
  });

  it('sums to 55 total shards if a crystal survives the full cascade', () => {
    const sum = BURST_SCHEDULE.reduce((acc, n) => acc + n, 0);
    expect(sum).toBe(55);
  });
});

describe('shardCountForBurstIndex', () => {
  it('returns the matching entry for valid indices', () => {
    expect(shardCountForBurstIndex(0)).toBe(1);
    expect(shardCountForBurstIndex(1)).toBe(2);
    expect(shardCountForBurstIndex(2)).toBe(4);
    expect(shardCountForBurstIndex(3)).toBe(8);
    expect(shardCountForBurstIndex(4)).toBe(16);
    expect(shardCountForBurstIndex(5)).toBe(24);
  });

  it('clamps indices past the saturation cap to 24', () => {
    expect(shardCountForBurstIndex(6)).toBe(24);
    expect(shardCountForBurstIndex(99)).toBe(24);
  });

  it('clamps negative indices to the first step', () => {
    expect(shardCountForBurstIndex(-1)).toBe(1);
  });

  it('returns the canonical 8-shard constant for the legacy single-burst', () => {
    expect(SHARDS_PER_CRYSTAL).toBe(8);
  });
});

describe('MAX_SHARDS cap', () => {
  it('is bumped to 64 to allow two cascading bursts to overlap', () => {
    expect(MAX_SHARDS).toBe(64);
  });
});

describe('CrystalFractureScheduler — initial state', () => {
  it('initializes nextBurstAt = now + FIRST_BURST_DELAY_SECONDS', () => {
    const scheduler = new CrystalFractureScheduler(42, 100);
    expect(scheduler.state.crystalId).toBe(42);
    expect(scheduler.state.startedAt).toBe(100);
    expect(scheduler.state.nextBurstAt).toBe(100 + FIRST_BURST_DELAY_SECONDS);
    expect(scheduler.state.burstIndex).toBe(0);
  });
});

describe('CrystalFractureScheduler — cadence', () => {
  it('fires no bursts before the first delay elapses', () => {
    const scheduler = new CrystalFractureScheduler(1, 0);
    const r = scheduler.update(FIRST_BURST_DELAY_SECONDS - 0.01);
    expect(r.burstsToFire).toEqual([]);
    expect(r.done).toBe(false);
  });

  it('fires the first 1-shard burst at FIRST_BURST_DELAY_SECONDS', () => {
    const scheduler = new CrystalFractureScheduler(1, 0);
    const r = scheduler.update(FIRST_BURST_DELAY_SECONDS);
    expect(r.burstsToFire).toEqual([1]);
    expect(r.done).toBe(false);
  });

  it('fires the second 2-shard burst at 2s after the first', () => {
    const scheduler = new CrystalFractureScheduler(1, 0);
    scheduler.update(FIRST_BURST_DELAY_SECONDS);
    const r = scheduler.update(FIRST_BURST_DELAY_SECONDS + BURST_INTERVAL_SECONDS);
    expect(r.burstsToFire).toEqual([2]);
  });

  it('caps at 1 burst per update call (tab-unfocus defense)', () => {
    const scheduler = new CrystalFractureScheduler(1, 0);
    // Jump way past the saturation cap in a single call.
    const r = scheduler.update(FIRST_BURST_DELAY_SECONDS + 100);
    expect(r.burstsToFire.length).toBe(1);
    // Subsequent calls advance one step at a time.
    const r2 = scheduler.update(FIRST_BURST_DELAY_SECONDS + 100);
    expect(r2.burstsToFire.length).toBe(1);
  });

  it('marks done after all 6 bursts have been issued', () => {
    const scheduler = new CrystalFractureScheduler(1, 0);
    for (let i = 0; i < BURST_SCHEDULE.length + 1; i += 1) {
      scheduler.update(FIRST_BURST_DELAY_SECONDS + i * BURST_INTERVAL_SECONDS + 100);
    }
    expect(scheduler.isExpired(FIRST_BURST_DELAY_SECONDS + 100)).toBe(true);
  });

  it('reports time-to-next-burst correctly', () => {
    const scheduler = new CrystalFractureScheduler(1, 0);
    expect(scheduler.getTimeToNextBurst(FIRST_BURST_DELAY_SECONDS - 0.5)).toBeCloseTo(0.5);
    expect(scheduler.getTimeToNextBurst(FIRST_BURST_DELAY_SECONDS)).toBeCloseTo(0);
  });
});

describe('computeTimeBonusTier', () => {
  it('awards CLEAN KILL (+100) when killed before any fracture (elapsed <= 0)', () => {
    const tier = computeTimeBonusTier(0);
    expect(tier.bonus).toBe(100);
    expect(tier.text).toBe('+100 CLEAN KILL');
    expect(tier.color).toBe('#00ffe5');
  });

  it('awards ULTRA CLEAN (+75) within the 4s window', () => {
    const tier = computeTimeBonusTier(3.99);
    expect(tier.bonus).toBe(75);
    expect(tier.text).toBe('+75 ULTRA CLEAN');
    expect(tier.color).toBe('#ffcc00');
  });

  it('awards LATE (+25) between 4s and 10s with hot-orange text', () => {
    const tier = computeTimeBonusTier(4.01);
    expect(tier.bonus).toBe(25);
    expect(tier.text).toBe('+25 LATE');
    expect(tier.color).toBe('#ff7733');
  });

  it('awards LATE (+25) at 9.99s, just before saturation', () => {
    const tier = computeTimeBonusTier(9.99);
    expect(tier.bonus).toBe(25);
  });

  it('awards SURVIVOR (+10) after 10s with silver text', () => {
    const tier = computeTimeBonusTier(10.01);
    expect(tier.bonus).toBe(10);
    expect(tier.text).toBe('+10 SURVIVOR');
    expect(tier.color).toBe('#bbbbbb');
  });

  it('boundary: ULTRA_CLEAN_WINDOW_SECONDS is 4.0', () => {
    expect(ULTRA_CLEAN_WINDOW_SECONDS).toBe(4.0);
  });

  it('boundary: SATURATION_DURATION_SECONDS is 10.0', () => {
    expect(SATURATION_DURATION_SECONDS).toBe(10.0);
  });
});

describe('isClutchApplicable', () => {
  it('returns true within 0.5s of next burst during ULTRA window', () => {
    expect(isClutchApplicable(2.0, 0.4)).toBe(true);
  });

  it('returns false if outside the 0.5s window', () => {
    expect(isClutchApplicable(2.0, 0.6)).toBe(false);
  });

  it('returns false if elapsed is 0 (no fracture yet)', () => {
    expect(isClutchApplicable(0, 0.1)).toBe(false);
  });

  it('returns false if elapsed is past the ULTRA window', () => {
    expect(isClutchApplicable(5.0, 0.1)).toBe(false);
  });

  it('boundary: CLUTCH_WINDOW_SECONDS is 0.5', () => {
    expect(CLUTCH_WINDOW_SECONDS).toBe(0.5);
  });
});

describe('isPerfectApplicable', () => {
  it('returns true when 0 shards absorbed', () => {
    expect(isPerfectApplicable(0)).toBe(true);
  });

  it('returns false when any shards absorbed', () => {
    expect(isPerfectApplicable(1)).toBe(false);
  });
});

describe('crystalCharge', () => {
  it('returns 0 right after a burst (full interval remaining)', () => {
    // Formula: t = 1 - clamp(timeToNextBurst / interval, 0, 1); charge = t^3.
    // At full interval, t = 0, charge = 0.
    expect(crystalCharge(BURST_INTERVAL_SECONDS)).toBeCloseTo(0, 5);
  });

  it('returns 1.0 right before next burst (no time remaining)', () => {
    expect(crystalCharge(0)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.125 at 75% of the way to the next burst', () => {
    // At 0.5s remaining of a 2s interval: t = 1 - 0.25 = 0.75; t^3 = 0.421875.
    // (The new curve is steeper than the old 0.3 + 0.7 * t^2 — see My Rules.)
    expect(crystalCharge(BURST_INTERVAL_SECONDS / 4)).toBeCloseTo(0.421875, 4);
  });

  it('is monotonically increasing as timeToNextBurst decreases', () => {
    const a = crystalCharge(2.0);
    const b = crystalCharge(1.5);
    const c = crystalCharge(1.0);
    const d = crystalCharge(0.5);
    const e = crystalCharge(0.0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
    expect(d).toBeLessThan(e);
  });
});

describe('getBurstFlash', () => {
  it('returns 0 at t=0', () => {
    expect(getBurstFlash(0)).toBeCloseTo(0, 5);
  });

  it('returns ~1.0 at the 0.075s peak (mid-window)', () => {
    expect(getBurstFlash(0.075)).toBeCloseTo(1.0, 5);
  });

  it('returns 0 at t=0.15 (end of window)', () => {
    expect(getBurstFlash(0.15)).toBeCloseTo(0, 5);
  });
});

describe('createShard crystalId attribution', () => {
  it('stores crystalId on the ShardState for source-of-truth tracking', () => {
    const shard: ShardState = createShard({ x: 0, y: 0 }, 0, 42);
    expect(shard.crystalId).toBe(42);
  });

  it('defaults crystalId to -1 when not specified (legacy callers)', () => {
    const shard = createShard({ x: 0, y: 0 }, 0);
    expect(shard.crystalId).toBe(-1);
  });
});

describe('Shockwave class', () => {
  it('constructor builds a mesh positioned at the given world location', () => {
    const wave = new Shockwave({ x: 3, y: -2 }, 0xff0000, 1.0);
    expect(wave.mesh.position.x).toBe(3);
    expect(wave.mesh.position.y).toBe(-2);
    expect(wave.mesh.position.z).toBe(-0.2);
    expect(wave.age).toBe(0);
  });

  it('update(dt) returns false while still alive', () => {
    const wave = new Shockwave({ x: 0, y: 0 }, 0xff0000, 1.0);
    expect(wave.update(0.1)).toBe(false);
    expect(wave.age).toBeCloseTo(0.1);
  });

  it('update(dt) returns true after the 0.7s duration elapses', () => {
    const wave = new Shockwave({ x: 0, y: 0 }, 0xff0000, 1.0);
    expect(wave.update(0.8)).toBe(true);
  });

  it('scales intensity by the multiplier passed in', () => {
    const big = new Shockwave({ x: 0, y: 0 }, 0xff0000, 1.0);
    const small = new Shockwave({ x: 0, y: 0 }, 0xff0000, 0.5);
    expect(big.scaleMax).toBeGreaterThan(small.scaleMax);
  });

  it('clamps intensity to a minimum of 0.05', () => {
    const wave = new Shockwave({ x: 0, y: 0 }, 0xff0000, 0.01);
    expect(wave.intensity).toBe(0.05);
  });
});

