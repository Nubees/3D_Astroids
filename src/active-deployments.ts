import {
  AdditiveBlending,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Line,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Sprite,
  SpriteMaterial,
} from 'three';
import { AsteroidKind, AsteroidSize, AsteroidState, Vector2 } from './types';
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
  ORBIT_DRONES_DURATION_SECONDS,
  ORBIT_DRONES_FADE_OUT_SECONDS,
  ORBIT_DRONES_FIRE_INTERVAL_SECONDS,
  ORBIT_DRONES_ORBIT_PERIOD_SECONDS,
  ORBIT_DRONES_ORBIT_RADIUS,
  ORBIT_DRONES_TARGET_RADIUS,
} from './pickups';
import { createMissileAssembly, emitMissileSmokeRear } from './missile-vfx';
import {
  createAuraRing,
  createDeployShockwave,
  createDroneMesh,
  createLockOnSprite,
  createTetherLine,
  updateAuraPulse,
  updateDeployShockwave,
  updateDroneVisuals,
  updateLockOnSprite,
  updateTetherLine,
} from './orbit-drone-vfx';
import { ORBIT_DRONES_TIER_DRONE_COUNT } from './orbit-drone';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Active Deployments (Phase 7 DIAL-UP / Phase 7b Power-Up VFX / Phase 7i)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Owns the per-frame state for the 2 deployable active pickup
//          kinds (Orbit Drones + Homing Missiles). Kept out of game.ts so
//          that file does not grow past 2300 lines.
// Setup:   Game owns `activeDeployments`, `missileSchedules`, and
//          `homingMissiles` arrays. Each frame, Game calls
//          tickDroneDeployments + tickMissileVolleySchedules + tickHomingMissiles.
// Issues:  Pre-Phase 7i the drones had no per-frame animation — they moved
//          in a circle but never spun, bobbed, flashed, projected auras,
//          tethered to targets, or had a deploy shockwave. The previous
//          state held a bare Mesh[] (droneMeshes), one deployment-level
//          fireTimer, and one fadeTimer.
// Fix:     Phase 7 DIAL-UP + 7b. Drones and missiles reuse the existing
//          fireProjectile path; missiles now spawn via a staggered
//          VolleySchedule (0/180/360/540ms) drained by tickMissileVolleySchedules.
//          Phase 7i Sprint 1 (Task 3). DroneDeploymentState gains a tier
//          index (1/2/3), a perDrone[] of visual slots (mesh + bobPhase +
//          fireTimer + fireFlashAge + tetherLine + lockOnSprite + sticky
//          currentTarget), plus shared auraRing / deployShockwave layers.
//          droneMeshes is KEPT as a backward-compat alias for perDrone[].mesh
//          so existing tests + iterate code keep working without churn.
//          sceneClock accumulates dt and is the time origin for bob/spin/
//          aura-pulse math in src/orbit-drone(-vfx).ts. findDroneTarget is
//          declared but intentionally NOT WIRED in this commit — Sprint 2
//          Task 5 hooks it (it needs per-drone timers first). For Task 3
//          the existing single deployment-level fireTimer keeps firing at
//          the nearest asteroid via findNearestAsteroid, matching the v1
//          behavior so all existing tests stay green.
// Gotchas: PerDroneState.fireFlashAge starts at 999 (past the 80ms flash
//          window) so no drone flashes on the spawn frame. Per-drone
//          fireTimer + the deployment-level fireTimer BOTH exist in this
//          state shape — Task 3 reads/writes the deployment-level field
//          (preserves v1 firing cadence at ORBIT_DRONES_FIRE_INTERVAL_SECONDS).
//          Task 5 (Sprint 2) replaces the deployment-level timer with
//          per-drone timers and also routes the per-drone fireFlashes
//          through fireFlashAge. Do not duplicate that work here.
//          findDroneTarget priority is crystal > non-tiny iron > tiny —
//          matches the user's mental model of "prioritize the lucrative
//          targets". currentTarget is sticky for the frame (re-picked every
//          frame in Task 3; Task 5 may keep it sticky across frames).
//          disposeDroneDeployment disposes ALL GPU resources — geometry
//          + material for every drone, its tether, its lock-on sprite,
//          the aura ring, and the deploy shockwave. The shared lock-on
//          CanvasTexture is module-scope so we DO NOT dispose it per
//          deployment (mirrors the sprite-texture rule in src/missile-vfx.ts).
//          FADE_FRAME_SCALE=0.95 means a 0.3s fade-out at 60fps scales
//          drones down by 0.95^18 ≈ 0.4× → reads as a smooth shrink,
//          not a pop.
//          Drone cooldown starts AFTER the 6s active window expires, not
//          at press time — Game enforces this by setting the cooldown
//          when the deployment is culled, not when it is spawned.
//          Missile impact radius is now HOMING_MISSILES_MISSILE_IMPACT_RADIUS
//          (0.45), not the old hard-coded 0.3.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phase 7i Sprint 1 — per-drone visual state slot. Owns the drone mesh,
 * the unique phase offset for its Y-bob, the per-fire flash age (so
 * updateDroneVisuals knows whether to draw a pop), the tether line that
 * points at the current target, and the lock-on sprite that sits on the
 * target. `currentTarget` is sticky for the frame in Task 3; Task 5 may
 * promote it to cross-frame stickiness.
 */
export interface PerDroneState {
  mesh: Mesh;
  bobPhase: number;          // unique random phase offset for Y-bob
  fireTimer: number;         // per-drone countdown (Sprint 2 — Task 5)
  fireFlashAge: number;      // 0 = firing just happened, ramps to 0 over 80ms
  tetherLine: Line;          // Phase 7i Sprint 1
  lockOnSprite: Sprite;      // Phase 7i Sprint 1
  currentTarget: AsteroidState | null;
}

export interface DroneDeploymentState {
  remaining: number;
  fadeTimer: number;         // 0 = active, > 0 = fading out
  tier: 1 | 2 | 3;           // 0 = legacy (not used post-Sprint 3)
  fireTimer: number;         // v1 single-deployment fire cadence; replaced by per-drone fireTimer in Sprint 2 Task 5
  droneMeshes: Mesh[];       // backward-compat alias for perDrone[].mesh
  perDrone: PerDroneState[];
  auraRing: Mesh;
  deployShockwave: Mesh;
  deployShockwaveAge: number;
  sceneClock: number;        // accumulates dt; time origin for bob/spin/aura
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
 * Returns true if `asteroid` should be ignored by missile targeting. Phase
 * 7f-2 — tinies get pushed aside rather than targeted; missiles focus on
 * SMALL/MEDIUM/LARGE (and crystals). The user's complaint was specifically
 * about tinies ("the smallest asteroid parts"); SMALL stays in the
 * targeting pool because it just split off a medium and is still a real
 * threat. If SMALL knockback is wanted later, flip this to
 * `size === AsteroidSize.TINY || size === AsteroidSize.SMALL` and mirror
 * the change in the tickHomingMissiles impact branch.
 */
export function missileIgnoresAsteroid(asteroid: AsteroidState): boolean {
  return asteroid.size === AsteroidSize.TINY;
}

/**
 * Find the closest asteroid to `position` within `maxRadius`. Returns
 * null if none in range. Used by both drone auto-fire and missile tracking.
 *
 * Phase 7f-2 — skips TINY asteroids (missileIgnoresAsteroid) so missiles
 * focus on SMALL/MEDIUM/LARGE. Drone auto-fire intentionally uses the same
 * helper so the priority order matches: drones also prefer bigger rocks.
 */
export function findNearestAsteroid(
  position: Vector2,
  asteroids: AsteroidState[],
  maxRadius: number,
): AsteroidState | null {
  let nearest: AsteroidState | null = null;
  let nearestDistance = maxRadius;
  for (const a of asteroids) {
    if (missileIgnoresAsteroid(a)) continue;
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
 *
 * Phase 7f-2 — skips TINY asteroids for the same reason as findNearestAsteroid.
 */
export function findFarthestAsteroid(
  position: Vector2,
  asteroids: AsteroidState[],
  maxRadius: number,
): AsteroidState | null {
  let farthest: AsteroidState | null = null;
  let farthestDistance = -1;
  for (const a of asteroids) {
    if (missileIgnoresAsteroid(a)) continue;
    const d = Math.hypot(a.position.x - position.x, a.position.y - position.y);
    if (d <= maxRadius && d > farthestDistance) {
      farthest = a;
      farthestDistance = d;
    }
  }
  return farthest;
}

/**
 * Apply a velocity impulse to `asteroid` along `direction` (a unit vector
 * from caller). Returns a new AsteroidState with the same position but
 * boosted velocity. Vector2 is readonly in this codebase, so we cannot
 * mutate asteroid.velocity in place — same pattern as
 * resolveAsteroidCollision in src/asteroid.ts:266.
 *
 * Phase 7f-2 — used by tickHomingMissiles when a missile grazes a TINY
 * asteroid. The Game wrapper applies the returned state to the
 * LiveAsteroid.state field; the per-frame drift update picks up the new
 * velocity on the next tick.
 */
export function knockbackAsteroid(
  asteroid: AsteroidState,
  direction: Vector2,
  speed: number,
): AsteroidState {
  return {
    ...asteroid,
    velocity: {
      x: asteroid.velocity.x + direction.x * speed,
      y: asteroid.velocity.y + direction.y * speed,
    },
  };
}

export function spawnDroneDeployment(
  shipPosition: Vector2,
  scene: Object3D,
  tier: 1 | 2 | 3 = 1,
): DroneDeploymentState {
  const droneCount = ORBIT_DRONES_TIER_DRONE_COUNT(tier);
  const perDrone: PerDroneState[] = [];
  const droneMeshes: Mesh[] = [];
  for (let i = 0; i < droneCount; i++) {
    const mesh = createDroneMesh(tier);
    mesh.position.set(shipPosition.x, shipPosition.y, 0);
    scene.add(mesh);
    droneMeshes.push(mesh);
    const tetherLine = createTetherLine(tier);
    const lockOnSprite = createLockOnSprite(tier);
    perDrone.push({
      mesh,
      bobPhase: Math.random() * Math.PI * 2,
      fireTimer: 0,
      // 999 = "past the 80ms flash window" so updateDroneVisuals does not
      // pop a flash on the spawn frame. Task 5 will reset this to 0 on
      // per-drone fire.
      fireFlashAge: 999,
      tetherLine,
      lockOnSprite,
      currentTarget: null,
    });
    scene.add(tetherLine);
    scene.add(lockOnSprite);
  }
  const auraRing = createAuraRing(tier);
  scene.add(auraRing);
  const deployShockwave = createDeployShockwave(tier);
  scene.add(deployShockwave);
  return {
    remaining: ORBIT_DRONES_DURATION_SECONDS,
    fadeTimer: 0,
    tier,
    fireTimer: 0,
    droneMeshes,
    perDrone,
    auraRing,
    deployShockwave,
    // Start past the 250ms shockwave window so the ring stays hidden until
    // Sprint 2 Task 5 wires the fire callback to reset this to 0 on deploy.
    deployShockwaveAge: 999,
    sceneClock: 0,
  };
}

/**
 * Tick all live drone deployments. Mutates `deployments` in place: culls
 * expired ones (after fade-out completes), drives the new per-drone visuals
 * (bob + spin + fire-flash + tether + lock-on), pulses the aura ring,
 * ages out the deploy shockwave, and fires drone projectiles at the
 * nearest asteroid on the deployment-level cadence (per-drone timers land
 * in Sprint 2 Task 5).
 *
 * Returns the pruned list. Caller replaces its array with the return.
 */
export function tickDroneDeployments(
  deployments: DroneDeploymentState[],
  shipPosition: Vector2,
  asteroids: AsteroidState[],
  deltaTime: number,
  scene: Object3D,
  onDroneFire: (origin: Vector2, target: AsteroidState, droneIndex: number) => void,
): DroneDeploymentState[] {
  const alive: DroneDeploymentState[] = [];
  for (const dep of deployments) {
    dep.sceneClock += deltaTime;
    if (dep.fadeTimer > 0) {
      // Fading out — shrink meshes (tether/sprite/aura/shockwave all go
      // away with their parent deployment via dispose) and dispose when
      // the fade completes. We only touch the drone meshes here so we do
      // not also dispose a deployment that is just starting to fade.
      for (const drone of dep.perDrone) {
        drone.mesh.scale.multiplyScalar(FADE_FRAME_SCALE);
      }
      dep.fadeTimer -= deltaTime;
      if (dep.fadeTimer <= 0) {
        disposeDroneDeployment(dep, scene);
        continue; // deployment is fully gone
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
    // Phase 7i Sprint 1 — distribute drones evenly around the orbit (was
    // "opposite sides" 180° offsets). phaseOffset[i] = i * (2π / droneCount).
    // Larger tier counts naturally distribute on the same radius.
    const droneCount = dep.perDrone.length;
    for (let i = 0; i < droneCount; i++) {
      const drone = dep.perDrone[i];
      const angle = dep.sceneClock * ORBIT_ANGULAR_SPEED + i * (2 * Math.PI / droneCount);
      drone.mesh.position.x = shipPosition.x + Math.cos(angle) * ORBIT_DRONES_ORBIT_RADIUS;
      // Base Y is the orbital Y; updateDroneVisuals layers bobOffset on top
      // so we save it locally and pass it back in.
      const baseY = shipPosition.y + Math.sin(angle) * ORBIT_DRONES_ORBIT_RADIUS;
      // Pick the target using current nearest (Task 5 may swap to
      // findDroneTarget for crystal-priority). The bob offset has not been
      // applied yet, so probe from the un-bobbed orbital point.
      drone.currentTarget = findNearestAsteroid(
        { x: drone.mesh.position.x, y: baseY },
        asteroids,
        ORBIT_DRONES_TARGET_RADIUS,
      );
      updateDroneVisuals(
        drone.mesh,
        dep.sceneClock,
        drone.fireFlashAge,
        drone.bobPhase,
        baseY,
      );
      // Tether uses the post-update mesh position (which includes bob) so
      // the line literally starts at the drone's exact screen position.
      updateTetherLine(
        drone.tetherLine,
        { x: drone.mesh.position.x, y: drone.mesh.position.y },
        drone.currentTarget ? drone.currentTarget.position : null,
      );
      updateLockOnSprite(
        drone.lockOnSprite,
        drone.currentTarget ? drone.currentTarget.position : null,
      );
    }
    updateAuraPulse(dep.auraRing, dep.tier, dep.sceneClock, 0);
    // Sprint 2 preview — deploy shockwave ages out. Task 5 wires the fire
    // callback to reset deployShockwaveAge to 0 on deploy; for Sprint 1 it
    // starts at 999 so the shockwave is hidden until Task 5 spawns it.
    updateDeployShockwave(dep.deployShockwave, dep.deployShockwaveAge);
    // Auto-fire at nearest target at the deployment-level cadence. Task 5
    // replaces this with per-drone timers. We keep the v1 cadence so
    // existing tests stay green.
    dep.fireTimer += deltaTime;
    if (dep.fireTimer >= ORBIT_DRONES_FIRE_INTERVAL_SECONDS) {
      dep.fireTimer = 0;
      const target = findNearestAsteroid(
        shipPosition,
        asteroids,
        ORBIT_DRONES_TARGET_RADIUS,
      );
      if (target) {
        // Pick the drone closer to the target for the projectile origin —
        // and pass the index back so Sprint 2 can drive per-drone flashes.
        let bestIndex = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < dep.perDrone.length; i++) {
          const mesh = dep.perDrone[i].mesh;
          const d = Math.hypot(
            mesh.position.x - target.position.x,
            mesh.position.y - target.position.y,
          );
          if (d < bestDistance) {
            bestDistance = d;
            bestIndex = i;
          }
        }
        const origin = dep.perDrone[bestIndex].mesh.position;
        onDroneFire({ x: origin.x, y: origin.y }, target, bestIndex);
      }
    }
    alive.push(dep);
  }
  return alive;
}

/**
 * Tear down all GPU resources owned by a drone deployment and detach every
 * mesh/sprite/line from `scene`. Safe to call once at the end of the
 * fade-out (current `tickDroneDeployments` use-site); calling it before the
 * fade completes will also visually kill the deployment, so callers should
 * only invoke it from the fade-end branch.
 *
 * The shared lock-on CanvasTexture is module-scope (see
 * `getSharedLockOnTexture` in src/orbit-drone-vfx.ts), so we do NOT dispose
 * it per-deployment — mirroring the shared sprite-texture rule in
 * src/missile-vfx.ts.
 */
export function disposeDroneDeployment(dep: DroneDeploymentState, scene: Object3D): void {
  for (const drone of dep.perDrone) {
    scene.remove(drone.mesh);
    drone.mesh.geometry.dispose();
    (drone.mesh.material as MeshStandardMaterial).dispose();
    scene.remove(drone.tetherLine);
    drone.tetherLine.geometry.dispose();
    (drone.tetherLine.material as MeshBasicMaterial).dispose();
    scene.remove(drone.lockOnSprite);
    (drone.lockOnSprite.material as SpriteMaterial).dispose();
  }
  scene.remove(dep.auraRing);
  dep.auraRing.geometry.dispose();
  (dep.auraRing.material as MeshBasicMaterial).dispose();
  scene.remove(dep.deployShockwave);
  dep.deployShockwave.geometry.dispose();
  (dep.deployShockwave.material as MeshBasicMaterial).dispose();
}

/**
 * Phase 7i Sprint 1 (preview; NOT WIRED IN TASK 3) — drone targeting
 * priority. Crystals first (the lucrative cascade targets), then non-tiny
 * iron (any size except TINY), then TINY as a last resort. Within each
 * tier, picks the nearest. Skips the `ignore` asteroid (typically a drone's
 * sticky cross-frame target so we do not pick ourselves).
 *
 * Sprint 2 Task 5 will swap this into tickDroneDeployments and add the
 * per-drone fireFlashes that go with it.
 */
export function findDroneTarget(
  asteroids: AsteroidState[],
  position: Vector2,
  ignore: AsteroidState | null = null,
): AsteroidState | null {
  let bestCrystal: AsteroidState | null = null;
  let bestCrystalDist = Infinity;
  let bestNonTiny: AsteroidState | null = null;
  let bestNonTinyDist = ORBIT_DRONES_TARGET_RADIUS;
  let bestTiny: AsteroidState | null = null;
  let bestTinyDist = ORBIT_DRONES_TARGET_RADIUS;
  for (const a of asteroids) {
    if (a === ignore) continue;
    const d = Math.hypot(a.position.x - position.x, a.position.y - position.y);
    if (d > ORBIT_DRONES_TARGET_RADIUS) continue;
    if (a.kind === AsteroidKind.CRYSTAL) {
      if (d < bestCrystalDist) {
        bestCrystal = a;
        bestCrystalDist = d;
      }
    } else if (a.size !== AsteroidSize.TINY) {
      if (d < bestNonTinyDist) {
        bestNonTiny = a;
        bestNonTinyDist = d;
      }
    } else {
      if (d < bestTinyDist) {
        bestTiny = a;
        bestTinyDist = d;
      }
    }
  }
  return bestCrystal ?? bestNonTiny ?? bestTiny;
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
//          Phase 7f-2 — TINY asteroids are knocked aside instead of destroyed.
//          findNearestAsteroid / findFarthestAsteroid skip TINY in their
//          iteration (missileIgnoresAsteroid helper), so missiles never lock
//          onto tinies in the first place. The impact branch in
//          tickHomingMissiles gained a second path: when the locked target
//          happens to be a TINY (e.g. a tiny wandered into the missile's
//          flight cone after the lock was already taken), the missile calls
//          the new optional onTinyKnockback callback with the impulse
//          direction and clears its own target so it re-picks a bigger rock
//          on the next frame. The missile itself stays in flight — no
//          disposal, no onMissileImpact call. This is the "missiles part
//          the sea of tiny fragments and keep going for the bigger threats"
//          behavior the user asked for. knockbackAsteroid is the pure helper
//          that produces the new state; Game applies the impulse to its
//          LiveAsteroid list.
//          Phase 7g — missile-destroyed explosion VFX. New optional
//          onMissileDispose(position, velocityDir) callback fires at BOTH
//          disposal sites: (1) fuel-expiry (line ~548) and (2) impact-destroy
//          (line ~674). The Game wires this to its missileExplosionFactory
//          so every missile detonation — whether it ran out of fuel or hit
//          an asteroid — spawns the layered shards+sparks+flash VFX. The
//          velocityDir is the unit vector of the missile's last motion; the
//          factory uses it to bias the shard/spray pattern in the direction
//          of flight. Callback is OPTIONAL so existing pure-logic tests
//          (which only exercise destroy/knockback logic, not VFX) compile
//          unchanged. The onTinyKnockback branch does NOT fire onMissileDispose
//          because that path does not destroy the missile — it survives and
//          re-picks a bigger target.
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
 * and checks asteroid collision.
 *
 * Collision handling — Phase 7f-2:
 *   - Non-TINY target: call onMissileImpact(target), dispose missile, continue.
 *     This is the existing destroy path.
 *   - TINY target: call onTinyKnockback(target, direction), clear
 *     missile.target so the next frame re-picks a bigger rock, keep
 *     missile in flight. This is the new "knock aside" path.
 *
 * Callbacks:
 *   - onMissileImpact: required. Used for normal destruction (decrement
 *     HP, trigger split logic in Game).
 *   - onTinyKnockback: optional. Used by Game to apply the velocity impulse
 *     to the LiveAsteroid state. Optional so existing pure-logic tests
 *     that only exercise destroy behavior do not need to pass it.
 *     Back-compat: if onTinyKnockback is undefined, a TINY impact falls
 *     through to the destroy path (same behavior as pre-Phase 7f-2).
 *     This keeps the function safe to call from any caller that hasn't
 *     been updated to opt into the new behavior.
 *   - onMissileDispose (Phase 7g): optional. Fires for EVERY missile
 *     destruction — both fuel-expiry (line ~542) and impact (line ~657).
 *     Used by Game to spawn the layered explosion VFX (shards + sparks +
 *     flash core). The callback receives the missile's last known position
 *     and a unit velocity direction (for debris bias). Optional so existing
 *     pure-logic tests don't need to wire it up.
 */
export function tickHomingMissiles(
  missiles: HomingMissileState[],
  asteroids: AsteroidState[],
  deltaTime: number,
  scene: Object3D,
  onMissileImpact: (asteroid: AsteroidState) => void,
  onTinyKnockback?: (asteroid: AsteroidState, direction: Vector2) => void,
  onMissileDispose?: (position: Vector2, velocityDir: Vector2) => void,
): HomingMissileState[] {
  const alive: HomingMissileState[] = [];
  for (const missile of missiles) {
    missile.remaining -= deltaTime;
    if (missile.remaining <= 0) {
      // Phase 7g — notify the explosion factory BEFORE disposal so it can
      // read the missile's last known position + velocity direction (the
      // debris-bias cue for the shard/spray pattern).
      if (onMissileDispose) {
        const speed = Math.hypot(missile.velocity.x, missile.velocity.y);
        const dir = speed > 0.01
          ? { x: missile.velocity.x / speed, y: missile.velocity.y / speed }
          : { x: 1, y: 0 };
        onMissileDispose(missile.position, dir);
      }
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
    //
    // Phase 7f-2 — TINY asteroids are knocked aside instead of destroyed.
    // The lock-clear on knockback means the next frame re-runs the tier
    // helper (findNearest/findFarthest) which now SKIPS TINY, so the missile
    // locks the next non-tiny asteroid it sees. Missile stays in flight.
    if (target) {
      const dToTarget = Math.hypot(
        target.position.x - missile.position.x,
        target.position.y - missile.position.y,
      );
      if (dToTarget <= HOMING_MISSILES_MISSILE_IMPACT_RADIUS) {
        if (missileIgnoresAsteroid(target) && onTinyKnockback) {
          // TINY: shove it along the missile's velocity direction and re-pick.
          // Fall back to the missile→target direction if velocity is
          // degenerate (shouldn't happen — missiles spawn at full speed —
          // but defensive).
          const vLen = Math.hypot(missile.velocity.x, missile.velocity.y);
          let dir: Vector2;
          if (vLen > 0.01) {
            dir = { x: missile.velocity.x / vLen, y: missile.velocity.y / vLen };
          } else {
            const dx = target.position.x - missile.position.x;
            const dy = target.position.y - missile.position.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.01) {
              dir = { x: dx / d, y: dy / d };
            } else {
              dir = { x: 1, y: 0 };
            }
          }
          onTinyKnockback(target, dir);
          missile.target = null; // force re-pick next frame
          // Do NOT dispose — missile keeps flying.
        } else {
          onMissileImpact(target);
          // Phase 7g — spawn the explosion VFX at the impact point BEFORE
          // disposing the missile assembly so the spawn reads the missile's
          // last velocity direction (used for debris bias).
          if (onMissileDispose) {
            const speed = Math.hypot(missile.velocity.x, missile.velocity.y);
            const dir = speed > 0.01
              ? { x: missile.velocity.x / speed, y: missile.velocity.y / speed }
              : { x: 1, y: 0 };
            onMissileDispose(missile.position, dir);
          }
          disposeMissileState(missile, scene);
          continue;
        }
      }
    }
    alive.push(missile);
  }
  return alive;
}
