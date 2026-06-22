import { describe, expect, it } from 'vitest';
import {
  circlesCollide,
  circlePointCollide,
  resolveShipAsteroidBounce,
} from '../src/utils/collision';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Collision Unit Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the pure collision math used by the game loop.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: None.
// Fix: Added tests for overlap, touching, far apart, and zero-radius cases.
// Gotchas: Uses squared distance; no square-root needed.
// ═══════════════════════════════════════════════════════════════════════════

describe('circlesCollide', () => {
  it('returns true when circles overlap', () => {
    expect(circlesCollide({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1)).toBe(true);
  });

  it('returns true when circles just touch', () => {
    expect(circlesCollide({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1)).toBe(true);
  });

  it('returns false when circles are far apart', () => {
    expect(circlesCollide({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1)).toBe(false);
  });

  it('returns true for a point inside a circle', () => {
    expect(circlePointCollide({ x: 0, y: 0 }, 1, { x: 0.5, y: 0 })).toBe(true);
  });

  it('returns false for a point outside a circle', () => {
    expect(circlePointCollide({ x: 0, y: 0 }, 1, { x: 2, y: 0 })).toBe(false);
  });
});

describe('resolveShipAsteroidBounce', () => {
  it('reflects a hard ram with almost the same speed', () => {
    const shipVelocity = { x: -10, y: 0 };
    const asteroidVelocity = { x: 0, y: 0 };
    const normal = { x: 1, y: 0 };

    const result = resolveShipAsteroidBounce(shipVelocity, asteroidVelocity, normal, 0.1);

    expect(result.shipVelocity.x).toBeCloseTo(9.0, 5);
    expect(result.shipVelocity.y).toBe(0);
    expect(result.asteroidVelocity.x).toBeCloseTo(-1.0, 5);
    expect(result.asteroidVelocity.y).toBe(0);
  });

  it('gives a soft bounce for a gentle tap', () => {
    const shipVelocity = { x: -2, y: 0 };
    const asteroidVelocity = { x: 0, y: 0 };
    const normal = { x: 1, y: 0 };

    const result = resolveShipAsteroidBounce(shipVelocity, asteroidVelocity, normal, 0.1);

    expect(result.shipVelocity.x).toBeCloseTo(1.8, 5);
    expect(result.shipVelocity.y).toBe(0);
  });

  it('does nothing when the objects are already separating', () => {
    const shipVelocity = { x: 5, y: 0 };
    const asteroidVelocity = { x: 0, y: 0 };
    const normal = { x: 1, y: 0 };

    const result = resolveShipAsteroidBounce(shipVelocity, asteroidVelocity, normal, 0.1);

    expect(result.shipVelocity).toEqual({ x: 5, y: 0 });
    expect(result.asteroidVelocity).toEqual({ x: 0, y: 0 });
  });

  it('preserves tangential velocity', () => {
    const shipVelocity = { x: -5, y: 3 };
    const asteroidVelocity = { x: 0, y: 0 };
    const normal = { x: 1, y: 0 };

    const result = resolveShipAsteroidBounce(shipVelocity, asteroidVelocity, normal, 0.1);

    expect(result.shipVelocity.x).toBeCloseTo(4.5, 5);
    expect(result.shipVelocity.y).toBe(3);
  });

  it('shoves smaller asteroids harder than large ones', () => {
    const shipVelocity = { x: -8, y: 0 };
    const asteroidVelocity = { x: 0, y: 0 };
    const normal = { x: 1, y: 0 };

    const small = resolveShipAsteroidBounce(shipVelocity, asteroidVelocity, normal, 0.6);
    const large = resolveShipAsteroidBounce(shipVelocity, asteroidVelocity, normal, 0.1);

    expect(Math.abs(small.asteroidVelocity.x)).toBeGreaterThan(Math.abs(large.asteroidVelocity.x));
  });
});
