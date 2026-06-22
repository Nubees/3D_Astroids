import { describe, expect, it } from 'vitest';
import {
  MAX_SHARDS,
  SHARD_HOMING_DELAY,
  SHARD_LIFETIME,
  SHARD_SPEED,
  SHARD_TURN_RATE,
  SHARDS_PER_CRYSTAL,
  createShard,
  generateShardSpawnAngles,
  isShardDead,
  updateShard,
} from '../src/shard';
import { AsteroidKind, AsteroidSize, createAsteroidState, shouldCrystalFracture } from '../src/asteroid';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shard + Crystal Threshold Tests (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify pure shard logic and crystal fracture threshold math.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: None.
// Fix: Added for Phase 6 — covers homing steering, lifetime, out-of-bounds
//      culling, spawn-angle distribution, and crystal threshold crossing.
// Gotchas:
//  - updateShard mutates the shard in place — tests reuse a single shard.
//  - Homing math uses fixed deltaTime steps; tests assert angle progression
//    within tolerance rather than exact equality.
//  - shouldCrystalFracture must NOT re-trigger once fractured (idempotent).
// ═══════════════════════════════════════════════════════════════════════════

describe('MAX_SHARDS cap (Phase 6b)', () => {
  it('is 64 to allow two cascading bursts to overlap', () => {
    expect(MAX_SHARDS).toBe(64);
  });
});

describe('createShard', () => {
  it('initializes with the requested angle and outward velocity', () => {
    const shard = createShard({ x: 0, y: 0 }, Math.PI / 2);
    expect(shard.angle).toBeCloseTo(Math.PI / 2);
    expect(shard.velocity.x).toBeCloseTo(0);
    expect(shard.velocity.y).toBeCloseTo(SHARD_SPEED);
    expect(shard.position).toEqual({ x: 0, y: 0 });
  });

  it('starts with full homing delay so shards fan out before steering', () => {
    const shard = createShard({ x: 0, y: 0 }, 0);
    expect(shard.homingDelay).toBeCloseTo(SHARD_HOMING_DELAY);
  });

  it('starts with full lifetime', () => {
    const shard = createShard({ x: 0, y: 0 }, 0);
    expect(shard.lifetime).toBeCloseTo(SHARD_LIFETIME);
    expect(shard.maxLifetime).toBeCloseTo(SHARD_LIFETIME);
  });
});

describe('updateShard — fanning-out phase', () => {
  it('does not steer toward the ship before homingDelay elapses', () => {
    // Shard pointing at angle 0 (+X), ship at angle π/2 (+Y).
    const shard = createShard({ x: 0, y: 0 }, 0);
    const initialAngle = shard.angle;

    // Advance half of the homing delay — no steering yet.
    updateShard(shard, SHARD_HOMING_DELAY / 2, { x: 0, y: 10 });

    expect(shard.angle).toBeCloseTo(initialAngle);
    expect(shard.homingDelay).toBeCloseTo(SHARD_HOMING_DELAY / 2);
  });
});

describe('updateShard — homing phase', () => {
  it('steers toward the ship position after the delay elapses', () => {
    // Shard pointing at angle 0 (+X), ship directly above (+Y).
    const shard = createShard({ x: 0, y: 0 }, 0);

    // Burn through the homing delay.
    updateShard(shard, SHARD_HOMING_DELAY, { x: 0, y: 10 });

    // One more step should steer the angle toward π/2.
    updateShard(shard, 0.1, { x: 0, y: 10 });

    expect(shard.angle).toBeGreaterThan(0);
    expect(shard.angle).toBeLessThanOrEqual(Math.PI / 2);
  });

  it('clamps the turn rate so the shard cannot snap directly to the target', () => {
    const shard = createShard({ x: 0, y: 0 }, 0);

    // Burn the homing delay so steering is active. After this, the shard has
    // already turned a bit (max ~0.84 rad), so we capture `before` AFTER the
    // burn and apply a small deltaTime to verify a single step is clamped.
    updateShard(shard, SHARD_HOMING_DELAY, { x: 0, y: 10 });
    const before = shard.angle;

    // First explicit steering step: max angular change = SHARD_TURN_RATE * deltaTime.
    updateShard(shard, 0.1, { x: 0, y: 10 });
    const after = shard.angle;

    expect(after - before).toBeGreaterThan(0);
    expect(after - before).toBeLessThanOrEqual(SHARD_TURN_RATE * 0.1 + 0.0001);
    expect(after).toBeLessThanOrEqual(Math.PI / 2 + 0.0001);
  });

  it('integrates position from velocity each frame', () => {
    // Use a ship position colinear with the shard's travel direction (+X)
    // so the shard never steers away — we want pure linear integration.
    const shard = createShard({ x: 0, y: 0 }, 0);
    const startX = shard.position.x;

    updateShard(shard, 0.5, { x: 100, y: 0 });

    // Position should advance by velocity * deltaTime = SHARD_SPEED * 0.5 along +X.
    expect(shard.position.x).toBeCloseTo(startX + SHARD_SPEED * 0.5, 3);
  });

  it('decrements lifetime every frame', () => {
    const shard = createShard({ x: 0, y: 0 }, 0);
    const start = shard.lifetime;
    updateShard(shard, 0.25, { x: 0, y: 10 });
    expect(shard.lifetime).toBeCloseTo(start - 0.25, 5);
  });
});

describe('isShardDead', () => {
  it('returns true when lifetime hits zero', () => {
    const shard = createShard({ x: 0, y: 0 }, 0);
    shard.lifetime = 0;
    expect(isShardDead(shard, 50)).toBe(true);
  });

  it('returns true when the shard leaves the arena bounds', () => {
    const shard = createShard({ x: 100, y: 0 }, 0);
    expect(isShardDead(shard, 30)).toBe(true);
  });

  it('returns false for a healthy in-bounds shard', () => {
    const shard = createShard({ x: 5, y: 5 }, 0);
    expect(isShardDead(shard, 30)).toBe(false);
  });
});

describe('generateShardSpawnAngles', () => {
  it('produces exactly SHARDS_PER_CRYSTAL angles by default count', () => {
    const angles = generateShardSpawnAngles(SHARDS_PER_CRYSTAL, 0);
    expect(angles).toHaveLength(SHARDS_PER_CRYSTAL);
  });

  it('distributes angles evenly across the full circle (no jitter)', () => {
    const angles = generateShardSpawnAngles(8, 0);
    // Step between consecutive angles should be 2π/8 = π/4.
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i] - angles[i - 1]).toBeCloseTo(Math.PI / 4, 5);
    }
  });

  it('applies bounded jitter when requested', () => {
    const angles = generateShardSpawnAngles(8, 0.5);
    // Step between angles should still be near π/4 ± jitter/2.
    for (let i = 1; i < angles.length; i++) {
      const step = angles[i] - angles[i - 1];
      expect(step).toBeGreaterThan(Math.PI / 4 - 0.5);
      expect(step).toBeLessThan(Math.PI / 4 + 0.5);
    }
  });
});

describe('shouldCrystalFracture', () => {
  it('returns false for an iron asteroid even at low health', () => {
    const iron = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });
    iron.health = 1;
    expect(shouldCrystalFracture(iron)).toBe(false);
  });

  it('returns false for a crystal above the 30% threshold', () => {
    const crystal = createAsteroidState(
      AsteroidSize.LARGE,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
      AsteroidKind.CRYSTAL,
    );
    // 3 / 6 = 50%, well above threshold.
    crystal.health = 3;
    expect(shouldCrystalFracture(crystal)).toBe(false);
  });

  it('returns true the first time a crystal drops below 30% health', () => {
    const crystal = createAsteroidState(
      AsteroidSize.LARGE,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
      AsteroidKind.CRYSTAL,
    );
    // 1 / 6 = 16.67%, below threshold.
    crystal.health = 1;
    expect(shouldCrystalFracture(crystal)).toBe(true);
  });

  it('is idempotent — does not re-trigger once already fractured', () => {
    const crystal = createAsteroidState(
      AsteroidSize.LARGE,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
      AsteroidKind.CRYSTAL,
    );
    crystal.health = 1;
    crystal.fractured = true;
    expect(shouldCrystalFracture(crystal)).toBe(false);
  });
});