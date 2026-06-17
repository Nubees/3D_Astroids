import { Vector2, Vector3, Projectile } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Projectile Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure update logic for base-blaster projectiles.
// Setup: Game owns the Three.js meshes; this module owns the data + math.
// Issues: Phase 1 used Vector2 for everything. Phase 2 adds a Z axis for drift
//          mode depth. Latest iteration needs drift shots to travel into the
//          screen (-Z) with a small X/Y spread from mouse aim.
// Fix: Kept arena createProjectile unchanged; added createDriftProjectile that
//      fires forward into the screen plus a horizontal bias toward the mouse.
// Gotchas: Lifetime counts down in seconds; projectiles should be culled when
//          lifetime <= 0 or far off-screen or far down -Z. Arena uses XY bounds;
//          drift adds a -Z bound.
// ═══════════════════════════════════════════════════════════════════════════

export const PROJECTILE_SPEED = 28;
export const PROJECTILE_LIFETIME = 1.8;
export const PROJECTILE_RADIUS = 0.12;
export const DRIFT_PROJECTILE_FORWARD_SPEED = 24;
export const DRIFT_PROJECTILE_SPREAD = 4;

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

export function createDriftProjectile(position: Vector3, aimOffset: Vector2, forwardSpeed: number): Projectile {
  const horizontalLength = Math.hypot(aimOffset.x, aimOffset.y);
  const normalizedX = horizontalLength > 0.001 ? aimOffset.x / horizontalLength : 0;
  const normalizedY = horizontalLength > 0.001 ? aimOffset.y / horizontalLength : 0;

  return {
    position: { ...position },
    velocity: {
      x: normalizedX * DRIFT_PROJECTILE_SPREAD,
      y: normalizedY * DRIFT_PROJECTILE_SPREAD,
      z: -forwardSpeed,
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
  const outOfBoundsXY = Math.hypot(projectile.position.x, projectile.position.y) > boundsRadius;
  const outOfBoundsZ = projectile.position.z < -boundsRadius;
  return projectile.lifetime <= 0 || outOfBoundsXY || outOfBoundsZ;
}
