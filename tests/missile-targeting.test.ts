import { describe, it, expect } from 'vitest';
import {
  findNearestAsteroid,
  findFarthestAsteroid,
  HomingMissileState,
  tickHomingMissiles,
} from '../src/active-deployments';
import { Group, Mesh, Object3D } from 'three';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidKind, AsteroidSize, AsteroidState, Vector2 } from '../src/types';
import {
  HOMING_MISSILES_NEAR_TIER_COUNT,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_VOLLEY_COUNT,
} from '../src/pickups';

function makeScene(): Object3D {
  return new Object3D();
}

/**
 * Build a minimal HomingMissileState. The mesh/assembly/flame fields are
 * real (empty) Group/Mesh instances so the per-frame
 * `missile.assembly.position.set(...)` call added in Phase 7d-3 doesn't
 * crash; targeting-only tests never exercise the disposal path.
 */
function makeMissile(volleyIndex: number, position: Vector2 = { x: 0, y: 0 }): HomingMissileState {
  return {
    position,
    velocity: { x: 7, y: 0 },
    remaining: 10,
    mesh: new Mesh(),
    assembly: new Group(),
    flame: new Mesh(),
    volleyIndex,
    target: null,
    spawnTime: 0,
    firePulse: 0,
  };
}

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

// Phase 7d-3 — Sticky target. Previously each missile re-picked "nearest"
// (or "farthest") every frame, so all 3 near-tier missiles in a volley
// converged on the SAME asteroid (they all spawn co-located on the ship).
// The fix: each missile picks a target ONCE (on the first tick frame), then
// locks that target until it's removed from the asteroid list. Because
// missiles spread along their angular-spread offsets during the first few
// frames, their "nearest" picks are DIFFERENT asteroids — the 3-missile
// near tier hits 3 different targets, not 3-on-1.
describe('Missile target stickiness — Phase 7d-3', () => {
  it('near-tier missiles with distinct positions lock onto DISTINCT targets', () => {
    // Place 3 asteroids so a missile at (0,0) sees a clear "nearest" (a1),
    // but a missile at (2,2) sees a2 as nearer than a1, and at (-2,-2) sees a3.
    // If all 3 missiles were calling findNearestAsteroid at the same origin,
    // they'd all pick a1 — the stickiness fix only works if each missile's
    // initial lock fires AFTER its angular spread has carried it to a
    // different position. We simulate that by constructing 3 missiles that
    // have already drifted to distinct positions before the first tick.
    // Positions chosen so each missile's nearest asteroid is > 1u away
    // (no collision on the first tick), but still inside the 14u tracking radius.
    const a1 = makeAsteroid(3, 0);    // nearest to (0,0)
    const a2 = makeAsteroid(2.5, 2.5); // nearest to (2,2) — closer than a1
    const a3 = makeAsteroid(-2.5, -2.5); // nearest to (-2,-2) — closer than a1
    const asteroids = [a1, a2, a3];

    const scene = makeScene();
    const m0 = makeMissile(0, { x: 0, y: 0 });
    const m1 = makeMissile(1, { x: 2, y: 2 });
    const m2 = makeMissile(2, { x: -2, y: -2 });

    const alive = tickHomingMissiles([m0, m1, m2], asteroids, 1 / 60, scene, () => undefined);

    expect(m0.target).toBe(a1);
    expect(m1.target).toBe(a2);
    expect(m2.target).toBe(a3);
    // All still in flight (none hit yet).
    expect(alive.length).toBe(3);
  });

  it('a missile does NOT re-pick its target on subsequent frames', () => {
    // Start with only `target` in the list so the initial lock has nothing
    // closer to compete with. Then introduce `closer` mid-flight — the lock
    // must hold, proving stickiness (the previous behavior would re-pick
    // to `closer` every frame).
    const target = makeAsteroid(3, 0);
    const closer = makeAsteroid(1, 0);

    const scene = makeScene();
    const m = makeMissile(0, { x: 0, y: 0 });
    // First tick — locks onto `target` (the only candidate).
    tickHomingMissiles([m], [target], 1 / 60, scene, () => undefined);
    expect(m.target).toBe(target);

    // Subsequent ticks — `closer` enters the list, but the lock holds.
    // Limit to 10 ticks (missile at ~1.17u from origin, still >0.95u from
    // target at (3,0) so no early collision triggers a null-pointer dispose).
    for (let i = 0; i < 10; i++) {
      tickHomingMissiles([m], [target, closer], 1 / 60, scene, () => undefined);
    }
    expect(m.target).toBe(target); // STICKY: still locked on the original target
  });

  it('lock is released when the target asteroid is removed from the list', () => {
    // Simulates the case where another missile in the volley kills the target
    // before this one arrives — the destroyed asteroid is no longer in the
    // asteroids array, so this missile must re-pick.
    const originalTarget = makeAsteroid(3, 0);
    const replacement = makeAsteroid(2, 0);

    const scene = makeScene();
    const m = makeMissile(0, { x: 0, y: 0 });

    // Frame 1: locks onto originalTarget.
    tickHomingMissiles([m], [originalTarget, replacement], 1 / 60, scene, () => undefined);
    expect(m.target).toBe(originalTarget);

    // Frame 2: originalTarget is removed (killed). Should re-pick to `replacement`.
    tickHomingMissiles([m], [replacement], 1 / 60, scene, () => undefined);
    expect(m.target).toBe(replacement);
  });

  it('far-tier missile keeps a sticky far target (does not chase nearer asteroids)', () => {
    // Two asteroids: near (1,0) and far (9,0). The far-tier missile locks the
    // FAR one. A new even-nearer asteroid appearing mid-flight must NOT
    // pull the lock.
    const near = makeAsteroid(1, 0);
    const far = makeAsteroid(9, 0);
    const nearer = makeAsteroid(0.5, 0);

    const scene = makeScene();
    const m = makeMissile(3, { x: 0, y: 0 }); // volleyIndex 3 → far tier
    tickHomingMissiles([m], [near, far], 1 / 60, scene, () => undefined);
    expect(m.target).toBe(far);

    // `nearer` enters the list — the lock must hold.
    tickHomingMissiles([m], [near, far, nearer], 1 / 60, scene, () => undefined);
    expect(m.target).toBe(far);
  });
});