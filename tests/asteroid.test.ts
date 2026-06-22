import { describe, expect, it } from 'vitest';
import {
  AsteroidSize,
  createAsteroidState,
  resolveAsteroidCollision,
  splitAsteroid,
  splitSmallAsteroid,
  SIZE_RADIUS,
} from '../src/asteroid';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Asteroid Unit Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify Iron Slag splitting behavior is deterministic and correct.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: None.
// Fix: Added tests for large → medium and medium → small split counts and
//      positions.
// Gotchas: splitAsteroid uses Math.random(); tests only check structural
//          properties, not exact velocities. Collision tests use floating-point
//          approximations because the resolver uses normalized normals.
// ═══════════════════════════════════════════════════════════════════════════

describe('splitAsteroid', () => {
  it('splits a large asteroid into two medium asteroids at the parent position', () => {
    const parent = createAsteroidState(AsteroidSize.LARGE, { x: 2, y: 3 }, { x: 0, y: -1 });
    const children = splitAsteroid(parent);

    expect(children).toHaveLength(2);
    children.forEach((child) => {
      expect(child.size).toBe(AsteroidSize.MEDIUM);
      expect(child.position.x).toBeCloseTo(2);
      expect(child.position.y).toBeCloseTo(3);
      expect(SIZE_RADIUS[child.size]).toBeLessThan(SIZE_RADIUS[parent.size]);
    });
  });

  it('splits a medium asteroid into two small asteroids at the parent position', () => {
    const parent = createAsteroidState(AsteroidSize.MEDIUM, { x: -1, y: 0 }, { x: 1, y: 0 });
    const children = splitAsteroid(parent);

    expect(children).toHaveLength(2);
    children.forEach((child) => {
      expect(child.size).toBe(AsteroidSize.SMALL);
      expect(child.position.x).toBeCloseTo(-1);
      expect(child.position.y).toBeCloseTo(0);
    });
  });

  it('does not split a small asteroid via splitAsteroid', () => {
    const parent = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(splitAsteroid(parent)).toHaveLength(0);
  });

  it('splits a small asteroid into two tiny asteroids via splitSmallAsteroid', () => {
    const parent = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });
    const children = splitSmallAsteroid(parent);

    expect(children).toHaveLength(2);
    children.forEach((child) => {
      expect(child.size).toBe(AsteroidSize.TINY);
      expect(child.position.x).toBeCloseTo(0);
      expect(child.position.y).toBeCloseTo(0);
    });
  });

  it('marks targeted asteroids and keeps split children non-targeted', () => {
    const targeted = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 }, true);
    expect(targeted.isTargeted).toBe(true);

    const children = splitAsteroid(targeted);
    children.forEach((child) => {
      expect(child.isTargeted).toBe(false);
    });
  });
});

describe('resolveAsteroidCollision', () => {
  it('swaps normal velocities for equal-size asteroids', () => {
    const a = createAsteroidState(AsteroidSize.MEDIUM, { x: -1.05, y: 0 }, { x: 2, y: 0 });
    const b = createAsteroidState(AsteroidSize.MEDIUM, { x: 1.05, y: 0 }, { x: -1, y: 0 });

    resolveAsteroidCollision(a, b);

    expect(a.velocity.x).toBeCloseTo(-1, 1);
    expect(b.velocity.x).toBeCloseTo(2, 1);
  });

  it('leaves the larger asteroid unchanged and reflects the smaller one', () => {
    const big = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 1, y: 0 });
    const small = createAsteroidState(AsteroidSize.SMALL, { x: 2.5, y: 0 }, { x: -2, y: 0 });

    resolveAsteroidCollision(big, small);

    expect(big.velocity.x).toBeCloseTo(1, 2);
    expect(small.velocity.x).toBeCloseTo(4, 1);
  });

  it('ignores collisions when either asteroid is targeted', () => {
    const normal = createAsteroidState(AsteroidSize.MEDIUM, { x: -1.05, y: 0 }, { x: 2, y: 0 });
    const targeted = createAsteroidState(AsteroidSize.MEDIUM, { x: 1.05, y: 0 }, { x: -2, y: 0 }, true);

    resolveAsteroidCollision(normal, targeted);

    expect(normal.velocity.x).toBeCloseTo(2, 2);
    expect(targeted.velocity.x).toBeCloseTo(-2, 2);
  });
});
