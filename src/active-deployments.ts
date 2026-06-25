import {
  AdditiveBlending,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from 'three';
import { AsteroidState, Vector2 } from './types';
import {
  HOMING_MISSILES_DAMAGE,
  HOMING_MISSILES_MISSILE_IMPACT_RADIUS,
  HOMING_MISSILES_NEAR_TIER_COUNT,
  HOMING_MISSILES_SPEED,
  HOMING_MISSILES_TRACKING_DURATION,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_TURN_RATE,
  HOMING_MISSILES_VOLLEY_COUNT,
  HOMING_MISSILES_VOLLEY_STAGGER_MS,
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
import { createMissileAssembly, emitMissileSmokeRear } from './missile-vfx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Active Deployments (Phase 7 DIAL-UP / Phase 7b Power-Up VFX)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Owns the per-frame state for the 2 deployable active pickup
//          kinds (Orbit Drones + Homing Missiles). Kept out of game.ts so
//          that file does not grow past 2300 lines.
// Setup:   Game owns `activeDeployments`, `missileSchedules`, and
//          `homingMissiles` arrays. Each frame, Game calls
//          tickDroneDeployments + tickMissileVolleySchedules + tickHomingMissiles.
// Issues:  None.
// Fix:     Phase 7 DIAL-UP. Drones and missiles both reuse the existing
//          fireProjectile path; the only new meshes are the satellite
//          drones (IcosahedronGeometry + emissive cyan MeshStandardMaterial)
//          and missile trails (MeshBasicMaterial).
//          Phase 7b: missiles now spawn via a staggered VolleySchedule
//          (0/180/360/540ms) drained by tickMissileVolleySchedules; each
//          missile is a Group (body + flame cone) with per-frame flame
//          pulse and an InstancedMesh smoke trail (see src/missile-vfx.ts).
// Gotchas: Drone cooldown starts AFTER the 6s active window expires, not
//          at press time — the Game enforces this by setting the cooldown
//          when the deployment is culled, not when it is spawned.
//          Missiles track the NEAREST asteroid in HOMING_MISSILES_TRACKING_RADIUS
//          each frame; if none in range, they fly straight.
//          Missile impact radius is now HOMING_MISSILES_MISSILE_IMPACT_RADIUS
//          (0.45), not the old hard-coded 0.3.
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
  mesh: Mesh;          // sprite plane body (additive, DoubleSide, pre-shaded PNG)
  assembly: Group;     // sprite plane + flame cone, rotated to face velocity
  flame: Mesh;         // thruster flame cone (additive)
  volleyIndex: number; // 0..VOLLEY_COUNT-1; first NEAR_TIER_COUNT seek NEAREST, rest FARTHEST
  target: AsteroidState | null; // Phase 7d-3 — locked-on asteroid (sticky target). Re-picked via tier logic if destroyed by another missile.
  spawnTime: number;   // for firePulse oscillation
  firePulse: number;   // accumulates elapsed time for flicker
}

export interface PendingMissile {
  delayRemaining: number;
  spread: number; // angular offset from aim direction (radians)
  volleyIndex: number; // 0..VOLLEY_COUNT-1; first NEAR_TIER_COUNT seek NEAREST, rest FARTHEST
}

export interface VolleySchedule {
  remaining: number; // counts down to first launch (0 initially)
  pending: PendingMissile[]; // 6 entries in Phase 7c-2, in launch order
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

/**
 * Find the farthest asteroid from `position` within `maxRadius`. Returns
 * null if none in range. Used by Phase 7c-2 "far tier" missiles (volleyIndex
 * >= NEAR_TIER_COUNT) so the last 3 missiles in a 6-volley hit the back of
 * the arena instead of clustering on the near target.
 */
export function findFarthestAsteroid(
  position: Vector2,
  asteroids: AsteroidState[],
  maxRadius: number,
): AsteroidState | null {
  let farthest: AsteroidState | null = null;
  let farthestDistance = -1;
  for (const a of asteroids) {
    const d = Math.hypot(a.position.x - position.x, a.position.y - position.y);
    if (d <= maxRadius && d > farthestDistance) {
      farthest = a;
      farthestDistance = d;
    }
  }
  return farthest;
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

const VOLLEY_HALF_SPREAD = 0.06; // was 0.225 — narrower fan reads as a stream, not a shotgun

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Homing Missiles (Phase 7b / Phase 7c / Phase 7c-2)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: scheduleMissileVolley + tickMissileVolleySchedules +
//          tickHomingMissiles implement the per-frame behavior of the
//          HOMING_MISSILES active pickup. Staggered stream-of-missiles
//          volley + per-missile flame cone + InstancedMesh smoke trail.
// Setup:   Game owns `missileSchedules: VolleySchedule[]` and
//          `homingMissiles: HomingMissileState[]`; calls scheduleMissileVolley
//          on fire, tickMissileVolleySchedules + tickHomingMissiles each frame.
// Issues:  None.
// Fix:     Phase 7b. Replaces single-frame 4-missile fan with a 0/180/360/540ms
//          staggered schedule so the stream reads as a controllable burst, not
//          a shotgun. Each missile is now a Group (body sphere + flame cone)
//          rotated to face velocity each frame — flame reads as thruster
//          exhaust. Smoke trails come from a module-scope InstancedMesh pool
//          (see src/missile-vfx.ts) — one draw call regardless of missile
//          count. Impact radius bumped to 0.45 (was hard-coded 0.3) so the
//          bigger flame cone doesn't visually "miss" the asteroid it's
//          touching.
//          Phase 7c — body is now a Group of opaque core + additive halo
//          (see createMissileAssembly in src/missile-vfx.ts); smoke spawns at
//          the rear nozzle (emitMissileSmokeRear) so the trail is visually
//          distinct from the body silhouette.
//          Phase 7c-2 — body assembly now has 7 children (core + halo +
//          noseTip cone + 4 rear fins); 6-missile volley with tier targeting:
//          first NEAR_TIER_COUNT (3) seek NEAREST, last (3) seek FARTHEST
//          within TRACKING_RADIUS. Disposal consolidated into disposeMissileState
//          helper called from BOTH the expiry path and the impact path.
//          Phase 7d-3 — STICKY TARGET. Each missile picks its target ONCE
//          (on the first frame, via the same tier logic) and locks that
//          target for the rest of its flight, re-picking only if the
//          locked target is removed from the asteroid list (i.e. killed
//          by another missile or by the bomb). Previously every missile
//          re-ran findNearest/findFarthest every frame, which meant all
//          3 near-tier missiles in a volley converged on the SAME asteroid
//          (they all spawn co-located on the ship). With stickiness, by
//          the time each missile's first lock fires, the missile has
//          drifted along its angular-spread offset and sees a different
//          "nearest" than its siblings — so the 3-missile tier hits 3
//          different asteroids. Impact check now uses the LOCKED target
//          (not findNearestAsteroid against IMPACT_RADIUS) so we can never
//          hit a different asteroid than the one the missile is steering
//          toward. MISSILE_IMPACT_RADIUS bumped 0.45→0.95 so the stretched
//          body (0.18u × 2.5× = 0.45u visual half-length) doesn't visually
//          fly THROUGH asteroids before the impact check fires.
// Gotchas: Vector2 is readonly in this codebase — must construct new objects
//          rather than mutating `.x`/`.y`. The spread formula is now
//          narrower (VOLLEY_HALF_SPREAD=0.06 / 1.5) because the schedule's
//          natural time-spreading already provides lateral coverage; the fan
//          only needs to handle tiny inaccuracy. `HOMING_MISSILES_DAMAGE` is
//          imported for documentation only — actual decrement lives in Game
//          (Task 12). `scheduleMissileVolley` is called once on fire and
//          pushed into a schedules array; the array is culled each frame by
//          tickMissileVolleySchedules once all 6 missiles have spawned.
//          disposeMissileState removes the assembly Group from the scene
//          FIRST, then disposes mesh geometry/material for body, halo,
//          flame, noseTip, and each of the 4 fins. The 4 fins share ONE
//          material (createMissileFins in src/missile-vfx.ts); calling
//          dispose() 4 times on the same material is safe — three.js dispose
//          is idempotent on already-disposed materials. PendingMissile now
//          carries `volleyIndex` so the schedule tick can pass it through to
//          the live HomingMissileState (used for tier targeting).
//          Phase 7e — sprite missile integration. HomingMissileState drops
//          core/halo/noseTip/fins fields; mesh now holds the sprite plane.
//          spawnMissileFromPending simplified accordingly. disposeMissileState
//          disposes only mesh + flame + their materials. The texture itself
//          is module-scope and shared, so we do NOT dispose it per-missile
//          (would break subsequent volleys). Flight-rotation adds `- π/2`:
//          cyan tip is at PNG +Y; we want it to point along velocity (+X
//          when flying right). atan2(vy,vx) gives velocity angle from +X;
//          `rotation.z = velocity_angle - π/2` rotates plane so +Y of plane
//          = velocity direction.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a staggered VolleySchedule for the next 6 missiles (Phase 7c-2).
 * Each PendingMissile carries its own delayRemaining (seconds), angular
 * spread, and volleyIndex (0..VOLLEY_COUNT-1, used for tier targeting in
 * tickHomingMissiles). Caller pushes the schedule into its live schedules
 * array; tickMissileVolleySchedules drains it over the next 900ms.
 */
export function scheduleMissileVolley(shipPosition: Vector2, aimDir: Vector2): VolleySchedule {
  const pending: PendingMissile[] = [];
  for (let i = 0; i < HOMING_MISSILES_VOLLEY_COUNT; i++) {
    pending.push({
      delayRemaining: (i * HOMING_MISSILES_VOLLEY_STAGGER_MS) / 1000,
      spread: (i - (HOMING_MISSILES_VOLLEY_COUNT - 1) / 2) * (VOLLEY_HALF_SPREAD / 1.5),
      volleyIndex: i,
    });
  }
  return { remaining: 0, pending };
}

function spawnMissileFromPending(
  pending: PendingMissile,
  volleyIndex: number,
  shipPosition: Vector2,
  aimDir: Vector2,
  scene: Object3D,
  spawnTime: number,
): HomingMissileState {
  // Rotate aimDir by pending.spread.
  const cos = Math.cos(pending.spread);
  const sin = Math.sin(pending.spread);
  const vx = aimDir.x * cos - aimDir.y * sin;
  const vy = aimDir.x * sin + aimDir.y * cos;

  // Body assembly (sprite plane + flame cone) — Phase 7e
  const { assembly, mesh, flame } = createMissileAssembly();

  assembly.position.set(shipPosition.x, shipPosition.y, 0);
  // Initial rotation to face velocity (cyan tip at PNG +Y → -π/2 aligns +Y
  // with velocity direction).
  assembly.rotation.z = Math.atan2(vy, vx) - Math.PI / 2;
  scene.add(assembly);

  return {
    position: { x: shipPosition.x, y: shipPosition.y },
    velocity: { x: vx * HOMING_MISSILES_SPEED, y: vy * HOMING_MISSILES_SPEED },
    remaining: HOMING_MISSILES_TRACKING_DURATION,
    mesh,
    assembly,
    flame,
    volleyIndex,
    // Phase 7d-3 — target is locked on the FIRST tickHomingMissiles frame
    // via tier logic (near vs far) so each missile picks a DIFFERENT asteroid
    // (near-tier missiles see different relative distances after they spread,
    // far-tier missiles see different relative distances too). Setting null
    // here keeps the spawn function free of asteroid-list coupling.
    target: null,
    spawnTime,
    firePulse: 0,
  };
}

export function tickMissileVolleySchedules(
  schedules: VolleySchedule[],
  shipPosition: Vector2,
  aimDir: Vector2,
  deltaTime: number,
  scene: Object3D,
  activeMissiles: HomingMissileState[],
): VolleySchedule[] {
  const alive: VolleySchedule[] = [];
  const gameTime = performance.now() / 1000;
  for (const schedule of schedules) {
    const stillPending: PendingMissile[] = [];
    for (const pending of schedule.pending) {
      pending.delayRemaining -= deltaTime;
      if (pending.delayRemaining <= 0) {
        activeMissiles.push(
          spawnMissileFromPending(
            pending,
            pending.volleyIndex,
            shipPosition,
            aimDir,
            scene,
            gameTime,
          ),
        );
      } else {
        stillPending.push(pending);
      }
    }
    schedule.pending = stillPending;
    if (schedule.pending.length > 0) {
      alive.push(schedule);
    }
  }
  return alive;
}

/**
 * Unmount a homing missile and dispose all its GPU resources. Removes the
 * assembly Group from the scene FIRST (so its children are detached before
 * we dispose their geometry/material), then disposes the sprite plane mesh
 * and flame cone in turn.
 *
 * Internal helper — not exported. Used by both the expiry path
 * (missile.remaining <= 0) and the impact path (collision with asteroid).
 *
 * The texture itself is module-scope and shared, so we do NOT dispose it
 * per-missile (would break subsequent volleys). See src/missile-vfx.ts
 * disposeMissileVfx for the smoke-pool cleanup.
 */
function disposeMissileState(missile: HomingMissileState, scene: Object3D): void {
  scene.remove(missile.assembly);
  missile.mesh.geometry.dispose();
  (missile.mesh.material as MeshBasicMaterial).dispose();
  missile.flame.geometry.dispose();
  (missile.flame.material as MeshBasicMaterial).dispose();
}

/**
 * Tick all live missiles. Applies tracking steering, rotates the assembly to
 * face velocity, pulses the flame cone, emits smoke, integrates position,
 * and checks asteroid collision. Calls `onMissileImpact(asteroid)` on hit so
 * the caller can decrement the asteroid's health and trigger destruction.
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
      disposeMissileState(missile, scene);
      continue;
    }
    // Apply tracking steering — Phase 7c-2 tier targeting + Phase 7d-3 stickiness.
    // First NEAR_TIER_COUNT missiles in the volley seek the NEAREST asteroid
    // (close-in kill); the rest (volleyIndex >= NEAR_TIER_COUNT) seek the
    // FARTHEST in radius so the back half of a 6-volley reaches the back of
    // the arena instead of all clustering on the near target.
    //
    // STICKY TARGET — the target is locked ONCE (on the first frame the missile
    // has no target) and stays locked until that asteroid is removed from the
    // list (typically destroyed by another missile in the volley). This is
    // what makes the 3 near-tier missiles pick 3 DIFFERENT asteroids: at spawn
    // they're co-located so all would pick the same nearest — but by the time
    // their target lock fires (frame 1), they've already spread along their
    // different angular spreads, so each sees a different "nearest" asteroid.
    // Same trick for far-tier.
    if (missile.target === null || !asteroids.includes(missile.target)) {
      missile.target = missile.volleyIndex < HOMING_MISSILES_NEAR_TIER_COUNT
        ? findNearestAsteroid(
            missile.position,
            asteroids,
            HOMING_MISSILES_TRACKING_RADIUS,
          )
        : findFarthestAsteroid(
            missile.position,
            asteroids,
            HOMING_MISSILES_TRACKING_RADIUS,
          );
    }
    const target = missile.target;
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
    missile.assembly.position.set(missile.position.x, missile.position.y, 0);
    // Phase 7e — sprite missile: cyan tip is at PNG +Y. We want it to lead
    // the velocity direction. atan2(vy, vx) returns the velocity angle from
    // +X; rotating the plane by (velocity_angle - π/2) makes the plane's
    // local +Y point along the velocity. (See src/missile-vfx.ts My Rules.)
    missile.assembly.rotation.z = Math.atan2(missile.velocity.y, missile.velocity.x) - Math.PI / 2;
    // Flame pulse: opacity flickers at ~5 Hz, scale flickers at ~6 Hz
    missile.firePulse += deltaTime;
    (missile.flame.material as MeshBasicMaterial).opacity = 0.65 + 0.1 * Math.sin(missile.firePulse * 30);
    const flameScale = 0.9 + 0.2 * Math.sin(missile.firePulse * 40);
    missile.flame.scale.set(flameScale, 1, 1);
    // Emit smoke at the rear nozzle (behind body along velocity direction).
    emitMissileSmokeRear(scene, missile.position.x, missile.position.y,
      missile.velocity.x, missile.velocity.y);
    // Check asteroid collision against the LOCKED target only.
    // Phase 7d-3 — previously used findNearestAsteroid(...IMPACT_RADIUS), which
    // could hit a different asteroid than the one the missile is steering
    // toward. With a sticky lock, the only asteroid the missile can collide
    // with is its target — checking target-only is both faster and correct.
    if (target) {
      const dToTarget = Math.hypot(
        target.position.x - missile.position.x,
        target.position.y - missile.position.y,
      );
      if (dToTarget <= HOMING_MISSILES_MISSILE_IMPACT_RADIUS) {
        onMissileImpact(target);
        disposeMissileState(missile, scene);
        continue;
      }
    }
    alive.push(missile);
  }
  return alive;
}
