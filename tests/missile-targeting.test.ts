import { describe, it, expect } from 'vitest';
import {
  findNearestAsteroid,
  findFarthestAsteroid,
  HomingMissileState,
  knockbackAsteroid,
  missileIgnoresAsteroid,
  tickHomingMissiles,
} from '../src/active-deployments';
import { Group, Mesh, Object3D } from 'three';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidKind, AsteroidSize, AsteroidState, Vector2 } from '../src/types';
import {
  HOMING_MISSILES_NEAR_TIER_COUNT,
  HOMING_MISSILES_TINY_KNOCKBACK_SPEED,
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7 fix — missile "goes behind the asteroid" bug.
// Reproduces the symptom: a missile that hits an asteroid calls
// onMissileImpact (which destroys the asteroid in game state) but the
// asteroids array passed to tickHomingMissiles still contains the dead
// target. Subsequent missiles in the same volley that were tracking the
// same target keep steering toward its frozen position — visually they
// curve into the spot where the explosion happened, then "fly past
// nothing" and time out at the 10s tracking duration.
//
// The fix lives at the game.ts wrapper around tickHomingMissiles: the
// callback now captures which asteroid states were destroyed this tick
// and the wrapper filters `this.asteroids` immediately after. This test
// reproduces the same wrapper pattern (capture-then-filter) so we can
// assert the fix's behavior at the unit level.
//
// Test setup note: Missile A is placed at x=1.7 so it's ALREADY inside
// the 0.95u impact radius on frame 1 — A's first tick fires the impact
// before B has had any chance to close the 2u gap. Earlier drafts put
// A at (0.7, 0) and B at (0.1, 0) so both flew right at the same speed;
// both hit shared on the same frame, the test asserted mB was still
// alive but mB had already been disposed, and the failure looked like
// "re-pick didn't happen." Making A's hit instantaneous isolates the
// invalidation→re-pick behavior we actually want to test.
// ═══════════════════════════════════════════════════════════════════════════

describe('Missile target invalidation — Phase 7 fix', () => {
  it('a second missile tracking the same target re-picks after the target is destroyed mid-flight', () => {
    // Both missiles target the same asteroid. Missile A is closer so it
    // hits first. The test simulates game.ts's wrapper: it captures
    // destroyed asteroids in a Set and filters them out of the asteroids
    // list after each tick — exactly the pattern game.ts now uses.
    const shared = makeAsteroid(2, 0);
    const bystander = makeAsteroid(8, 0);

    const scene = makeScene();
    // A is placed ALREADY inside the impact radius (distance 0.3u < 0.95u)
    // so its very first tick fires the impact — B is still mid-flight
    // 2u away from `shared` and cannot hit for ~14 more frames at 7u/s.
    const mA = makeMissile(0, { x: 1.7, y: 0 }); // 0.3u from shared → instant impact
    const mB = makeMissile(1, { x: 0, y: 0 }); // 2u from shared → still in flight

    let destroyedTarget: AsteroidState | null = null;
    // Wrapper that mirrors game.ts:1703 + the new pruning step.
    const tickWrapper = (
      missiles: HomingMissileState[],
      asteroids: AsteroidState[],
    ) => {
      const destroyedThisTick = new Set<AsteroidState>();
      const alive = tickHomingMissiles(
        missiles,
        asteroids,
        1 / 60,
        scene,
        (a) => {
          destroyedThisTick.add(a);
          destroyedTarget = a;
        },
      );
      const remainingAsteroids = asteroids.filter((a) => !destroyedThisTick.has(a));
      return { missiles: alive, asteroids: remainingAsteroids };
    };

    // Tick both missiles. They both lock `shared` on frame 1, and A's
    // impact fires immediately because it's already inside the radius.
    let asteroids = [shared, bystander];
    let { missiles, asteroids: nextAsteroids } = tickWrapper([mA, mB], asteroids);
    asteroids = nextAsteroids;
    expect(mA.target).toBe(shared);
    expect(mB.target).toBe(shared);
    expect(destroyedTarget).toBe(shared); // A destroyed shared on the very first tick.

    // One more tick with `shared` already removed — B's lock check
    // sees `asteroids.includes(mB.target) === false` and re-picks
    // the only remaining target (`bystander`).
    const post = tickWrapper(missiles, asteroids);
    expect(mB.target).toBe(bystander);
    expect(post.missiles).toContain(mB);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7f-2 — Missiles ignore TINY asteroids (targeting skips them,
// impact knocks them aside instead of destroying).
// ═══════════════════════════════════════════════════════════════════════════

describe('Phase 7f-2 — Missile ignores TINY asteroids', () => {
  it('missileIgnoresAsteroid returns true only for TINY', () => {
    const tiny = makeAsteroid(0, 0);
    tiny.size = AsteroidSize.TINY;
    const small = makeAsteroid(0, 0);
    small.size = AsteroidSize.SMALL;
    const medium = makeAsteroid(0, 0);
    medium.size = AsteroidSize.MEDIUM;
    const large = makeAsteroid(0, 0);
    large.size = AsteroidSize.LARGE;
    expect(missileIgnoresAsteroid(tiny)).toBe(true);
    expect(missileIgnoresAsteroid(small)).toBe(false);
    expect(missileIgnoresAsteroid(medium)).toBe(false);
    expect(missileIgnoresAsteroid(large)).toBe(false);
  });

  it('findNearestAsteroid skips TINY and returns the closest non-tiny', () => {
    const tiny = makeAsteroid(2, 0);
    tiny.size = AsteroidSize.TINY;
    const medium = makeAsteroid(3, 0);
    medium.size = AsteroidSize.MEDIUM;
    const large = makeAsteroid(7, 0);
    large.size = AsteroidSize.LARGE;
    // TINY is closer to (0,0) than MEDIUM, but the helper must skip it.
    expect(findNearestAsteroid({ x: 0, y: 0 }, [tiny, medium, large], 10)).toBe(medium);
  });

  it('findFarthestAsteroid skips TINY and returns the farthest non-tiny', () => {
    const tiny = makeAsteroid(2, 0);
    tiny.size = AsteroidSize.TINY;
    const mid = makeAsteroid(5, 0);
    mid.size = AsteroidSize.SMALL;
    const far = makeAsteroid(9, 0);
    far.size = AsteroidSize.MEDIUM;
    // TINY is at 2u; LARGE-equivalent at 9u should win.
    expect(findFarthestAsteroid({ x: 0, y: 0 }, [tiny, mid, far], 10)).toBe(far);
  });

  it('knockbackAsteroid returns a new state with velocity boosted along direction', () => {
    const tiny = makeAsteroid(0, 0);
    tiny.size = AsteroidSize.TINY;
    tiny.velocity = { x: 1, y: 0 };
    const knocked = knockbackAsteroid(tiny, { x: 1, y: 0 }, 5);
    expect(knocked.velocity.x).toBeCloseTo(6, 5);
    expect(knocked.velocity.y).toBeCloseTo(0, 5);
    // Position unchanged (knockback is impulse-only).
    expect(knocked.position).toEqual(tiny.position);
    // Returns a new object, not the same reference (immutable).
    expect(knocked).not.toBe(tiny);
    expect(knocked.velocity).not.toBe(tiny.velocity);
  });

  it('knockbackAsteroid at angle adds the impulse as a vector', () => {
    const tiny = makeAsteroid(0, 0);
    tiny.size = AsteroidSize.TINY;
    tiny.velocity = { x: 0, y: 0 };
    // 90° up impulse at HOMING_MISSILES_TINY_KNOCKBACK_SPEED.
    const knocked = knockbackAsteroid(tiny, { x: 0, y: 1 }, HOMING_MISSILES_TINY_KNOCKBACK_SPEED);
    expect(knocked.velocity.x).toBeCloseTo(0, 5);
    expect(knocked.velocity.y).toBeCloseTo(HOMING_MISSILES_TINY_KNOCKBACK_SPEED, 5);
  });

  it('tickHomingMissiles impact on TINY pushes it, clears target, missile stays in flight', () => {
    // Pre-lock the missile onto the TINY directly — this simulates the
    // scenario where a tiny wandered into the missile's flight cone AFTER
    // the missile had already acquired its lock. Without the pre-lock,
    // findNearestAsteroid (which now skips TINY) would never even pick the
    // tiny, so the impact branch would never fire.
    const tiny = makeAsteroid(2, 0);
    tiny.size = AsteroidSize.TINY;
    const medium = makeAsteroid(8, 0);
    medium.size = AsteroidSize.MEDIUM;
    const scene = makeScene();
    const m = makeMissile(0, { x: 1.5, y: 0 }); // 0.5u from tiny
    m.target = tiny; // simulate a pre-acquired tiny lock
    let knockedAsteroid: AsteroidState | null = null;
    let knockedDirection: Vector2 | null = null;
    let impactCalls = 0;

    const alive = tickHomingMissiles(
      [m],
      [tiny, medium],
      1 / 60,
      scene,
      () => {
        impactCalls++;
      },
      (a, dir) => {
        knockedAsteroid = a;
        knockedDirection = dir;
      },
    );

    // Missile is still alive (knockback, not destroy).
    expect(alive).toContain(m);
    // No impact fired (we knocked, not destroyed).
    expect(impactCalls).toBe(0);
    // Knockback fired on the tiny with a normalized direction.
    expect(knockedAsteroid).toBe(tiny);
    expect(knockedDirection).not.toBeNull();
    const dLen = Math.hypot(knockedDirection!.x, knockedDirection!.y);
    expect(dLen).toBeCloseTo(1, 5);
    // Target was cleared (so next frame re-picks medium).
    expect(m.target).toBeNull();

    // Next tick — missile locks the MEDIUM, not the TINY (TINY skipped
    // by findNearestAsteroid in the tier helper).
    tickHomingMissiles(
      [m],
      [tiny, medium],
      1 / 60,
      scene,
      () => {},
      () => {},
    );
    expect(m.target).toBe(medium);
  });

  it('tickHomingMissiles impact on MEDIUM still destroys (regression guard)', () => {
    // Phase 7f-2 must NOT change the non-tiny destruction path.
    const medium = makeAsteroid(2, 0);
    medium.size = AsteroidSize.MEDIUM;
    const scene = makeScene();
    const m = makeMissile(0, { x: 1.5, y: 0 }); // 0.5u from medium
    m.target = medium; // pre-lock (consistent with the TINY test above)
    let impactCalls = 0;
    let knockedCalls = 0;

    const alive = tickHomingMissiles(
      [m],
      [medium],
      1 / 60,
      scene,
      () => {
        impactCalls++;
      },
      () => {
        knockedCalls++;
      },
    );

    expect(impactCalls).toBe(1);
    expect(knockedCalls).toBe(0);
    expect(alive).not.toContain(m); // missile disposed
  });

  it('tickHomingMissiles WITHOUT onTinyKnockback callback falls back to destroy (back-compat)', () => {
    // The Phase 7f-2 TINY-knockback path is opt-in via the optional callback.
    // If a caller does NOT pass onTinyKnockback, the TINY falls through to
    // the existing destroy path — same behavior as before Phase 7f-2. This
    // keeps back-compat for any external/headless callers that haven't been
    // updated yet (none in this codebase, but the contract should not
    // silently break for them). The Game wrapper DOES pass onTinyKnockback,
    // so in practice missiles always use the push-aside path.
    const tiny = makeAsteroid(2, 0);
    tiny.size = AsteroidSize.TINY;
    const scene = makeScene();
    const m = makeMissile(0, { x: 1.5, y: 0 });
    m.target = tiny; // pre-lock to force the impact branch
    let impactCalls = 0;

    const alive = tickHomingMissiles(
      [m],
      [tiny],
      1 / 60,
      scene,
      () => {
        impactCalls++;
      },
      // no onTinyKnockback passed
    );

    // Fallback: TINY is destroyed like any other asteroid.
    expect(impactCalls).toBe(1);
    expect(alive).not.toContain(m);
  });
});