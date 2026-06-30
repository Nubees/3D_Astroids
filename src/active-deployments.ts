import {
  AdditiveBlending,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
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
  ORBIT_DRONES_BEAM_LIFETIME_SECONDS,
  ORBIT_DRONES_BEAM_REACH,
  ORBIT_DRONES_DAMAGE,
  ORBIT_DRONES_DURATION_SECONDS,
  ORBIT_DRONES_EXPIRY_AURA_FREQUENCY_HZ,
  ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS,
  ORBIT_DRONES_FADE_OUT_SECONDS,
  ORBIT_DRONES_FIRE_INTERVAL_SECONDS,
  ORBIT_DRONES_FIRE_INTERVAL_TAPER_END,
  ORBIT_DRONES_ORBIT_PERIOD_SECONDS,
  ORBIT_DRONES_ORBIT_RADIUS,
  ORBIT_DRONES_TARGET_RADIUS,
} from './pickups';
import { createMissileAssembly, emitMissileSmokeRear } from './missile-vfx';
import { PROJECTILE_RADIUS, PROJECTILE_SPEED } from './projectile';
import {
  createAuraRing,
  createDeployShockwave,
  createDroneBeam,
  createDroneMesh,
  createLockOnSprite,
  createMuzzleFlash,
  createTetherLine,
  updateBeam,
  updateDeployShockwave,
  updateDroneVisuals,
  updateLockOnSprite,
  updateMuzzleFlash,
  updateTetherLine,
} from './orbit-drone-vfx';
import {
  ORBIT_DRONES_TIER_COLOR,
  ORBIT_DRONES_TIER_DRONE_COUNT,
  expiryAlphaCurve,
  powerPulseEmissive,
  powerPulseScale,
} from './orbit-drone';

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
//          aura-pulse math in src/orbit-drone(-vfx).ts.
//          Phase 7i Sprint 2 (Task 5). The single deployment-level
//          fireTimer is REPLACED by per-drone timers — each drone fires
//          independently at ORBIT_DRONES_FIRE_INTERVAL_SECONDS (0.4s), so a
//          tier-3 trio fires 7.5 shots/sec each instead of 1 staggered
//          volley every 0.4s. onDroneFire callback widens to
//          (origin, target, droneIndex, tier) so Game can spawn the
//          tier-coloured projectile (Task 4) and tag it with KillSource
//          .DRONE for kill-source routing in Task 6. spawnDroneDeployment
//          now seeds deployShockwaveAge at 0 (was 999) so the tick loop's
//          `=== 0` exact-equality check fires on the first non-fade frame
//          and nudges the field to 0.001 to start the 250ms animation.
//          The deployment-level fireTimer field is KEPT (defaulted to 0)
//          for back-compat — Task 3 set it; Task 5 simply no longer
//          writes to it.
// Gotchas: PerDroneState.fireFlashAge starts at 999 (past the 80ms flash
//          window) so no drone flashes on the spawn frame. Per-drone
//          fireTimer is incremented EVERY frame (not gated by
//          dep.fadeTimer) so a fade-out does not silently pause
//          firing — by then drones are visually shrinking and any
//          in-flight shots are about to expire anyway.
//          findDroneTarget priority is crystal > non-tiny iron > tiny —
//          matches the user's mental model of "prioritize the lucrative
//          targets". currentTarget is re-picked every frame via
//          findNearestAsteroid (Task 3 behaviour preserved). Task 5 did
//          not promote this to cross-frame stickiness — the per-drone
//          fire timer is short enough (0.4s) that re-targeting every
//          frame feels right and never visibly "snaps" between targets.
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
//          (0.95), not the old hard-coded 0.3.
//          The deploy-shockwave "0 → 0.001 → dt accumulator" pattern is
//          a one-shot trigger: the `=== 0` check only fires on the frame
//          the deployment first enters the tick loop with a fresh
//          deployShockwaveAge. We intentionally leave that field at 0
//          for the rest of the deployment's life — subsequent calls
//          skip the equality check and just keep ageing the shockwave.
//          Phase 7i-2 (Task 4) DELTA — idle power-pulse breathing. New
//          PerDroneState.powerPulsePhase (random [0, 2π) like bobPhase
//          so a tier-3 deployment doesn't pulse in lockstep) and new
//          DroneDeploymentState.elapsedSeconds (dt-accumulating wall-clock
//          since spawn). tickDroneDeployments increments elapsedSeconds
//          at the top of the outer loop, then after the existing
//          updateDroneVisuals call (which already sets scale + emissive
//          from the 80ms fire-flash) layers the power-pulse ON TOP: scale
//          multiplies, emissive adds the offset scaled by (1 - flash) so
//          the fire-flash still pokes through at the fire moment. The
//          drone mesh material is MeshStandardMaterial (verified in
//          src/orbit-drone-vfx.ts:103) so the emissiveIntensity channel
//          is available — no CRITICAL CHECK fallback needed.
//          Phase 7i-2 (Task 5) DELTA — expiry telegraph + fire-rate taper.
//          Three new effects layered on top of the Task 4 power-pulse:
//          (1) per-drone alpha fade via expiryAlphaCurve(dep.remaining)
//          writes mat.opacity = 1.0→0.0 across the last
//          ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS (1.5s) and also flips
//          mat.transparent = true (createDroneMesh does NOT pre-set it,
//          contrary to the dispatch brief — verified Task 4 by reading
//          src/orbit-drone-vfx.ts:103). Placed OUTSIDE the fire-flash
//          block so the emissiveIntensity layering does not fight it —
//          the fire-flash only touches emissive, not opacity, so the
//          two channels compose cleanly. (2) aura pulse frequency shift
//          from 2.0 Hz → 5.0 Hz (ORBIT_DRONES_EXPIRY_AURA_FREQUENCY_HZ)
//          when dep.remaining <= telegraph. Replicates the 0.35+0.25*sin
//          shape from updateAuraPulse in src/orbit-drone-vfx.ts:245 so
//          the pre-telegraph visual is identical — only the frequency
//          changes (SWAP, not stack). The call to updateAuraPulse is
//          removed entirely (and the import dropped) because threading
//          a frequency param through would require editing
//          src/orbit-drone-vfx.ts, which is out of Task 5 scope. The
//          legacy tier===0 hide branch is gone since dep.tier is typed
//          `1 | 2 | 3` post-Sprint 3 — the ring is always visible
//          during the active phase. (3) fire-rate taper: interval
//          starts at 0.4s and linearly ramps to 1.0s across
//          dep.elapsedSeconds = [9, 11] (the last 2s of life). The
//          trigger compares against the LIVE interval, not the
//          constant, so the reset-to-zero pattern still works —
//          fireTimer crosses interval, fires, resets to 0, accumulates
//          toward the next (potentially larger) interval.
//          Phase 7i-2 (Task 6) DELTA — beam fire replaces projectile fire.
//          Drones no longer spawn per-shot Projectile entities. They
//          paint an instant 0xff2233 line from drone → target using
//          createDroneBeam (src/orbit-drone-vfx.ts) with
//          ORBIT_DRONES_BEAM_REACH=24u and a 0.25s lifetime (visible
//          per-frame via updateBeam — a Line does not auto-track the
//          target, so without the per-frame call the endpoint would
//          stay at the original target position even if the asteroid
//          moves). PerDroneState gained: beamLine (Line|null, created
//          at origin 0,0,0 with visible=false), muzzleFlash (Sprite,
//          80ms scale-pulse), beamAge (counts up to BEAM_LIFETIME),
//          muzzleFlashAge (counts up to 0.08s), currentBeamTarget
//          (sticky across frames so the beam can re-track between
//          tickDroneDeployments calls). fireDroneBeam replaces
//          fireDroneProjectile: sets beamLine.visible=true, snaps
//          endpoints drone→target, resets beamAge=0, sets
//          currentBeamTarget=asteroid, positions muzzleFlash at drone,
//          resets muzzleFlashAge=0, fires the per-fire scale-pop +
//          emissive flash on the drone mesh, emits DroneKillSparks
//          (unchanged from Sprint 2) if a KillSource callback is
//          registered. DroneDeploymentState gained beamHitCallback —
//          Task 9 wires this in src/game.ts so the engine can apply
//          damage when a beam paints an asteroid. The previous
//          onDroneFire(origin,target,droneIndex,tier) callback is now
//          (origin,target,droneIndex,tier,beamHitCallback?) — old
//          callers passing only the first 4 args still compile
//          because beamHitCallback is optional. Projectile.source no
//          longer has 'DRONE' (src/types.ts) — the literal was
//          dead-code post-beam-rewiring; the KillSource.DRONE enum in
//          src/pickups.ts is KEPT for kill-sparks routing.
//          Phase 7i-2 (Task 7) DELTA — dispose path for the new VFX.
//          disposeDroneDeployment gained two per-drone dispose arms
//          alongside the existing mesh / tether / lock-on calls:
//          (1) `drone.beamLine` — Line + per-instance BufferGeometry +
//          per-instance LineBasicMaterial all disposed; beamLine is
//          nulled so a stale pointer in any future code path cannot
//          resurrect a disposed mesh. (2) `drone.muzzleFlash` — the
//          Sprite is removed from the scene and its SpriteMaterial is
//          disposed (which decrements the shared lock-on CanvasTexture
//          ref count — harmless because the texture is module-scope
//          and reused by every deployment). We do NOT dispose the
//          sprite's geometry (Sprites share a unit-square SpriteGeometry
//          that is not safe to dispose per-instance) and we do NOT
//          touch the shared lock-on texture itself. These two arms
//          close the per-deployment GPU resource leak that Task 6
//          opened: pre-Task 7, deploying drones and waiting for the
//          fade-out would orphan the Line geometry, the LineBasicMaterial,
//          and the SpriteMaterial in GPU memory until tab close. The
//          dep.auraRing + dep.deployShockwave disposes from prior
//          tasks are unchanged. Task 8 will add the chargeUpRing
//          dispose arm in the SAME per-drone loop.
//          Phase 7i-2 (Task 9) DELTA — per-beam-once throttling. New
//          PerDroneState.beamHasHitTarget: boolean field (initialised
//          false in spawnDroneDeployment and re-armed false on every
//          fireDroneBeam call). The flag is consumed by the
//          per-frame intersection check in src/game.ts (handleCollisions
//          extension): each frame while a beam is visible, the check
//          iterates per-asteroid, and beamHasHitTarget gates whether
//          dep.beamHitCallback fires. First hit flips it to true;
//          subsequent frames within the same 0.25s beam window see
//          true and short-circuit. 1 hit per beam = the user-feedback
//          cadence the design calls for. fireDroneBeam is the SOLE
//          writer of false (reset); the intersection check in
//          game.ts is the SOLE writer of true. The field is plain
//          mutable state on PerDroneState (no readonly) because the
//          existing fireFlashAge / fireTimer / beamAge pattern is
//          all mutable too — consistent with the rest of the
//          per-drone slot.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phase 7i Sprint 1/2 — per-drone visual + logic slot. Owns the drone
 * mesh, the unique phase offset for its Y-bob, the per-fire flash age
 * (so updateDroneVisuals knows whether to draw a pop), the tether line
 * that points at the current target, and the lock-on sprite that sits on
 * the target. `currentTarget` is re-picked every frame via
 * findNearestAsteroid — Sprint 2 (Task 5) did not promote it to
 * cross-frame stickiness. Per-drone `fireTimer` is incremented every
 * frame and triggers a fire callback when it crosses
 * ORBIT_DRONES_FIRE_INTERVAL_SECONDS, so each drone fires independently
 * rather than at the deployment-level cadence.
 */
export interface PerDroneState {
  mesh: Mesh;
  bobPhase: number;          // unique random phase offset for Y-bob
  fireTimer: number;         // per-drone countdown (Sprint 2 — Task 5)
  fireFlashAge: number;      // 0 = firing just happened, ramps to 0 over 80ms
  tetherLine: Line;          // Phase 7i Sprint 1
  lockOnSprite: Sprite;      // Phase 7i Sprint 1
  currentTarget: AsteroidState | null;
  // Phase 7i-2 — unique phase offset for the idle power-pulse (scale +
  // emissive breathing at 1.2 Hz). Independent of bobPhase so the drone
  // doesn't bob AND pulse in lockstep — the eye reads the composite as
  // organic motion rather than a single rigid sinusoid.
  powerPulsePhase: number;
  // Phase 7i-2 (Task 6) — beam fire replaces projectile fire. Each drone
  // owns a beam Line (initially visible=false — the factory seeds both
  // endpoints at (0,0,0) so the line would be a degenerate pixel if
  // shown) and a muzzle-flash Sprite (additive, opacity starts at 0 and
  // is animated by updateMuzzleFlash). `beamAge` is the dt accumulator
  // driving the ORBIT_DRONES_BEAM_LIFETIME_SECONDS timeout; when the
  // line expires, currentBeamTarget is cleared and the line is hidden
  // until the next fire. `muzzleFlashAge` is its own dt accumulator and
  // runs for ORBIT_DRONES_MUZZLE_FLASH_LIFETIME_SECONDS (0.08s). The
  // per-frame tick in tickDroneDeployments ages both and calls
  // updateBeam / updateMuzzleFlash while in-window.
  beamLine: Line | null;
  muzzleFlash: Sprite;
  beamAge: number;
  muzzleFlashAge: number;
  currentBeamTarget: AsteroidState | null;
  // Phase 7i-2 (Task 9) — per-beam-once throttling for beam-vs-asteroid
  // damage. The beam Line is visible for ORBIT_DRONES_BEAM_LIFETIME_SECONDS
  // (0.25s) which is ~15 frames at 60fps. Without a once-per-beam gate the
  // intersection check in src/game.ts would call dep.beamHitCallback every
  // frame the beam overlaps an asteroid — so a single shot could deal up to
  // 15 damage stacks. The flag is reset to false on every fireDroneBeam
  // (Task 9 also touches fireDroneBeam to set the false) and flipped to
  // true the first frame the callback fires; subsequent frames short-circuit
  // via the `if (drone.beamHasHitTarget) continue;` guard. 1 hit per beam
  // is the player-feedback cadence the user expects: visible shot, 1 kill,
  // next shot fires 0.4s later.
  beamHasHitTarget: boolean;
}

export interface DroneDeploymentState {
  remaining: number;
  fadeTimer: number;         // 0 = active, > 0 = fading out
  tier: 1 | 2 | 3;           // 0 = legacy (not used post-Sprint 3)
  // Phase 7i Sprint 2 Task 5 — no longer read by tickDroneDeployments
  // (replaced by perDrone[i].fireTimer). KEPT for back-compat with any
  // future diagnostic dump / telemetry. New writes here would be ignored.
  fireTimer: number;
  droneMeshes: Mesh[];       // backward-compat alias for perDrone[].mesh
  perDrone: PerDroneState[];
  auraRing: Mesh;
  deployShockwave: Mesh;
  // Phase 7i Sprint 2 Task 5 — 0 → trigger the deploy shockwave on the
  // first non-fade frame, ages via dt accumulation, capped past the
  // 250ms window. Reset to 0 only on a fresh spawnDroneDeployment call.
  deployShockwaveAge: number;
  sceneClock: number;        // accumulates dt; time origin for bob/spin/aura
  // Phase 7i-2 — wall-clock seconds since spawn. Drives the per-drone
  // power-pulse scale + emissive math. Separate from `sceneClock` (which
  // survives the fade-out so the existing aura ring stays consistent) so
  // the power-pulse reads as "time since deploy" rather than "time since
  // the game loop started ticking".
  elapsedSeconds: number;
  // Phase 7i-2 (Task 6) — beam-vs-asteroid hit callback. Shared across
  // all drones in the deployment so a single callback handles hits
  // (Task 9 wires this in src/game.ts to apply damage + spawn the
  // per-kill VFX). Optional and null by default so existing call sites
  // (pure-logic tests, the Playwright screenshot harness) that don't
  // care about hit routing still compile unchanged.
  beamHitCallback: ((asteroid: AsteroidState, tier: 1 | 2 | 3) => void) | null;
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
    // Phase 7i-2 (Task 6) — beam fire path. Each drone owns a beam Line
    // (additive 0xff2233, depthWrite false, both endpoints seeded at
    // (0,0,0) by createDroneBeam) and a muzzle-flash Sprite (additive
    // diamond bitmap, opacity 0 at spawn). Both are added to the scene
    // immediately so per-fire lookup never trips on a null parent; the
    // beam stays visible=false until fireDroneBeam promotes it on a
    // successful target lock. The muzzle flash is anchored to the
    // drone's mesh position each frame in tickDroneDeployments so the
    // flash reads as the gun's muzzle burst, not a sprite floating off
    // at the last fire origin.
    const beamLine = createDroneBeam(tier);
    const muzzleFlash = createMuzzleFlash(tier);
    scene.add(beamLine);
    scene.add(muzzleFlash);
    beamLine.visible = false;
    perDrone.push({
      mesh,
      bobPhase: Math.random() * Math.PI * 2,
      fireTimer: 0,
      // 999 = "past the 80ms flash window" so updateDroneVisuals does not
      // pop a flash on the spawn frame. Task 5 reset this to 0 inside the
      // per-drone fire branch on every shot — see tickDroneDeployments.
      fireFlashAge: 999,
      tetherLine,
      lockOnSprite,
      currentTarget: null,
      // Phase 7i-2 — independent phase for the idle power-pulse. Random
      // so a tier-3 (4-drone) deployment doesn't pulse in lockstep.
      powerPulsePhase: Math.random() * Math.PI * 2,
      // Phase 7i-2 (Task 6) — beam fire fields. beamAge/muzzleFlashAge
      // both start past their window so neither the beam nor the muzzle
      // flash plays on the spawn frame; the per-frame tick ages them
      // forward on demand. currentBeamTarget=null so a missing-target
      // edge case in the tick branch does not try to read a stale
      // pointer.
      beamLine,
      muzzleFlash,
      beamAge: ORBIT_DRONES_BEAM_LIFETIME_SECONDS,
      muzzleFlashAge: 999,
      currentBeamTarget: null,
      // Phase 7i-2 (Task 9) — start past the per-beam hit window so the
      // first intersection check after spawn (before the first fire) does
      // not fire the callback. fireDroneBeam resets this to false on
      // every successful lock. Initial value matches the beamAge sentinel
      // (past the lifetime window) so the field's semantics line up with
      // the "no active beam" reading.
      beamHasHitTarget: false,
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
    // Phase 7i Sprint 2 Task 5 — start at 0 so the tick loop's `=== 0`
    // equality check fires on the FIRST non-fade frame and nudges the
    // field to 0.001. The 999 placeholder used in Task 3 is gone;
    // spawnDroneDeployment is the sole creator and we now control the
    // initial value in lockstep with the tick loop trigger condition.
    deployShockwaveAge: 0,
    sceneClock: 0,
    elapsedSeconds: 0,
    // Phase 7i-2 (Task 6) — beam-vs-asteroid hit callback. Null at
    // spawn; Task 9's src/game.ts wiring sets this to the actual hit
    // handler that applies damage + spawns the per-kill VFX. The pure-
    // logic tests in tests/active-deployments.test.ts can omit the
    // callback entirely (the field is optional via the null sentinel
    // + a `dep.beamHitCallback?.(asteroid, tier)` call site in
    // Task 9).
    beamHitCallback: null,
  };
}

/**
 * Tick all live drone deployments. Mutates `deployments` in place: culls
 * expired ones (after fade-out completes), drives the new per-drone visuals
 * (bob + spin + fire-flash + tether + lock-on), pulses the aura ring,
 * ages out the deploy shockwave, and fires drone projectiles at the
 * nearest asteroid via PER-DRONE independent timers (each drone fires
 * every ORBIT_DRONES_FIRE_INTERVAL_SECONDS, so a tier-3 trio yields 7.5
 * shots/sec each).
 *
 * Returns the pruned list. Caller replaces its array with the return.
 *
 * Phase 7i Sprint 2 Task 5:
 *   - onDroneFire widened to (origin, target, droneIndex, tier) so Game
 *     can spawn the tier-coloured projectile (Task 4 factory) and tag it
 *     with KillSource.DRONE for downstream kill-routing (Task 6 sparks).
 *   - The deployment-level fireTimer is no longer read/written here —
 *     each perDrone[i].fireTimer drives its own fire cadence.
 *   - deployShockwaveAge starts at 0 and is nudged to 0.001 on the
 *     first non-fade tick so the 250ms shockwave plays ONCE on deploy.
 */
export function tickDroneDeployments(
  deployments: DroneDeploymentState[],
  shipPosition: Vector2,
  asteroids: AsteroidState[],
  deltaTime: number,
  scene: Object3D,
  onDroneFire: (
    origin: Vector2,
    target: AsteroidState,
    droneIndex: number,
    tier: 1 | 2 | 3,
  ) => void,
): DroneDeploymentState[] {
  const alive: DroneDeploymentState[] = [];
  for (const dep of deployments) {
    dep.sceneClock += deltaTime;
    // Phase 7i-2 — wall-clock seconds since spawn. Drives the per-drone
    // power-pulse math (scale + emissive breathing at 1.2 Hz). Same dt
    // accumulator as sceneClock so both clocks stay in lockstep.
    dep.elapsedSeconds += deltaTime;
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
      // Phase 7i-2 — layer the idle power-pulse ON TOP of the fire-flash
      // math that updateDroneVisuals just applied. Scale multiplies the
      // existing flash-scaled value (1.0→1.15) by the pulse factor
      // (0.92→1.08) so the fire-pop still pokes through. Emissive adds
      // the power-pulse offset (range [-0.6, +0.6]) scaled by
      // (1 - flash) so the power-pulse breathing DIMS to zero at the
      // 80ms fire-flash moment — the flash dominates the visual punch,
      // not the breath. This is the minimal layering that keeps the
      // fire-flash visible AND adds the breathing baseline.
      const flash = drone.fireFlashAge < 0.08 ? 1 - drone.fireFlashAge / 0.08 : 0;
      drone.mesh.scale.multiplyScalar(powerPulseScale(dep.elapsedSeconds, drone.powerPulsePhase));
      const mat = drone.mesh.material as MeshStandardMaterial;
      mat.emissiveIntensity += (powerPulseEmissive(dep.elapsedSeconds, drone.powerPulsePhase)
        - 0.8) * (1 - flash);
      // Phase 7i-2 — expiry telegraph alpha fade. expiryAlphaCurve returns
      // 1.0 while remaining > telegraph window, linearly ramps to 0 over
      // the last ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS (1.5s), then 0.0
      // once remaining hits 0. We write BOTH opacity and transparent so
      // the alpha change actually takes effect (createDroneMesh does NOT
      // pre-set transparent:true on the MeshStandardMaterial body, and
      // opacity writes to a non-transparent material are silently
      // ignored). Placed OUTSIDE the fire-flash block so the
      // emissiveIntensity layering above does not fight this write —
      // the fire-flash only touches emissiveIntensity, not opacity, so
      // the two channels compose cleanly. Fade-out starts when
      // dep.remaining <= 0 (next block), at which point the per-drone
      // loop is skipped, so alpha=0 lands exactly as the scale-shrink
      // fade-out takes over.
      const alpha = expiryAlphaCurve(dep.remaining);
      mat.opacity = alpha;
      mat.transparent = true;
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
      // Age the per-drone fire-flash. It is incremented every frame so the
      // 80ms pop decays smoothly. updateDroneVisuals above reads the same
      // value via the closure on `drone.fireFlashAge`, so toggling the
      // field here is enough to drive the visual.
      if (drone.fireFlashAge < 999) drone.fireFlashAge += deltaTime;
      // Per-drone independent fire timer (Phase 7i Sprint 2). Each drone
      // has its own countdown; a tier-3 trio therefore fires at the
      // ORBIT_DRONES_FIRE_INTERVAL_SECONDS cadence (0.4s) **per drone**,
      // yielding 3 × 2.5 = 7.5 shots/sec for the whole deployment — much
      // denser than the old single-deployment cadence. fireFlashAge is
      // reset to 0 so the drone's body pops for 80ms.
      //
      // Phase 7i-2 — fire-rate taper in the last 2s of life. interval
      // starts at ORBIT_DRONES_FIRE_INTERVAL_SECONDS (0.4s) and linearly
      // ramps to ORBIT_DRONES_FIRE_INTERVAL_TAPER_END (1.0s) across
      // elapsedSeconds = [DURATION-2, DURATION] = [9, 11]. The trigger
      // compares against the LIVE interval, not the constant, so the
      // reset-to-zero pattern still works: fireTimer crosses interval,
      // we fire, then reset to 0 and accumulate toward the NEXT
      // (potentially larger) interval. The taper is independent per
      // drone (each drone reads dep.elapsedSeconds separately), so a
      // tier-3 deployment doesn't all slow down in lockstep — each
      // drone's fireTimer happens to cross interval on different frames
      // anyway because of the bob/spin phase desync.
      let interval = ORBIT_DRONES_FIRE_INTERVAL_SECONDS;
      const taperStart = ORBIT_DRONES_DURATION_SECONDS - 2.0;
      if (dep.elapsedSeconds >= taperStart) {
        const taperFraction = Math.min(
          1,
          (dep.elapsedSeconds - taperStart) / 2.0,
        );
        interval = ORBIT_DRONES_FIRE_INTERVAL_SECONDS +
          (ORBIT_DRONES_FIRE_INTERVAL_TAPER_END - ORBIT_DRONES_FIRE_INTERVAL_SECONDS)
            * taperFraction;
      }
      drone.fireTimer += deltaTime;
      if (drone.fireTimer >= interval) {
        drone.fireTimer = 0;
        const target = drone.currentTarget;
        if (target) {
          drone.fireFlashAge = 0;
          // Phase 7i-2 (Task 6) — beam fire replaces projectile fire.
          // The previous per-drone fire path called the onDroneFire
          // callback (which Game's fireDroneProjectile implemented as a
          // tier-coloured projectile spawn). The beam path makes the
          // projectile mesh redundant — the beam line + muzzle flash
          // Sprite carry the visual punch, and beam-vs-asteroid hits
          // are resolved by the new beamHitCallback (wired in Task 9).
          // We deliberately do NOT call onDroneFire here so Game does
          // not spawn a real projectile mesh every fire cadence (which
          // would still damage asteroids after the `'DRONE'` literal
          // was removed in Step 6). fireDroneBeam below drives the
          // visual layer only; damage application is deferred to
          // Task 9's beamHitCallback wiring.
          fireDroneBeam(dep, drone, i, target, scene);
        }
      }
      // Phase 7i-2 (Task 6) — per-frame beam + muzzle-flash tick.
      // The beam line is only visible inside its 0.25s lifetime window
      // (fireDroneBeam promotes it on a successful target lock and the
      // accumulator below hides it once beamAge crosses the lifetime).
      // While visible, we re-write the beam endpoints every frame so the
      // line tracks the asteroid as it drifts — the Line geometry does
      // NOT auto-track, so without this loop the beam endpoint would
      // freeze at the original target position. Same pattern for the
      // muzzle flash: the sprite is re-anchored to the drone's mesh
      // position (which the orbital+bob math above just updated) and
      // opacity is driven by updateMuzzleFlash's half-sine over the
      // 80ms window. Both age fields are dt-accumulating, and
      // incrementing them every frame (regardless of visibility) is
      // intentional — the 999 sentinel pattern means "no beam/muzzle
      // active" and we just keep counting past the window.
      if (drone.beamLine && drone.beamLine.visible) {
        drone.beamAge += deltaTime;
        if (drone.beamAge >= ORBIT_DRONES_BEAM_LIFETIME_SECONDS) {
          drone.beamLine.visible = false;
          drone.currentBeamTarget = null;
        } else if (drone.currentBeamTarget) {
          updateBeam(
            drone.beamLine,
            drone.mesh.position,
            drone.currentBeamTarget.position as unknown as Vector3,
          );
        }
      }
      if (drone.muzzleFlashAge < 0.08) {
        drone.muzzleFlashAge += deltaTime;
        drone.muzzleFlash.position.copy(drone.mesh.position);
        updateMuzzleFlash(drone.muzzleFlash, drone.muzzleFlashAge);
      }
    }
    // Phase 7i-2 — aura pulse frequency shift. Replaces the call to
    // updateAuraPulse (which hard-codes a 2Hz pulse inside
    // src/orbit-drone-vfx.ts) with frequency-shifted math computed here.
    // The shift is a SWAP, not a stack: 2.0 Hz during the active phase,
    // 5.0 Hz during the last ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS
    // (1.5s). We replicate the same baseline 0.35 / amplitude 0.25
    // shape updateAuraPulse uses (range [0.10, 0.60] with raw sine) so
    // the visual feels identical pre-telegraph — only the frequency
    // changes. dep.tier is typed `1 | 2 | 3` (the legacy tier===0 case
    // from updateAuraPulse is gone post-Sprint 3), so the ring is
    // always visible during the active phase. We do NOT use
    // updateAuraPulse because threading a frequency param through
    // would require editing src/orbit-drone-vfx.ts, which is out of
    // scope for Task 5.
    dep.auraRing.visible = true;
    const auraFreq = dep.remaining <= ORBIT_DRONES_EXPIRY_TELEGRAPH_SECONDS
      ? ORBIT_DRONES_EXPIRY_AURA_FREQUENCY_HZ
      : 2.0;
    const auraPulse = Math.sin(dep.sceneClock * auraFreq * Math.PI * 2);
    (dep.auraRing.material as MeshBasicMaterial).opacity =
      0.35 + 0.25 * auraPulse;
    // Phase 7i Sprint 2 Task 5 — play the deploy shockwave ONCE on the
    // first non-fade tick after spawn. The `=== 0` exact-equality check
    // fires only on the first frame (spawnDroneDeployment initializes
    // deployShockwaveAge to 0). We nudge to 0.001 so the field is now
    // non-zero and subsequent frames skip the equality arm; the
    // accumulator below ages the shockwave through the 250ms window.
    // After that window the field eclipses 0.25 and updateDeployShockwave
    // hides the ring naturally — we do not reset to a sentinel because
    // re-deploys are uncommon and the per-frame `< 999` check is cheap.
    if (dep.deployShockwaveAge === 0) {
      dep.deployShockwaveAge = 0.001; // start the 250ms animation
    }
    if (dep.deployShockwaveAge > 0 && dep.deployShockwaveAge < 999) {
      dep.deployShockwaveAge += deltaTime;
    }
    updateDeployShockwave(dep.deployShockwave, dep.deployShockwaveAge);
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
    // Phase 7i-2 (Task 7) DELTA — dispose beam + muzzle flash GPU resources.
    // The beam Line owns a per-instance BufferGeometry (created by
    // createDroneBeam in src/orbit-drone-vfx.ts with two vertices for the
    // drone→target segment) — safe to dispose. The LineBasicMaterial is
    // also per-instance, so dispose that too. Null the field so a stray
    // late-fire call cannot resurrect a disposed mesh. The muzzle flash
    // is a Sprite with a per-instance SpriteMaterial (which holds a
    // reference to the SHARED lock-on CanvasTexture from
    // getSharedLockOnTexture). Dispose the material — this decrements
    // the shared texture's ref count, but the texture itself lives in
    // module-scope and is reused by every deployment + drone-kill
    // sparks, so it MUST NOT be disposed here. Do NOT dispose the
    // sprite's geometry either — Sprites share a unit-square
    // SpriteGeometry that is not safe to dispose per-instance. We do
    // NOT null the muzzleFlash field because it is typed as `Sprite`
    // (not `Sprite | null`) in PerDroneState; the sprite object is
    // orphaned (no longer in the scene) and the material dispose is
    // enough to release the per-deployment GPU resource.
    if (drone.beamLine) {
      scene.remove(drone.beamLine);
      drone.beamLine.geometry.dispose();
      (drone.beamLine.material as LineBasicMaterial).dispose();
      drone.beamLine = null;
    }
    if (drone.muzzleFlash) {
      scene.remove(drone.muzzleFlash);
      (drone.muzzleFlash.material as SpriteMaterial).dispose();
    }
  }
  scene.remove(dep.auraRing);
  dep.auraRing.geometry.dispose();
  (dep.auraRing.material as MeshBasicMaterial).dispose();
  scene.remove(dep.deployShockwave);
  dep.deployShockwave.geometry.dispose();
  (dep.deployShockwave.material as MeshBasicMaterial).dispose();
}

/**
 * Phase 7i Sprint 2 Task 5 (crystal-priority targeting; NOT WIRED YET) —
 * drone targeting priority helper. Crystals first (the lucrative cascade
 * targets), then non-tiny iron (any size except TINY), then TINY as a
 * last resort. Within each tier, picks the nearest. Skips the `ignore`
 * asteroid (typically a drone's sticky cross-frame target so we do not
 * pick ourselves).
 *
 * Task 5 deliberately does NOT swap this in — the per-drone fire loop
 * still calls findNearestAsteroid. A future Sprint 3 task can wire this
 * helper in to give drones a crystal-priority "lock onto cascade
 * targets" behaviour, which is the user's stated preference for the
 * AI-vs-AI drone combat feel.
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

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Drone Beam Fire (Phase 7i-2 Task 6)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7i-2 — replace the per-tick projectile fire path with an
//          instant red beam. The previous fireDroneProjectile (Phase 7i
//          Sprint 2 Task 4) returned a tier-colored Mesh + velocity that
//          Game integrated as a normal projectile. That path was visually
//          noisy (a swarm of small spheres flying across the arena) and
//          functionally redundant with the homing-missile pickup — both
//          were "drone emits a moving projectile at the target". The beam
//          reads as a different category of attack: instant, instant-
//          contact, and the "burst" is purely a per-frame visual on the
//          drone's body and the target's location.
// Setup:   Caller (tickDroneDeployments) invokes fireDroneBeam at the
//          per-drone fire cadence (ORBIT_DRONES_FIRE_INTERVAL_SECONDS,
//          0.4s). The function mutates the per-drone visual state in
//          place: promotes the beam line to visible, writes both
//          endpoints via updateBeam, resets the muzzle-flash age to 0
//          so the next-frame tick picks it up, and preserves the
//          existing per-fire flash (scale pop + emissive boost) so the
//          drone's body still telegraphs the shot. Damage is NOT
//          applied here — beam-vs-asteroid hits are routed through
//          dep.beamHitCallback, which Task 9 wires in src/game.ts to
//          apply ORBIT_DRONES_DAMAGE per beam tick.
// Issues:  Pre-Task 6, fireDroneProjectile returned a SphereGeometry +
//          MeshBasicMaterial projectile that travelled at PROJECTILE_SPEED
//          (28u/s). At 0.4s fire cadence and 7-10u beam reach, drones
//          needed a flight arc to reach mid-arena asteroids — the
//          "shooting" visual was a string of cyan/magenta/gold dots
//          arcing across the screen, not a clear "this drone is
//          attacking that rock" cue.
// Fix:     Phase 7i-2 Task 6. Replace the projectile factory with a
//          visual-only fireDroneBeam. The beam is a single Line (additive
//          0xff2233, depthWrite false) seeded at spawn with both
//          endpoints at (0,0,0); the per-drone tick loop rewrites the
//          endpoints every frame inside the 0.25s window so the line
//          tracks the asteroid as it drifts. Muzzle flash is a Sprite
//          (additive diamond bitmap) that the tick loop re-anchors to
//          the drone's mesh position and drives with a half-sine opacity
//          curve over 80ms. fireDroneProjectile is DELETED (its
//          call sites in tickDroneDeployments are replaced by
//          fireDroneBeam) and the related 'DRONE' literal in
//          Projectile.source is removed (Step 6). KillSource.DRONE
//          stays in pickups.ts — it's still used for kill-sparks
//          routing once the beam starts dealing damage in Task 9.
// Gotchas: fireDroneBeam is purely visual; it does NOT call
//          dep.beamHitCallback. The callback is invoked by the per-frame
//          tick loop while the beam is alive and the currentBeamTarget
//          is in range (Task 9 wires that). Returning a void preserves
//          the call-site readability in tickDroneDeployments — the
//          `fireDroneBeam(dep, drone, i, target, scene);` line reads
//          as a single visual + logic dispatch. The `drone.beamLine!`
//          non-null assertion in the per-frame tick is safe because
//          spawnDroneDeployment always initialises the field with a
//          real createDroneBeam() result; the `!` is a TypeScript
//          hint, not a runtime guard. findDroneTarget is the targeting
//          helper used here (crystal > non-tiny > tiny) so the beam
//          prefers lucrative cascade targets — matches the per-drone
//          re-target behaviour the rest of the tick loop already uses.
//          The brief originally asked fireDroneBeam to take a
//          `shipPosition: Vector2` arg, but tickDroneDeployments does
//          not have the ship's position in scope inside the per-drone
//          loop (the deployment is positioned at the spawn site, the
//          drone's position is in drone.mesh.position). The ship's
//          position is also unused inside fireDroneBeam (we probe
//          from the drone, not the ship), so the arg is omitted to
//          keep the call site minimal.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Phase 7i-2 (Task 6) — beam fire replaces projectile fire. Promotes
 * the drone's beam line to visible, writes both endpoints via
 * updateBeam, resets the muzzle-flash age to 0 so the next-frame tick
 * can run updateMuzzleFlash, and preserves the existing per-fire flash
 * (scale pop + emissive boost) so the drone's body still telegraphs
 * the shot.
 *
 * This is a purely-visual fire dispatch. Damage application is deferred
 * to Task 9's beamHitCallback wiring; fireDroneBeam itself does NOT
 * touch asteroid health. The currentBeamTarget pointer is stashed on
 * the per-drone state so the per-frame tick can re-write the beam
 * endpoint every frame as the asteroid drifts.
 */
export function fireDroneBeam(
  _deployment: DroneDeploymentState,
  drone: PerDroneState,
  _droneIndex: number,
  target: AsteroidState,
  _scene: Object3D,
): void {
  drone.currentBeamTarget = target;
  drone.beamAge = 0;
  drone.muzzleFlashAge = 0;
  // Existing per-fire flash (scale pop + emissive boost) stays.
  drone.fireFlashAge = 0;
  // Phase 7i-2 (Task 9) — re-arm the per-beam-once hit gate. The previous
  // beam may have left beamHasHitTarget=true (or false if it never
  // landed); we want the FIRST intersection check this frame to be
  // eligible to fire the callback. Subsequent frames within the same
  // beam's ORBIT_DRONES_BEAM_LIFETIME_SECONDS (0.25s) window will see
  // beamHasHitTarget=true and short-circuit — so 1 hit per beam.
  drone.beamHasHitTarget = false;
  if (target && drone.beamLine) {
    drone.beamLine.visible = true;
    updateBeam(
      drone.beamLine,
      drone.mesh.position,
      target.position as unknown as Vector3,
    );
  }
}

