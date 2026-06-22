import { Vector2 } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Collision Utilities
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure, unit-testable circle/circle and circle/point collision math.
// Setup: Imported by game.ts and asteroid logic.
// Issues: None.
// Fix: Created in src/utils/ per project code-style rules; uses squared distance
//      to avoid Math.sqrt in hot paths.
// Gotchas: Radii must be non-negative; zero-radius points can still collide.
// ═══════════════════════════════════════════════════════════════════════════

export function circlesCollide(a: Vector2, radiusA: number, b: Vector2, radiusB: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = radiusA + radiusB;
  return dx * dx + dy * dy <= reach * reach;
}

export function circlePointCollide(circle: Vector2, radius: number, point: Vector2): boolean {
  return circlesCollide(circle, radius, point, 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship / Asteroid Bounce
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Reflect the ship off an asteroid impact with a recoil proportional
//          to the closing speed: a gentle tap -> soft bounce, a hard ram ->
//          hard bounce.
// Setup: Callers provide the ship and asteroid velocities, the unit normal from
//        asteroid toward ship, and an asteroid-size factor that controls how
//        much of the impact the asteroid absorbs.
// Issues: A fixed knockback impulse made every impact feel identical.
// Fix: Use the relative closing speed along the collision normal and a fixed
//      restitution to compute the new normal velocity for the ship, then give
//      the asteroid a scaled nudge in the opposite direction.
// Gotchas: Only applies the impulse when the two objects are closing; if they
//          are already separating, velocities are returned unchanged.
// ═══════════════════════════════════════════════════════════════════════════

export function resolveShipAsteroidBounce(
  shipVelocity: Vector2,
  asteroidVelocity: Vector2,
  normal: Vector2,
  asteroidBounce: number,
  restitution = 0.9,
): { shipVelocity: Vector2; asteroidVelocity: Vector2 } {
  const shipDot = shipVelocity.x * normal.x + shipVelocity.y * normal.y;
  const asteroidDot = asteroidVelocity.x * normal.x + asteroidVelocity.y * normal.y;
  const closingSpeed = shipDot - asteroidDot;

  if (closingSpeed >= 0) {
    return { shipVelocity, asteroidVelocity };
  }

  const newShipDot = shipDot - (1 + restitution) * closingSpeed;
  const newAsteroidDot = asteroidDot + closingSpeed * asteroidBounce;

  return {
    shipVelocity: {
      x: shipVelocity.x + (newShipDot - shipDot) * normal.x,
      y: shipVelocity.y + (newShipDot - shipDot) * normal.y,
    },
    asteroidVelocity: {
      x: asteroidVelocity.x + (newAsteroidDot - asteroidDot) * normal.x,
      y: asteroidVelocity.y + (newAsteroidDot - asteroidDot) * normal.y,
    },
  };
}
