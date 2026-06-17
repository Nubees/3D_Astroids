import * as THREE from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Asteroid Mesh
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Procedurally build asteroids for Phase 0 (Iron Slag neutral type).
// Setup: Called by Game with a size enum.
// Issues: None.
// Fix: Icosahedron with flat shading gives a classic low-poly rock look.
// Gotchas: Radii are tuned for the current camera distance; adjust if FOV changes.
// ═══════════════════════════════════════════════════════════════════════════

export enum AsteroidSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

const SIZE_RADIUS: Record<AsteroidSize, number> = {
  [AsteroidSize.SMALL]: 0.5,
  [AsteroidSize.MEDIUM]: 1.0,
  [AsteroidSize.LARGE]: 2.0,
};

export function createAsteroid(size: AsteroidSize): THREE.Group {
  const asteroid = new THREE.Group();
  const radius = SIZE_RADIUS[size];

  const geometry = new THREE.IcosahedronGeometry(radius, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x888888, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  asteroid.add(mesh);

  return asteroid;
}
