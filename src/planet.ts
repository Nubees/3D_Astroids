import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Distant Planet Beacon
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Give drift mode a static alignment target far ahead for legibility.
// Setup: Game creates one beacon and shows/hides it per movement mode.
// Issues: Without a horizon reference, pure star streaming can feel disorienting.
// Fix: Added a large, dim, distant planet mesh at a fixed far-Z position. It
//      does not move with the streaming asteroids/stars and only appears in drift.
// Gotchas: Keep it far enough (z < spawn plane) that it never collides. Use
//          low-poly geometry and a soft color so it reads as background, not an
//          interactive object.
// ═══════════════════════════════════════════════════════════════════════════

export const PLANET_Z = -140;
export const PLANET_RADIUS = 18;

export function createPlanetBeacon(): Group {
  const planet = new Group();
  const geometry = new IcosahedronGeometry(PLANET_RADIUS, 2);
  const material = new MeshStandardMaterial({
    color: 0x8844aa,
    roughness: 0.9,
    emissive: 0x221133,
    emissiveIntensity: 0.2,
    flatShading: true,
  });
  const mesh = new Mesh(geometry, material);
  planet.add(mesh);
  planet.position.set(0, -8, PLANET_Z);
  return planet;
}
