import { describe, expect, it } from 'vitest';
import { AsteroidSize, createAsteroidState, splitAsteroid, SIZE_RADIUS } from '../src/asteroid';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Asteroid Unit Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify Iron Slag splitting behavior is deterministic and correct.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: Phase 2 moved asteroid state from Vector2 to Vector3 for drift depth.
// Fix: Updated test positions/velocities to include z=0.
// Gotchas: splitAsteroid uses Math.random(); tests only check structural
//          properties, not exact velocities.
// ═══════════════════════════════════════════════════════════════════════════

describe('splitAsteroid', () => {
  it('splits a large asteroid into two medium asteroids at the parent position', () => {
    const parent = createAsteroidState(
      AsteroidSize.LARGE,
      { x: 2, y: 3, z: 0 },
      { x: 0, y: -1, z: 0 },
    );
    const children = splitAsteroid(parent);

    expect(children).toHaveLength(2);
    children.forEach((child) => {
      expect(child.size).toBe(AsteroidSize.MEDIUM);
      expect(child.position.x).toBeCloseTo(2);
      expect(child.position.y).toBeCloseTo(3);
      expect(child.position.z).toBeCloseTo(0);
      expect(SIZE_RADIUS[child.size]).toBeLessThan(SIZE_RADIUS[parent.size]);
    });
  });

  it('splits a medium asteroid into two small asteroids at the parent position', () => {
    const parent = createAsteroidState(
      AsteroidSize.MEDIUM,
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
    );
    const children = splitAsteroid(parent);

    expect(children).toHaveLength(2);
    children.forEach((child) => {
      expect(child.size).toBe(AsteroidSize.SMALL);
      expect(child.position.x).toBeCloseTo(-1);
      expect(child.position.y).toBeCloseTo(0);
      expect(child.position.z).toBeCloseTo(0);
    });
  });

  it('does not split a small asteroid', () => {
    const parent = createAsteroidState(
      AsteroidSize.SMALL,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    );
    expect(splitAsteroid(parent)).toHaveLength(0);
  });
});
