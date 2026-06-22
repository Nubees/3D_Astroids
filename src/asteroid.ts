import {
  BufferGeometry,
  Group,
  IcosahedronGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import {
  AsteroidSize as AsteroidSizeType,
  AsteroidState,
  AsteroidKind,
  Vector2,
} from './types';

export { AsteroidSize, AsteroidKind } from './types';

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
//          Phase 6 added AsteroidKind. Crystals are LARGE-only with 6 HP and an
//          emissive cyan material. When their health first drops below 30% of
//          maxHealth they fracture — markCrystalFractured() returns true on the
//          transition frame so the Game can spawn shards exactly once.
//          Geometry detail level is split by kind: iron uses level 0 (chunky
//          jagged silhouette, the original "Iron Slag" look); crystals use level 1
//          for a smoother faceted gem. Setting iron to level 1 made it look like
//          a smooth ball — keep them split.
//          Phase 6b bumped crystal detail from 1 → 2 so vertex perturbation has
//          enough vertices to read as proper fracture damage. Added
//          swapToCrackedMaterial and perturbCrystalGeometry helpers; cracked
//          material + texture are stashed in mesh.userData and disposed by the
//          extended disposeAsteroidMesh.
// ═══════════════════════════════════════════════════════════════════════════

export const SIZE_RADIUS: Record<AsteroidSizeType, number> = {
  [AsteroidSizeType.TINY]: 0.25,
  [AsteroidSizeType.SMALL]: 0.55,
  [AsteroidSizeType.MEDIUM]: 1.1,
  [AsteroidSizeType.LARGE]: 2.2,
};

const SIZE_HEALTH: Record<AsteroidSizeType, number> = {
  [AsteroidSizeType.TINY]: 1,
  [AsteroidSizeType.SMALL]: 1,
  [AsteroidSizeType.MEDIUM]: 2,
  [AsteroidSizeType.LARGE]: 4,
};

const CRYSTAL_HEALTH = 6;

export const CRYSTAL_THRESHOLD = 0.3;

export function createAsteroidState(
  size: AsteroidSizeType,
  position: Vector2,
  velocity: Vector2,
  isTargeted = false,
  kind: AsteroidKind = AsteroidKind.IRON,
): AsteroidState {
  const maxHealth = kind === AsteroidKind.CRYSTAL ? CRYSTAL_HEALTH : SIZE_HEALTH[size];
  return {
    position,
    velocity,
    size,
    health: maxHealth,
    maxHealth,
    isTargeted,
    kind,
    fractured: false,
  };
}

export function createAsteroidMesh(
  size: AsteroidSizeType,
  isTargeted = false,
  kind: AsteroidKind = AsteroidKind.IRON,
): Group {
  const asteroid = new Group();
  const radius = SIZE_RADIUS[size];

  // Detail level 0 = chunky jagged iron-slag silhouette (80 large triangles).
  // Crystals get detail level 2 for a smoother faceted gem with enough
  // vertices for the Phase 6b vertex perturbation to read as proper fracture
  // damage. Detail level 1 made crystals look like a smooth ball — keep them
  // split across both kinds.
  const detailLevel = kind === AsteroidKind.CRYSTAL ? 2 : 0;
  const geometry = new IcosahedronGeometry(radius, detailLevel);
  let color: number;
  let emissive: number;
  if (kind === AsteroidKind.CRYSTAL) {
    color = 0x55ccdd;
    emissive = 0x114455;
  } else if (isTargeted) {
    color = 0xcc4444;
    emissive = 0x441111;
  } else {
    color = 0xaaaaaa;
    emissive = 0x000000;
  }
  const material = new MeshStandardMaterial({
    color,
    emissive,
    flatShading: true,
  });
  const mesh = new Mesh(geometry, material);
  asteroid.add(mesh);

  return asteroid;
}

/**
 * Crystal threshold check. Returns true if the asteroid is a crystal whose health
 * has just crossed below CRYSTAL_THRESHOLD * maxHealth AND it has not yet fractured.
 * Caller must set `fractured = true` when this returns true.
 */
export function shouldCrystalFracture(state: AsteroidState): boolean {
  if (state.kind !== AsteroidKind.CRYSTAL) return false;
  if (state.fractured) return false;
  return state.health / state.maxHealth < CRYSTAL_THRESHOLD;
}

export function splitAsteroid(state: AsteroidState): AsteroidState[] {
  if (state.size === AsteroidSizeType.SMALL || state.size === AsteroidSizeType.TINY) {
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

/**
 * Split a small asteroid into two tiny pieces (used when a small asteroid
 * survives a shield impact).
 */
export function splitSmallAsteroid(state: AsteroidState): AsteroidState[] {
  if (state.size !== AsteroidSizeType.SMALL) {
    return [];
  }

  const outwardSpeed = 2.5;
  const baseAngle = Math.random() * Math.PI * 2;

  return [0, 1].map((index) => {
    const angle = baseAngle + index * Math.PI;
    const velocity = {
      x: state.velocity.x + Math.cos(angle) * outwardSpeed,
      y: state.velocity.y + Math.sin(angle) * outwardSpeed,
    };
    return createAsteroidState(AsteroidSizeType.TINY, state.position, velocity, false);
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
  // Crystal cracked state lives on userData; dispose it here so the GPU sees
  // no leaks when a crystal is destroyed or culled out of bounds.
  const userData = mesh.userData as CrystalMeshUserData;
  if (userData.crackedMaterial) {
    userData.crackedMaterial.dispose();
    userData.crackedMaterial = undefined;
  }
  if (userData.crackedTexture) {
    userData.crackedTexture.dispose();
    userData.crackedTexture = undefined;
  }
}

/**
 * Crystal-specific mesh state stored on `mesh.userData`. Defined here so the
 * Game, the asteroid disposal, and any future crystal visual code share one
 * shape.
 */
export interface CrystalMeshUserData {
  crackedMaterial?: MeshStandardMaterial;
  crackedTexture?: import('three').CanvasTexture;
  shakeSeed?: number;
}

/**
 * Perturb each vertex of a crystal mesh outward along its face normal by a
 * random ±amplitude × radius. Deterministic per `seed` so the same crystal id
 * produces the same fracture pattern. Mutates the mesh's inner Mesh geometry
 * in place.
 *
 * IcosahedronGeometry (parent: PolyhedronGeometry) is non-indexed by
 * construction in Three.js — we do NOT call toNonIndexed() because it is a
 * no-op that warns. We recompute vertex normals and bounding sphere so the
 * shader's flat shading still reads and collision stays accurate.
 */
export function perturbCrystalGeometry(
  mesh: Group,
  amplitude: number,
  seed: number,
): void {
  const inner = mesh.children[0];
  if (!(inner instanceof Mesh)) return;
  const geometry = inner.geometry as BufferGeometry;
  const position = geometry.getAttribute('position');
  if (!position) return;

  const rng = mulberry32(seed);
  // Cache the original positions so the perturbation is deterministic from
  // the seed alone, not from accumulating randomness frame-over-frame.
  const originalX = new Float32Array(position.array as Float32Array);
  const originalY = new Float32Array(position.count);
  const originalZ = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    originalY[i] = (position.array as Float32Array)[i * 3 + 1];
    originalZ[i] = (position.array as Float32Array)[i * 3 + 2];
  }

  // Use the average of the geometry's bounding sphere to derive a scale
  // factor, since crystal radius varies by asteroid size.
  geometry.computeBoundingSphere();
  const baseRadius = geometry.boundingSphere?.radius ?? 1.0;

  for (let i = 0; i < position.count; i += 1) {
    const ox = originalX[i];
    const oy = originalY[i];
    const oz = originalZ[i];
    const len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
    const nx = ox / len;
    const ny = oy / len;
    const nz = oz / len;
    const delta = (rng() * 2 - 1) * amplitude * baseRadius;
    (position.array as Float32Array)[i * 3] = ox + nx * delta;
    (position.array as Float32Array)[i * 3 + 1] = oy + ny * delta;
    (position.array as Float32Array)[i * 3 + 2] = oz + nz * delta;
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/**
 * Swap the crystal mesh's material to a cracked-cyan variant. Disposes the
 * original MeshStandardMaterial BEFORE assigning so we do not leak GPU
 * resources. Cracked material + texture are stashed in userData for cleanup.
 */
export function swapToCrackedMaterial(
  mesh: Group,
  crackedMaterial: MeshStandardMaterial,
  crackedTexture: import('three').CanvasTexture,
): void {
  const inner = mesh.children[0];
  if (!(inner instanceof Mesh)) return;
  const original = inner.material;
  inner.material = crackedMaterial;
  if (original instanceof Material) {
    original.dispose();
  }
  const userData = mesh.userData as CrystalMeshUserData;
  userData.crackedMaterial = crackedMaterial;
  userData.crackedTexture = crackedTexture;
}

/**
 * Mulberry32 seeded RNG. Produces deterministic floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
