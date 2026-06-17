import { Vector2, Vector3, Projectile } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Projectile Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure update logic for base-blaster projectiles.
// Setup: Game owns the Three.js meshes; this module owns the data + math.
// Issues: Phase 1 used Vector2 for everything. Phase 2 adds a Z axis for drift
//          mode depth, but projectiles still travel in the X/Y plane at z=0.
// Fix: Migrated Projectile state to Vector3; arena and drift both fire in the
//      aim direction while keeping z fixed at 0 for simple collision.
// Gotchas: Lifetime counts down in seconds; projectiles should be culled when
//          lifetime <= 0 or far off-screen. Drift-mode asteroids stream to z=0,
//          so projectiles at z=0 still intersect them at the danger plane.
// ═══════════════════════════════════════════════════════════════════════════

export const PROJECTILE_SPEED = 28;
export const PROJECTILE_LIFETIME = 1.8;
export const PROJECTILE_RADIUS = 0.12;

export function createProjectile(position: Vector3, direction: Vector2): Projectile {
  return {
    position: { ...position },
    velocity: {
      x: direction.x * PROJECTILE_SPEED,
      y: direction.y * PROJECTILE_SPEED,
      z: 0,
    },
    lifetime: PROJECTILE_LIFETIME,
    maxLifetime: PROJECTILE_LIFETIME,
  };
}

export function updateProjectile(projectile: Projectile, deltaTime: number): void {
  projectile.position = {
    x: projectile.position.x + projectile.velocity.x * deltaTime,
    y: projectile.position.y + projectile.velocity.y * deltaTime,
    z: projectile.position.z + projectile.velocity.z * deltaTime,
  };
  projectile.lifetime -= deltaTime;
}

export function isProjectileDead(projectile: Projectile, boundsRadius: number): boolean {
  const outOfBounds = Math.hypot(projectile.position.x, projectile.position.y) > boundsRadius;
  return projectile.lifetime <= 0 || outOfBounds;
}
