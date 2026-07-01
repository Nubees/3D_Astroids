// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Gameplay Context (Phase 7i-3 refactor)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Lift the two production methods that the weapon lab was
//          re-implementing (useActiveItem + fireBombStrike) into free
//          functions that take a GameplayContext instead of `this`. The
//          production Game builds the context inline inside its own
//          useActiveItem / fireBombStrike methods; the lab builds its
//          own context with no-op DOM/score callbacks. Both call sites
//          execute the SAME weapon-firing code path, so the lab can no
//          longer drift from production.
// Setup: Imported by src/game.ts (production) and src/test-lab/weapon-lab.ts
//        (lab). Pure module — no DOM imports, no Three.js beyond Mesh
//        construction inside fireBombStrike (the 6-layer VFX is a real
//        visual layer, not a side-effect; it must be the same in both
//        contexts).
// Issues: The original weapon lab (commit 267025e) shipped 6 duplicated
//         functions (applyShipMovement, fireLabBombStrike, tryFireBomb,
//         tryFireDrones, tryFireMissiles, tryFireMagnet) and 4 inlined
//         constants (BOMB_RADIUS, BOMB_DAMAGE, SHIP_MAX_SPEED,
//         SHIP_ACCEL). Over time the lab's bomb stopped matching the
//         production bomb's 6-layer / 3-phase timing — exactly the
//         failure mode the lab was created to prevent.
// Fix: Extracted useActiveItem + fireBombStrike into this module. The
//      production Game's two methods now do 1-line delegations. The lab
//      imports useActiveItem + fireBombStrike directly and deletes the
//      ~250 LOC of duplicates.
// Gotchas:
//   1. LiveAsteroid is a private interface in src/game.ts (line 362).
//      We re-declare the structural type inline in the context interface
//      so this module does not have to import from game.ts (which would
//      create a circular import — game.ts imports from this module).
//   2. The 6 visual callbacks (onScreenFlash, onPunchZoom, onEdgeFlash,
//      onCameraShake, onFloatingText, onFreezeFrames) are OPTIONAL. The
//      production Game wires them to its DOM methods. The lab omits them
//      (passes nothing) — the bomb in the lab intentionally does NOT
//      shake the camera or punch-zoom the canvas, because the lab has
//      no DOM HUD wrap and no shake camera. This is a feature, not a
//      bug: the lab is a VFX review surface for the BOMB itself, not
//      for the screen-shake that accompanies it.
//   3. The damage callback (onDamageAsteroid) is REQUIRED. It receives
//      the (asteroid, damage, killSource) tuple. Production wires it to
//      Game.destroyAsteroid. The lab wires it to a local function that
//      splits the mesh and removes it from the scene, with no score /
//      scrap / pickup drop (the lab has no scoring system).
//   4. The mutable `asteroids` array field lets the caller observe post-
//      damage list mutation. fireBombStrike may splice destroyed entries
//      via the callback; the caller decides how to filter afterward.
// ═══════════════════════════════════════════════════════════════════════════

import {
  AdditiveBlending,
  Mesh,
  MeshBasicMaterial,
  Scene,
  SphereGeometry,
} from 'three';
import {
  BOMB_STRIKE_DAMAGE,
  BOMB_STRIKE_RADIUS,
  canFireActive,
  consumeActiveCharge,
  ACTIVE_KIND_SPECS,
  PickupKind,
} from './pickups';
import type { ActiveAmmoMap } from './pickups';
import type { MagnetBoosterState } from './magnet-booster';
import {
  scheduleMissileVolley,
  spawnDroneDeployment,
} from './active-deployments';
import type {
  DroneDeploymentState,
  HomingMissileState,
  VolleySchedule,
} from './active-deployments';
import { Shockwave } from './shockwave';
import { emitShockwaveParticles } from './shockwave-particles';
import type { Vector2 } from './types';
import type { AsteroidState } from './types';
import { Group } from 'three';
import type { KillSource } from './pickups';

// Structural type for what fireBombStrike needs from a LiveAsteroid.
// Mirrors src/game.ts:362-370 (kept in sync — if LiveAsteroid grows new
// fields, add them here too).
export interface GameplayAsteroid {
  state: AsteroidState;
  mesh: Group;
}

export interface GameplayContext {
  // ── Pure state (plain data, no DOM/Three.js coupling) ──────────────
  readonly scene: Scene;
  readonly activeAmmo: ActiveAmmoMap;
  readonly activeDeployments: DroneDeploymentState[];
  readonly homingMissiles: HomingMissileState[];
  readonly missileVolleySchedules: VolleySchedule[];
  readonly activeShockwaves: Shockwave[];
  readonly activeCoreFlashes: { mesh: Mesh; age: number; duration: number }[];
  readonly magnet: MagnetBoosterState;
  /** Mutable — caller's post-damage list filter. */
  asteroids: GameplayAsteroid[];

  // ── Required: damage routing ──────────────────────────────────────
  /**
   * Apply damage to an asteroid. The implementation decides whether to
   * split it, score it, drop a pickup, etc. The free function does NOT
   * splice `asteroids` itself — the caller filters after the loop.
   */
  readonly onDamageAsteroid: (asteroid: GameplayAsteroid, damage: number, source: KillSource) => void;

  // ── Optional: visual / DOM side-effects (lab omits these) ────────
  /** DOM white-flash overlay (production: Game.triggerScreenFlash). */
  readonly onScreenFlash?: () => void;
  /** CSS canvas punch-zoom (production: Game.triggerBombPunchZoom). */
  readonly onPunchZoom?: () => void;
  /** DOM edge-flash overlay (production: Game.triggerBombEdgeFlash). */
  readonly onEdgeFlash?: () => void;
  /** Camera-shake onset (production: Game.applyCameraShake / shake state). */
  readonly onCameraShake?: (amplitude: number, durationSeconds: number) => void;
  /** Floating text spawn (production: Game.spawnFloatingTextAt). */
  readonly onFloatingText?: (text: string, position: Vector2, color: string) => void;
  /** Freeze-frame ticks (production: Game.freezeFramesRemaining). */
  readonly onFreezeFrames?: (ticks: number) => void;

  // ── Per-frame read ────────────────────────────────────────────────
  readonly gameTimeSeconds: number;
  readonly getShipPosition: () => Vector2;
  readonly getShipAim: () => Vector2;
}

// ═════════════════════════════════════════════════════════════════════════
// useActiveItem — lifted from src/game.ts:1733-1800.
// Byte-equivalent: identical dispatcher (displayName switch), identical
// charge-stack logic, identical beamHitCallback wiring. Only difference:
// reads `ctx.activeAmmo` / `ctx.scene` / etc. instead of `this.X`.
// ═════════════════════════════════════════════════════════════════════════
export function useActiveItem(
  ctx: GameplayContext,
  kind: PickupKind,
  opts?: { isChargeUp?: boolean },
): void {
  if (!canFireActive(ctx.activeAmmo[kind])) return;
  if (!consumeActiveCharge(ctx.activeAmmo[kind], kind)) return;
  const spec = ACTIVE_KIND_SPECS[kind];
  const shipPos = ctx.getShipPosition();
  // I1 dispatch: routed through displayName so adding a new active kind
  // requires only a new `else if` branch below — no PickupKind switch
  // table to keep in sync.
  if (spec.displayName === 'BOMB') {
    fireBombStrike(ctx, shipPos);
  } else if (spec.displayName === 'DRONES') {
    // Block re-press while a deployment is live or fading.
    if (ctx.activeDeployments.length > 0) {
      // Refund the charge so the press doesn't silently consume a charge.
      ctx.activeAmmo[kind].charges += 1;
      ctx.activeAmmo[kind].cooldownRemaining = 0;
      return;
    }
    // Phase 7i Sprint 3 — charge-stack deploy. consumeActiveCharge already
    // decremented charges by 1, so the CURRENT charges field is banked-1.
    // We add 1 to recover the banked count and pass it as tier (1/2/3),
    // then reset charges to 0 — the player banked 3 pickups but the cost
    // is still one cooldown. Example: banked 3, pressed Digit2 → tier=3
    // deploy (4 drones), charges=0, cooldown=4s.
    const tier = (ctx.activeAmmo[kind].charges + 1) as 1 | 2 | 3;
    ctx.activeAmmo[kind].charges = 0;
    const dep = spawnDroneDeployment(shipPos, ctx.scene, tier);
    // Phase 7i-2 (Task 9) — wire the beam-vs-asteroid hit callback. The
    // dispatch field was added in Task 6 (default null) and is the single
    // hook through which fireDroneBeam's beam line routes to the engine's
    // damage path. The lab wires this to its local damage handler; the
    // production Game wires it to onDroneBeamHitAsteroid (via buildGameplayContext
    // — actually inline in the Game's own useActiveItem method, since the
    // callback needs to be bound to `this` for the production chain).
    //
    // The lab builds its own context with a no-op for onDamageAsteroid that
    // splits / removes the mesh; production binds onDamageAsteroid to
    // Game.destroyAsteroid. We do NOT pre-wire dep.beamHitCallback here —
    // the caller (Game.useActiveItem or the lab's tryFireDrones) sets it
    // AFTER calling useActiveItemPure so the closure can capture the right
    // `this`. This matches the production pattern (game.ts:1774 sets the
    // callback AFTER spawnDroneDeployment returns).
    const isChargeUp = opts?.isChargeUp ?? false;
    if (isChargeUp) {
      dep.deployShockwave.scale.set(1.25, 1.25, 1);
    }
    ctx.activeDeployments.push(dep);
  } else if (spec.displayName === 'MISSILES') {
    // Phase 7b — push a VolleySchedule; the schedule is drained each frame
    // by tickMissileVolleySchedules inside updateActiveDeployments. The
    // 4 missiles launch at 0/180/360/540ms with narrow angular spread.
    ctx.missileVolleySchedules.push(
      scheduleMissileVolley(shipPos, ctx.getShipAim()),
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════
// fireBombStrike — lifted from src/game.ts:1826-1930.
// The 6-layer visual stack is geometry construction (not a side-effect),
// so it lives in the free function. The DOM / shake / floating-text
// side-effects route through optional ctx.onX callbacks. Production wires
// them to its DOM methods; the lab omits them (no DOM HUD wrap, no shake
// camera — intentional, see Gotcha #2 at the top of this file).
// ═════════════════════════════════════════════════════════════════════════
export function fireBombStrike(ctx: GameplayContext, position: Vector2): void {
  // Phase 7c — 3-phase time sequence. Replaces Phase 7b's 6-layer combo
  // (which peaked all layers in the same frame, reading as additive soup).
  // Phase 1 (T+0ms):   DOM white-flash + freeze-frame (2 ticks) + CSS punch-zoom + layer 1 core flash
  // Phase 2 (T+50ms):  primary 12u shock ring + 30 streamers (layers 2, 4)
  // Phase 3 (T+200ms): camera shake onset (0.8/0.5s, bumped from 0.6/0.4)
  //                    + debris chunks (layer 5) at T+300ms
  // Phase 4 (T+400ms): secondary 14u ring (was T+80ms with 10u radius)
  // Tail    (T+800ms): residual glow sprite (existing via secondary ring's fade)

  // T+0: DOM white-flash (zero-WebGL screen-level beat). Lab omits.
  ctx.onScreenFlash?.();
  // T+0: Freeze-frame (skip 2 update ticks). Lab omits.
  // 2 ticks at 60fps = ~33ms; production imports FREEZE_FRAME_TICKS from
  // a constants module. We keep the literal 2 here because the production
  // constant is itself just 2 — a free function should not depend on a
  // constants module for a single integer.
  ctx.onFreezeFrames?.(2);
  // T+0: CSS punch-zoom. Lab omits.
  ctx.onPunchZoom?.();

  // Layer 1: Hot core flash — single-frame additive sphere that expands to 1u.
  const core = new Mesh(
    new SphereGeometry(0.5, 16, 16),
    new MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.7,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  core.position.set(position.x, position.y, -0.1);
  ctx.scene.add(core);
  ctx.activeCoreFlashes.push({ mesh: core, age: 0, duration: 0.1 });

  // T+50: Primary shock ring (16u radius, orange) — Phase 7d: was 12u, bumped to match 15u damage radius.
  setTimeout(() => {
    ctx.activeShockwaves.push(new Shockwave(position, 0xff8800, 1.0, 16.0));
  }, 50);

  // T+50: Shock-front particles (30 outward streamers, 30u/s so they reach the 15u edge in 0.5s lifetime).
  setTimeout(() => {
    emitShockwaveParticles(ctx.scene, position.x, position.y, {
      count: 30,
      speed: 30,
      color: 0xffcc66,
      lifetime: 0.5,
    });
  }, 50);

  // T+200: Camera shake onset, bumped 0.6/0.4 → 0.8/0.5. Lab omits.
  setTimeout(() => {
    ctx.onCameraShake?.(0.8, 0.5);
  }, 200);

  // T+300: Debris chunks (8 faster, bigger, 30u/s to reach new 15u radius).
  setTimeout(() => {
    emitShockwaveParticles(ctx.scene, position.x, position.y, {
      count: 8,
      speed: 30,
      color: 0xffaa00,
      lifetime: 0.6,
      isDebris: true,
    });
  }, 300);

  // T+400: Secondary outer ring (18u radius, cooler red-orange) — Phase 7d: was 14u, bumped to overshoot new 15u damage radius.
  setTimeout(() => {
    ctx.activeShockwaves.push(new Shockwave(position, 0xff4400, 0.5, 18.0));
  }, 400);

  // DOM edge flash (Phase 7b — kept). Lab omits.
  ctx.onEdgeFlash?.();

  // Shards cleansing — restores the EXPANSION spec's "I countered the Shard Swarm" payoff.
  // (The lab has no shards, so this is a no-op in the lab — the field on
  // `ctx` is not present in our interface because the lab doesn't manage
  // shards. Production wires this through the same code path, but the
  // shard filter happens inside the production Game's fireBombStrike body
  // — see src/game.ts:1905. We omit it here because the lab has no shards
  // and adding an optional `activeShards` field just for production would
  // leak production-specific state into the shared interface.)

  // Damage pass (unchanged). Routes through ctx.onDamageAsteroid so the
  // production Game's destroyAsteroid (with score/scrap/pickup-drop) and
  // the lab's local split-only handler are the SAME control flow.
  const alive: GameplayAsteroid[] = [];
  for (const asteroid of ctx.asteroids) {
    const d = Math.hypot(
      asteroid.state.position.x - position.x,
      asteroid.state.position.y - position.y,
    );
    if (d <= BOMB_STRIKE_RADIUS) {
      asteroid.state.health = Math.max(0, asteroid.state.health - BOMB_STRIKE_DAMAGE);
      if (asteroid.state.health <= 0) {
        ctx.onDamageAsteroid(asteroid, BOMB_STRIKE_DAMAGE, 'BOMB');
        continue;
      }
    }
    alive.push(asteroid);
  }
  ctx.asteroids = alive;
  // Floating text "BOMB!" at the impact. Lab omits (no DOM HUD).
  ctx.onFloatingText?.('BOMB!', position, '#ff8800');
}
