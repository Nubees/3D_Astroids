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
//          drift apart. Visual radius and collision radius are independent.
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

export function createAsteroidState(size: AsteroidSizeType, position: Vector2, velocity: Vector2): AsteroidState {
  return {
    position,
    velocity,
    size,
    health: SIZE_HEALTH[size],
  };
}

export function createAsteroidMesh(size: AsteroidSizeType): Group {
  const asteroid = new Group();
  const radius = SIZE_RADIUS[size];

  const geometry = new IcosahedronGeometry(radius, 0);
  const material = new MeshStandardMaterial({ color: 0xaaaaaa, flatShading: true });
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
    return createAsteroidState(childSize, state.position, velocity);
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
