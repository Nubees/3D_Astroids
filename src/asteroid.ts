import {
  Group,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { AsteroidSize as AsteroidSizeType, AsteroidState, Vector2 } from './types';

export { AsteroidSize } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Asteroid Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Procedural Iron Slag asteroids with size tiers, health, and splitting.
// Setup: Game owns the Three.js meshes; this module owns the data + math.
// Issues: Phase 0 only built a static mesh; Phase 1 needs state and behavior.
// Fix: Added AsteroidState, size/health/radius mapping, and a pure split
//      function that returns child asteroids.
// Gotchas: Split pieces inherit parent momentum plus an outward impulse so they
//          drift apart. Visual radius and collision radius are independent. Targeted
//          asteroids (Asteroid no 4) ignore asteroid-vs-asteroid collisions so they
//          can home in on the player without being deflected.
// ═══════════════════════════════════════════════════════════════════════════

export const SIZE_RADIUS: Record<AsteroidSizeType, number> = {
  [AsteroidSizeType.SMALL]: 0.55,
  [AsteroidSizeType.MEDIUM]: 1.1,
  [AsteroidSizeType.LARGE]: 2.2,
};

const SIZE_HEALTH: Record<AsteroidSizeType, number> = {
  [AsteroidSizeType.SMALL]: 1,
  [AsteroidSizeType.MEDIUM]: 2,
  [AsteroidSizeType.LARGE]: 4,
};

export function createAsteroidState(
  size: AsteroidSizeType,
  position: Vector2,
  velocity: Vector2,
  isTargeted = false,
): AsteroidState {
  return {
    position,
    velocity,
    size,
    health: SIZE_HEALTH[size],
    isTargeted,
  };
}

export function createAsteroidMesh(size: AsteroidSizeType, isTargeted = false): Group {
  const asteroid = new Group();
  const radius = SIZE_RADIUS[size];

  const geometry = new IcosahedronGeometry(radius, 0);
  const color = isTargeted ? 0xcc4444 : 0xaaaaaa;
  const emissive = isTargeted ? 0x441111 : 0x000000;
  const material = new MeshStandardMaterial({
    color,
    emissive,
    flatShading: true,
  });
  const mesh = new Mesh(geometry, material);
  asteroid.add(mesh);

  return asteroid;
}

export function splitAsteroid(state: AsteroidState): AsteroidState[] {
  if (state.size === AsteroidSizeType.SMALL) {
    return [];
  }

  const childSize = state.size === AsteroidSizeType.LARGE ? AsteroidSizeType.MEDIUM : AsteroidSizeType.SMALL;
  const outwardSpeed = 2.0;
  const baseAngle = Math.random() * Math.PI * 2;

  return [0, 1].map((index) => {
    const angle = baseAngle + index * Math.PI;
    const velocity = {
      x: state.velocity.x + Math.cos(angle) * outwardSpeed,
      y: state.velocity.y + Math.sin(angle) * outwardSpeed,
    };
    // Split children are normal bouncing asteroids, never targeted.
    return createAsteroidState(childSize, state.position, velocity, false);
  });
}

export function disposeAsteroidMesh(mesh: Group): void {
  mesh.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material: Material) => material.dispose());
    }
  });
}

/**
 * Resolve a bounce between two asteroids.
 *
 * Rules:
 * - Targeted asteroids ignore asteroid-vs-asteroid collisions entirely.
 * - Same-size asteroids swap their normal velocity components (elastic equal mass).
 * - Different-size asteroids treat the larger one as immovable: only the smaller
 *   one's velocity and position change.
 */
export function resolveAsteroidCollision(a: AsteroidState, b: AsteroidState): void {
  if (a.isTargeted || b.isTargeted) return;

  const aRadius = SIZE_RADIUS[a.size];
  const bRadius = SIZE_RADIUS[b.size];
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const distance = Math.hypot(dx, dy);
  const minDistance = aRadius + bRadius;
  if (distance >= minDistance || distance === 0) return;

  const normalX = dx / distance;
  const normalY = dy / distance;
  const overlap = minDistance - distance;

  // Separate positions so asteroids do not stick together.
  if (a.size === b.size) {
    const halfOverlap = overlap / 2;
    a.position = {
      x: a.position.x - normalX * halfOverlap,
      y: a.position.y - normalY * halfOverlap,
    };
    b.position = {
      x: b.position.x + normalX * halfOverlap,
      y: b.position.y + normalY * halfOverlap,
    };
  } else {
    const larger = aRadius >= bRadius ? a : b;
    const smaller = aRadius >= bRadius ? b : a;
    const smallerNormalX = larger === a ? -normalX : normalX;
    const smallerNormalY = larger === a ? -normalY : normalY;
    // Only the smaller asteroid is pushed out of the collision; the larger stays put.
    smaller.position = {
      x: smaller.position.x + smallerNormalX * overlap,
      y: smaller.position.y + smallerNormalY * overlap,
    };
  }

  // Resolve velocities.
  const dotA = a.velocity.x * normalX + a.velocity.y * normalY;
  const dotB = b.velocity.x * normalX + b.velocity.y * normalY;

  if (a.size === b.size) {
    // Equal sizes: swap normal components.
    a.velocity = {
      x: a.velocity.x - dotA * normalX + dotB * normalX,
      y: a.velocity.y - dotA * normalY + dotB * normalY,
    };
    b.velocity = {
      x: b.velocity.x - dotB * normalX + dotA * normalX,
      y: b.velocity.y - dotB * normalY + dotA * normalY,
    };
  } else {
    // Different sizes: larger acts like an immovable wall for the smaller one.
    if (aRadius > bRadius) {
      const newBDot = 2 * dotA - dotB;
      b.velocity = {
        x: b.velocity.x - dotB * normalX + newBDot * normalX,
        y: b.velocity.y - dotB * normalY + newBDot * normalY,
      };
    } else {
      const newADot = 2 * dotB - dotA;
      a.velocity = {
        x: a.velocity.x - dotA * normalX + newADot * normalX,
        y: a.velocity.y - dotA * normalY + newADot * normalY,
      };
    }
  }
}
