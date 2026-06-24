import {
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three';
import { AsteroidState, Vector2 } from './types';
import {
  HOMING_MISSILES_DAMAGE,
  HOMING_MISSILES_SPEED,
  HOMING_MISSILES_TRACKING_DURATION,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_TURN_RATE,
  HOMING_MISSILES_VOLLEY_COUNT,
  ORBIT_DRONES_DAMAGE,
  ORBIT_DRONES_DRONE_COUNT,
  ORBIT_DRONES_DURATION_SECONDS,
  ORBIT_DRONES_FADE_OUT_SECONDS,
  ORBIT_DRONES_FIRE_INTERVAL_SECONDS,
  ORBIT_DRONES_ORBIT_PERIOD_SECONDS,
  ORBIT_DRONES_ORBIT_RADIUS,
  ORBIT_DRONES_TARGET_RADIUS,
  PICKUP_COLOR,
  PickupKind,
} from './pickups';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Active Deployments (Phase 7 DIAL-UP)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Owns the per-frame state for the 2 deployable active pickup
//          kinds (Orbit Drones + Homing Missiles). Kept out of game.ts so
//          that file does not grow past 2300 lines.
// Setup:   Game owns `activeDeployments` and `homingMissiles` arrays. Each
//          frame, Game calls tickDroneDeployments and tickHomingMissiles.
// Issues:  None.
// Fix:     Phase 7 DIAL-UP. Drones and missiles both reuse the existing
//          fireProjectile path; the only new meshes are the satellite
//          drones (IcosahedronGeometry + emissive cyan MeshStandardMaterial)
//          and missile trails (MeshBasicMaterial).
// Gotchas: Drone cooldown starts AFTER the 6s active window expires, not
//          at press time — the Game enforces this by setting the cooldown
//          when the deployment is culled, not when it is spawned.
//          Missiles track the NEAREST asteroid in HOMING_MISSILES_TRACKING_RADIUS
//          each frame; if none in range, they fly straight.
// ═══════════════════════════════════════════════════════════════════════════

export interface DroneDeploymentState {
  remaining: number;
  droneMeshes: Mesh[];
  phase: number;
  fireTimer: number;
  fadeTimer: number; // 0 = active, > 0 = fading out
}

export interface HomingMissileState {
  position: Vector2;
  velocity: Vector2;
  remaining: number;
  mesh: Mesh;
}

const ORBIT_ANGULAR_SPEED = (2 * Math.PI) / ORBIT_DRONES_ORBIT_PERIOD_SECONDS;
const FADE_FRAME_SCALE = 0.95;

/**
 * Find the closest asteroid to `position` within `maxRadius`. Returns
 * null if none in range. Used by both drone auto-fire and missile tracking.
 */
export function findNearestAsteroid(
  position: Vector2,
  asteroids: AsteroidState[],
  maxRadius: number,
): AsteroidState | null {
  let nearest: AsteroidState | null = null;
  let nearestDistance = maxRadius;
  for (const a of asteroids) {
    const d = Math.hypot(a.position.x - position.x, a.position.y - position.y);
    if (d <= nearestDistance) {
      nearest = a;
      nearestDistance = d;
    }
  }
  return nearest;
}

export function spawnDroneDeployment(
  shipPosition: Vector2,
  scene: Object3D,
): DroneDeploymentState {
  const meshes: Mesh[] = [];
  const cyanColor = PICKUP_COLOR[PickupKind.ORBIT_DRONES];
  for (let i = 0; i < ORBIT_DRONES_DRONE_COUNT; i++) {
    const geometry = new IcosahedronGeometry(0.12, 0);
    const material = new MeshStandardMaterial({
      color: cyanColor,
      emissive: cyanColor,
      emissiveIntensity: 0.8,
      flatShading: true,
    });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(shipPosition.x, shipPosition.y, 0);
    scene.add(mesh);
    meshes.push(mesh);
  }
  return {
    remaining: ORBIT_DRONES_DURATION_SECONDS,
    droneMeshes: meshes,
    phase: 0,
    fireTimer: 0,
    fadeTimer: 0,
  };
}

/**
 * Tick all live drone deployments. Mutates `deployments` in place: culls
 * expired ones (after fade-out completes), updates mesh positions, fires
 * drone projectiles at the nearest asteroid.
 *
 * Returns the pruned list. Caller replaces its array with the return.
 */
export function tickDroneDeployments(
  deployments: DroneDeploymentState[],
  shipPosition: Vector2,
  asteroids: AsteroidState[],
  deltaTime: number,
  scene: Object3D,
  onDroneFire: (origin: Vector2, target: AsteroidState) => void,
): DroneDeploymentState[] {
  const alive: DroneDeploymentState[] = [];
  for (const dep of deployments) {
    if (dep.fadeTimer > 0) {
      // Fading out — shrink and dispose after FADE_OUT_SECONDS.
      for (const mesh of dep.droneMeshes) {
        mesh.scale.multiplyScalar(FADE_FRAME_SCALE);
      }
      dep.fadeTimer -= deltaTime;
      if (dep.fadeTimer <= 0) {
        // Dispose meshes.
        for (const mesh of dep.droneMeshes) {
          scene.remove(mesh);
          mesh.geometry.dispose();
          const mat = mesh.material;
          if (mat instanceof MeshStandardMaterial) mat.dispose();
        }
        continue; // do not push to alive — deployment is done
      }
      alive.push(dep);
      continue;
    }
    dep.remaining -= deltaTime;
    if (dep.remaining <= 0) {
      // Start fade-out.
      dep.fadeTimer = ORBIT_DRONES_FADE_OUT_SECONDS;
      alive.push(dep);
      continue;
    }
    // Update orbital positions.
    dep.phase += ORBIT_ANGULAR_SPEED * deltaTime;
    for (let i = 0; i < dep.droneMeshes.length; i++) {
      const offset = i * Math.PI; // opposite sides
      const angle = dep.phase + offset;
      const x = shipPosition.x + Math.cos(angle) * ORBIT_DRONES_ORBIT_RADIUS;
      const y = shipPosition.y + Math.sin(angle) * ORBIT_DRONES_ORBIT_RADIUS;
      dep.droneMeshes[i].position.set(x, y, 0);
    }
    // Auto-fire at nearest target.
    dep.fireTimer += deltaTime;
    if (dep.fireTimer >= ORBIT_DRONES_FIRE_INTERVAL_SECONDS) {
      dep.fireTimer = 0;
      const target = findNearestAsteroid(shipPosition, asteroids, ORBIT_DRONES_TARGET_RADIUS);
      if (target) {
        // Pick the drone closer to the target for the projectile origin.
        let bestDrone = dep.droneMeshes[0];
        let bestDistance = Infinity;
        for (const mesh of dep.droneMeshes) {
          const d = Math.hypot(
            mesh.position.x - target.position.x,
            mesh.position.y - target.position.y,
          );
          if (d < bestDistance) {
            bestDistance = d;
            bestDrone = mesh;
          }
        }
        onDroneFire({ x: bestDrone.position.x, y: bestDrone.position.y }, target);
      }
    }
    alive.push(dep);
  }
  return alive;
}

const VOLLEY_HALF_SPREAD = 0.225; // ~13° — matches spec's `±0.225 rad fan pattern`
const MISSILE_RADIUS = 0.12;

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Homing Missiles (Task 7)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: spawnMissileVolley + tickHomingMissiles implement the per-frame
//          behavior of the HOMING_MISSILES active pickup. Fan-spread volley
//          + nearest-asteroid tracking + 0.3-unit impact radius.
// Setup:   Game owns `homingMissiles: HomingMissileState[]`; calls
//          spawnMissileVolley on fire and tickHomingMissiles each frame.
// Issues:  None.
// Fix:     Phase 7 Task 7. Volley spread formula
//          `(i - (N-1)/2) * (VOLLEY_HALF_SPREAD / 1.5)` yields ±0.225 rad
//          outer edge for N=4. Tracking lerp is unit-velocity → unit-velocity
//          by min(1, TURN_RATE * dt), then renormalized * SPEED — preserves
//          speed across turns.
// Gotchas: Vector2 is readonly in this codebase — must construct new objects
//          rather than mutating `.x`/`.y`. Impact radius is hard-coded at 0.3
//          (the plan's value, deliberately small so missiles pass through
//          small gaps between asteroids). `HOMING_MISSILES_DAMAGE` is
//          imported for documentation only — actual decrement lives in
//          Game (Task 12).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Spawn a fan of missiles from ship position, aimed at `aimDir` (unit vector).
 * Returns the array of HomingMissileState (caller pushes into its live list).
 */
export function spawnMissileVolley(
  shipPosition: Vector2,
  aimDir: Vector2,
  scene: Object3D,
): HomingMissileState[] {
  const missiles: HomingMissileState[] = [];
  const magentaColor = PICKUP_COLOR[PickupKind.HOMING_MISSILES];
  for (let i = 0; i < HOMING_MISSILES_VOLLEY_COUNT; i++) {
    const spread = (i - (HOMING_MISSILES_VOLLEY_COUNT - 1) / 2) * (VOLLEY_HALF_SPREAD / 1.5);
    // Rotate aimDir by `spread` radians.
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const vx = aimDir.x * cos - aimDir.y * sin;
    const vy = aimDir.x * sin + aimDir.y * cos;
    const geometry = new SphereGeometry(MISSILE_RADIUS, 6, 6);
    const material = new MeshBasicMaterial({ color: magentaColor });
    const mesh = new Mesh(geometry, material);
    mesh.position.set(shipPosition.x, shipPosition.y, 0);
    scene.add(mesh);
    missiles.push({
      position: { x: shipPosition.x, y: shipPosition.y },
      velocity: { x: vx * HOMING_MISSILES_SPEED, y: vy * HOMING_MISSILES_SPEED },
      remaining: HOMING_MISSILES_TRACKING_DURATION,
      mesh,
    });
  }
  return missiles;
}

/**
 * Tick all live missiles. Applies tracking steering, integrates position,
 * checks asteroid collision (simple hypot < 0.3), and removes expired or
 * impacted missiles. Calls `onMissileImpact(asteroid)` on hit so the caller
 * can decrement the asteroid's health and trigger destruction.
 */
export function tickHomingMissiles(
  missiles: HomingMissileState[],
  asteroids: AsteroidState[],
  deltaTime: number,
  scene: Object3D,
  onMissileImpact: (asteroid: AsteroidState) => void,
): HomingMissileState[] {
  const alive: HomingMissileState[] = [];
  for (const missile of missiles) {
    missile.remaining -= deltaTime;
    if (missile.remaining <= 0) {
      scene.remove(missile.mesh);
      missile.mesh.geometry.dispose();
      const mat = missile.mesh.material;
      if (mat instanceof MeshBasicMaterial) mat.dispose();
      continue;
    }
    // Apply tracking steering.
    const target = findNearestAsteroid(
      missile.position,
      asteroids,
      HOMING_MISSILES_TRACKING_RADIUS,
    );
    if (target) {
      const desiredX = target.position.x - missile.position.x;
      const desiredY = target.position.y - missile.position.y;
      const desiredLength = Math.hypot(desiredX, desiredY);
      if (desiredLength > 0.01) {
        const dx = desiredX / desiredLength;
        const dy = desiredY / desiredLength;
        const currentLength = Math.hypot(missile.velocity.x, missile.velocity.y);
        if (currentLength > 0.01) {
          const cx = missile.velocity.x / currentLength;
          const cy = missile.velocity.y / currentLength;
          // Lerp current toward desired by TURN_RATE * deltaTime (clamped to 1).
          const t = Math.min(1, HOMING_MISSILES_TURN_RATE * deltaTime);
          const newX = cx + (dx - cx) * t;
          const newY = cy + (dy - cy) * t;
          const newLength = Math.hypot(newX, newY);
          if (newLength > 0.01) {
            missile.velocity = {
              x: (newX / newLength) * HOMING_MISSILES_SPEED,
              y: (newY / newLength) * HOMING_MISSILES_SPEED,
            };
          }
        }
      }
    }
    // Integrate position.
    missile.position = {
      x: missile.position.x + missile.velocity.x * deltaTime,
      y: missile.position.y + missile.velocity.y * deltaTime,
    };
    missile.mesh.position.set(missile.position.x, missile.position.y, 0);
    // Check asteroid collision.
    const hit = findNearestAsteroid(missile.position, asteroids, 0.3);
    if (hit) {
      onMissileImpact(hit);
      scene.remove(missile.mesh);
      missile.mesh.geometry.dispose();
      const mat = missile.mesh.material;
      if (mat instanceof MeshBasicMaterial) mat.dispose();
      continue;
    }
    alive.push(missile);
  }
  return alive;
}
