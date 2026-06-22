import {
  ConeGeometry,
  Mesh,
  MeshStandardMaterial,
} from 'three';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shard Mesh (Phase 6 Shard Swarm)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Thin stretched cyan cone that orients along its travel direction.
// Setup: One mesh per shard, created by Game when a shard is spawned.
// Issues: Three.js cone default points along +Y; we leave it that way and let
//         Game rotate via the shard's `angle` (atan2 of velocity → rotation Z).
// Fix:  Use a slim, faceted cone with strong emissive so the shard reads as
//       dangerous and matches the crystal material.
// Gotchas:
//  - Mesh rotation: shard.angle is the world-space travel angle (radians, 0 = +X).
//    `mesh.rotation.z = shard.angle - Math.PI / 2` aligns the cone tip to that
//    direction. Game.ts is responsible for that mapping.
//  - Geometry is shared via reuse — only one ConeGeometry / material is created
//    here; Game.ts must dispose the mesh (not the geometry/material) per shard
//    or share the material across all shards for cheaper rendering.
//  - SHARD_RADIUS (collision) is defined in shard.ts; visual radius here is a
//    visual choice — keep them in the same ballpark so shards hit where they look.
// ═══════════════════════════════════════════════════════════════════════════

const SHARD_LENGTH = 0.55;
const SHARD_RADIUS = 0.18;

const sharedGeometry = new ConeGeometry(SHARD_RADIUS, SHARD_LENGTH, 4, 1);
sharedGeometry.translate(0, SHARD_LENGTH / 2, 0); // pivot at base so tip aligns with rotation

const sharedMaterial = new MeshStandardMaterial({
  color: 0x66ddee,
  emissive: 0x224466,
  flatShading: true,
});

export function createShardMesh(): Mesh {
  return new Mesh(sharedGeometry, sharedMaterial);
}

/**
 * Apply shard orientation. The cone tip points along +Y by default; rotate so
 * the tip points along the shard's travel angle (0 = +X, π/2 = +Y).
 */
export function orientShard(mesh: Mesh, angle: number): void {
  mesh.rotation.z = angle - Math.PI / 2;
}