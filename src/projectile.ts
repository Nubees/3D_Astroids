import { Vector2, Projectile } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Projectile Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure update logic for base-blaster projectiles.
// Setup: Game owns the Three.js meshes; this module owns the data + math.
// Issues: None.
// Fix: Created a plain data structure and update function so logic is testable.
//          Phase 7i Sprint 2 Task 5 — createProjectile now accepts an
//          optional `source` tag ('BULLET' default, 'BOMB' for bomb
//          shrapnel if added later, 'DRONE' for drone-fired projectiles).
//          The tag flows through to Projectile.source so downstream code
//          (handleCollisions → destroyAsteroid) can route drone kills
//          through spawn-on-kill VFX in a later task.
// Gotchas: Lifetime counts down in seconds; projectiles should be culled when
//          lifetime <= 0 or far off-screen. Pass-through of `source` is a
//          string literal union (NOT KillSource) because pulling
//          KillSource into projectile.ts would force a pickup.ts import —
//          keep projectile.ts free of pickup-specific logic.
// ═══════════════════════════════════════════════════════════════════════════

export const PROJECTILE_SPEED = 28;
export const PROJECTILE_LIFETIME = 1.8;
export const PROJECTILE_RADIUS = 0.12;

export function createProjectile(
  position: Vector2,
  direction: Vector2,
  source: 'BULLET' | 'BOMB' | 'DRONE' = 'BULLET',
): Projectile {
  return {
    position,
    velocity: {
      x: direction.x * PROJECTILE_SPEED,
      y: direction.y * PROJECTILE_SPEED,
    },
    lifetime: PROJECTILE_LIFETIME,
    maxLifetime: PROJECTILE_LIFETIME,
    source,
  };
}

export function updateProjectile(projectile: Projectile, deltaTime: number): void {
  projectile.position = {
    x: projectile.position.x + projectile.velocity.x * deltaTime,
    y: projectile.position.y + projectile.velocity.y * deltaTime,
  };
  projectile.lifetime -= deltaTime;
}

export function isProjectileDead(projectile: Projectile, boundsRadius: number): boolean {
  const outOfBounds = Math.hypot(projectile.position.x, projectile.position.y) > boundsRadius;
  return projectile.lifetime <= 0 || outOfBounds;
}
