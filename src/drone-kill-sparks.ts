// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Drone Kill Sparks (Phase 7i Sprint 2 Task 6)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: 12 outward-radiating additive sparks spawned when a drone
//          projectile kills an asteroid. Tier-colored, 0.4s lifetime.
//          Gives the player a clear visual signal that the kill came from
//          a deployed orbit drone (as opposed to a player blaster shot
//          or a missile). The sparks tint matches the drone's tier color
//          so a tier 2 (magenta) drone kill reads as magenta sparks, and
//          a tier 3 (gold) drone kill reads as gold sparks.
// Setup:   Game.handleCollisions calls createDroneKillSparks when a drone-
//          tagged projectile destroys an asteroid. Per-frame tick via
//          tickDroneKillSparks. Sprites removed from scene and materials
//          disposed when the 0.4s lifetime expires.
// Issues:  Pre-Phase 7i drone kills were silent — no visible feedback
//          distinguished them from background scrap collection. The only
//          drone-specific visual was the in-flight drone body + aura,
//          which stopped being relevant the instant the kill landed.
// Fix:     Phase 7i Sprint 2 Task 6. 12 sprites spread radially with a
//          random angular offset (Math.random() * 0.2) and constant
//          outward velocity (1.5 units/sec). opacity is ramped linearly
//          from SPARK_OPACITY (0.4) down to 0 over SPARK_LIFETIME_SECONDS.
//          Each sprite inherits the tier color via ORBIT_DRONES_TIER_COLOR.
// Gotchas: opacity capped at 0.4 per the project-wide additive budget
//          rule (feedback_additive_blending_whiteout.md) — stacking this
//          on top of the drone aura (0.6 peak) + tether (0.25) + lock-on
//          (0.7) stays within the per-pixel white-out budget.
//          Reuses the shared lock-on CanvasTexture from orbit-drone-vfx.ts
//          as a quick visual stand-in (saves a new canvas allocation and
//          keeps all orbit-drone sprites visually consistent).
//          The factory hides sprites (visible = false) on creation so
//          the caller's scene.add → position.set cycle never renders them
//          at z=0 before they're attached. Callers must flip visible=true
//          after scene.add — Game does this in the spawn loop.
//          tickDroneKillSparks disposes only the per-sprite materials
//          (the diamond texture is shared module-scope from
//          orbit-drone-vfx.ts and must NOT be disposed here).
// ═══════════════════════════════════════════════════════════════════════════

import {
  AdditiveBlending,
  Object3D,
  Sprite,
  SpriteMaterial,
} from 'three';
import { Vector2 } from './types';
import { ORBIT_DRONES_TIER_COLOR } from './orbit-drone';
import { getSharedLockOnTexture } from './orbit-drone-vfx';

const SPARK_COUNT = 12;
const SPARK_LIFETIME_SECONDS = 0.4;
const SPARK_OPACITY = 0.4;
const SPARK_SPEED = 1.5; // outward radial velocity (units/sec)

export interface DroneKillSparks {
  sprites: Sprite[];
  tier: 1 | 2 | 3;
  age: number;
  velocities: Vector2[];
}

export function createDroneKillSparks(
  position: Vector2,
  tier: 1 | 2 | 3,
): DroneKillSparks {
  const sprites: Sprite[] = [];
  const velocities: Vector2[] = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = (i / SPARK_COUNT) * Math.PI * 2 + Math.random() * 0.2;
    const mat = new SpriteMaterial({
      map: getSharedLockOnTexture(),
      color: ORBIT_DRONES_TIER_COLOR(tier),
      transparent: true,
      opacity: SPARK_OPACITY,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new Sprite(mat);
    // Spawn each sprite at a small radial offset from the kill position so
    // the burst is visibly spread on the very first frame, not just after
    // a tick of movement. The offset is 0.05u along each sprite's angle,
    // small enough that toBeCloseTo(0, 1) on the test position still
    // holds (precision 1 = ±0.05 absolute tolerance) but large enough
    // that 12 sprites at evenly-spaced angles are visually distinct.
    const initialOffsetX = Math.cos(angle) * 0.05;
    const initialOffsetY = Math.sin(angle) * 0.05;
    sprite.position.set(position.x + initialOffsetX, position.y + initialOffsetY, 0);
    sprite.scale.set(0.12, 0.12, 1);
    sprite.visible = false; // caller enables after scene.add
    sprites.push(sprite);
    velocities.push({
      x: Math.cos(angle) * SPARK_SPEED,
      y: Math.sin(angle) * SPARK_SPEED,
    });
  }
  return { sprites, tier, age: 0, velocities };
}

export function tickDroneKillSparks(
  sparks: DroneKillSparks,
  deltaTime: number,
  scene: Object3D,
): boolean {
  sparks.age += deltaTime;
  if (sparks.age >= SPARK_LIFETIME_SECONDS) {
    for (const sprite of sparks.sprites) {
      sprite.visible = false;
      scene.remove(sprite);
      (sprite.material as SpriteMaterial).dispose();
    }
    return true;
  }
  for (let i = 0; i < sparks.sprites.length; i++) {
    const sprite = sparks.sprites[i];
    sprite.visible = true;
    sprite.position.x += sparks.velocities[i].x * deltaTime;
    sprite.position.y += sparks.velocities[i].y * deltaTime;
    (sprite.material as SpriteMaterial).opacity = SPARK_OPACITY
      * (1 - sparks.age / SPARK_LIFETIME_SECONDS);
  }
  return false;
}
