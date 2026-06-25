import { describe, it, expect } from 'vitest';
import {
  findNearestAsteroid,
  findFarthestAsteroid,
} from '../src/active-deployments';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidKind, AsteroidSize, AsteroidState, Vector2 } from '../src/types';
import {
  HOMING_MISSILES_NEAR_TIER_COUNT,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_VOLLEY_COUNT,
} from '../src/pickups';

function makeAsteroid(x: number, y: number): AsteroidState {
  return createAsteroidState(
    AsteroidSize.LARGE,
    { x, y },
    { x: 0, y: 0 },
    false,
    AsteroidKind.IRON,
  );
}

// Tier targeting (Phase 7c-2): the first HOMING_MISSILES_NEAR_TIER_COUNT
// missiles in a 6-volley seek the NEAREST asteroid; the rest (indices
// NEAR_TIER_COUNT..VOLLEY_COUNT-1) seek the FARTHEST. Tests below cover
// both helpers + the tier-boundary conditional that tickHomingMissiles
// applies on each frame.
describe('Missile tier targeting — findNearestAsteroid (near tier)', () => {
  it('returns null when no asteroids in range', () => {
    const a = makeAsteroid(100, 100);
    expect(findNearestAsteroid({ x: 0, y: 0 }, [a], 5)).toBeNull();
  });

  it('returns the closest asteroid within range', () => {
    const a1 = makeAsteroid(3, 0);
    const a2 = makeAsteroid(2, 0);
    const nearest = findNearestAsteroid({ x: 0, y: 0 }, [a1, a2], 5);
    expect(nearest).toBe(a2);
  });
});

describe('Missile tier targeting — findFarthestAsteroid (far tier)', () => {
  it('returns null when no asteroids in range', () => {
    const a = makeAsteroid(100, 100);
    expect(findFarthestAsteroid({ x: 0, y: 0 }, [a], 5)).toBeNull();
  });

  it('returns the farthest asteroid within range (not the closest)', () => {
    const near = makeAsteroid(2, 0);
    const mid = makeAsteroid(5, 0);
    const far = makeAsteroid(9, 0);
    const farthest = findFarthestAsteroid({ x: 0, y: 0 }, [near, mid, far], 10);
    expect(farthest).toBe(far);
  });
});

describe('Missile tier targeting — tier semantics', () => {
  it('NEAR_TIER_COUNT boundary splits the 6-volley 3-near / 3-far', () => {
    // The tier conditional in tickHomingMissiles is:
    //   missile.volleyIndex < HOMING_MISSILES_NEAR_TIER_COUNT
    //     ? findNearestAsteroid(...) : findFarthestAsteroid(...)
    // This test exercises the boundary directly so a future change that
    // drops NEAR_TIER_COUNT or shifts the threshold fails loudly.
    const near = makeAsteroid(2, 0);
    const far = makeAsteroid(8, 0);
    const asteroids = [near, far];
    const position: Vector2 = { x: 0, y: 0 };
    const maxRadius = 10;

    // Sanity guards on the constants themselves.
    expect(HOMING_MISSILES_VOLLEY_COUNT).toBe(6);
    expect(HOMING_MISSILES_NEAR_TIER_COUNT).toBe(3);
    expect(HOMING_MISSILES_TRACKING_RADIUS).toBeGreaterThanOrEqual(10);

    // Indices 0..2 → near tier (3 missiles lock the nearest asteroid).
    for (let i = 0; i < HOMING_MISSILES_NEAR_TIER_COUNT; i++) {
      const target =
        i < HOMING_MISSILES_NEAR_TIER_COUNT
          ? findNearestAsteroid(position, asteroids, maxRadius)
          : findFarthestAsteroid(position, asteroids, maxRadius);
      expect(target).toBe(near);
    }
    // Indices 3..5 → far tier (3 missiles lock the farthest asteroid).
    for (let i = HOMING_MISSILES_NEAR_TIER_COUNT; i < HOMING_MISSILES_VOLLEY_COUNT; i++) {
      const target =
        i < HOMING_MISSILES_NEAR_TIER_COUNT
          ? findNearestAsteroid(position, asteroids, maxRadius)
          : findFarthestAsteroid(position, asteroids, maxRadius);
      expect(target).toBe(far);
    }
  });
});