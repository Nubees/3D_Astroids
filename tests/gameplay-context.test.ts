// ═══════════════════════════════════════════════════════════════════════════
// My Rules — gameplay-context.test.ts (Phase 7i-3 refactor)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Three small unit tests that pin the lifted production
//          useActiveItem + fireBombStrike free functions in
//          src/gameplay-context.ts. The free functions are the SAME code
//          paths the production Game calls — these tests guard against
//          silent drift between the lab's mount and production's mount.
// Setup:   Pure node tests, no DOM/jsdom. We construct a minimal
//          GameplayContext in each test with a real Scene (so useActiveItem
//          can push a DroneDeploymentState) and a vi.fn() damage handler
//          + 6 optional side-effect callbacks. No real Game instance —
//          the goal is to exercise the free functions in isolation.
// Issues:  (1) GameplayContext.asteroids is `GameplayAsteroid[]` which
//          carries `state + mesh` (no `id`); production's LiveAsteroid
//          has `state + mesh + id`. The cast is type-only and the
//          free function never reads `id`, so the cast is safe.
//          (2) useActiveItem(BOMB) requires activeAmmo[kind] to have
//          `charges > 0` AND `cooldownRemaining <= 0` — see
//          canFireActive / consumeActiveCharge in src/pickups.ts.
//          (3) useActiveItem(DRONES) reads `kind === ORBIT_DRONES`
//          AND pushes a new DroneDeploymentState onto activeDeployments
//          via spawnDroneDeployment. The spawn factory creates a Group
//          with shockwave + drone mesh children, so the scene must
//          accept a Group child. (4) fireBombStrike fires multiple
//          setTimeout(50ms/200ms/300ms/400ms) — we use vi.useFakeTimers()
//          to advance time deterministically and assert the post-tick
//          state. (5) Bomb T+0 layers 1 (core flash mesh) + DOM
//          callbacks fire immediately; the shockwave at T+50 needs
//          fake timers to land.
// Gotchas: Tests assert that the side-effect callbacks ARE called with
//          the right payload (one bomb, one drone, one floating text)
//          and that the damage callback is NOT called when no asteroids
//          are in the radius. They do NOT exercise the visual
//          correctness of the 6 layers (that's covered by Playwright
//          visual verification in the production game). They also do
//          NOT exercise the freeze-frame / camera-shake state mutations
//          because those are Game-side concerns — the free function
//          routes them through callbacks, so the test asserts the
//          callback fired, not that Game.freezeFramesRemaining was set.
// ═══════════════════════════════════════════════════════════════════════════

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Group, Scene } from 'three';
import {
  fireBombStrike,
  useActiveItem,
} from '../src/gameplay-context';
import type { GameplayContext, GameplayAsteroid } from '../src/gameplay-context';
import {
  PickupKind,
  createEmptyActiveAmmo,
} from '../src/pickups';
import { createMagnetBooster } from '../src/magnet-booster';

function makeContext(overrides: Partial<GameplayContext> = {}): GameplayContext {
  const scene = overrides.scene ?? new Scene();
  return {
    scene,
    activeAmmo: overrides.activeAmmo ?? createEmptyActiveAmmo(),
    activeDeployments: overrides.activeDeployments ?? [],
    homingMissiles: overrides.homingMissiles ?? [],
    missileVolleySchedules: overrides.missileVolleySchedules ?? [],
    activeShockwaves: overrides.activeShockwaves ?? [],
    activeCoreFlashes: overrides.activeCoreFlashes ?? [],
    magnet: overrides.magnet ?? createMagnetBooster(),
    asteroids: overrides.asteroids ?? [],
    onDamageAsteroid: overrides.onDamageAsteroid ?? vi.fn(),
    onScreenFlash: overrides.onScreenFlash,
    onPunchZoom: overrides.onPunchZoom,
    onEdgeFlash: overrides.onEdgeFlash,
    onCameraShake: overrides.onCameraShake,
    onFloatingText: overrides.onFloatingText,
    onFreezeFrames: overrides.onFreezeFrames,
    gameTimeSeconds: overrides.gameTimeSeconds ?? 0,
    getShipPosition: overrides.getShipPosition ?? (() => ({ x: 0, y: 0 })),
    getShipAim: overrides.getShipAim ?? (() => ({ x: 0, y: 1 })),
  };
}

describe('useActiveItem (Phase 7i-3 refactor)', () => {
  let ctx: GameplayContext;
  let onScreenFlash: Mock<() => void>;
  let onPunchZoom: Mock<() => void>;
  let onEdgeFlash: Mock<() => void>;
  let onFloatingText: Mock<(text: string, position: { x: number; y: number }, color: string) => void>;
  let onFreezeFrames: Mock<(ticks: number) => void>;

  beforeEach(() => {
    onScreenFlash = vi.fn();
    onPunchZoom = vi.fn();
    onEdgeFlash = vi.fn();
    onFloatingText = vi.fn();
    onFreezeFrames = vi.fn();
    ctx = makeContext({
      onScreenFlash,
      onPunchZoom,
      onEdgeFlash,
      onFloatingText,
      onFreezeFrames,
    });
  });

  it('BOMB dispatch fires the 4 DOM/visual callbacks and consumes 1 charge', () => {
    // Pre-load: 1 charge, 0 cooldown.
    ctx.activeAmmo[PickupKind.BOMB_STRIKE].charges = 1;
    ctx.activeAmmo[PickupKind.BOMB_STRIKE].cooldownRemaining = 0;
    const initialCharges = ctx.activeAmmo[PickupKind.BOMB_STRIKE].charges;

    useActiveItem(ctx, PickupKind.BOMB_STRIKE);

    // 4 side-effect callbacks must fire on T+0.
    expect(onScreenFlash).toHaveBeenCalledTimes(1);
    expect(onPunchZoom).toHaveBeenCalledTimes(1);
    expect(onEdgeFlash).toHaveBeenCalledTimes(1);
    expect(onFreezeFrames).toHaveBeenCalledWith(2);
    // Charge decremented by 1 (BOMB_STRIKE dispatch is non-deployable,
    // so consumeActiveCharge pulls 1 charge from the bank).
    expect(ctx.activeAmmo[PickupKind.BOMB_STRIKE].charges).toBe(initialCharges - 1);
    // No asteroids in radius → damage callback not called.
    expect(ctx.onDamageAsteroid).not.toHaveBeenCalled();
  });

  it('ORBIT_DRONES with 3 charges pushes a tier-3 deployment onto activeDeployments', () => {
    // Pre-load: 3 charges, 0 cooldown.
    ctx.activeAmmo[PickupKind.ORBIT_DRONES].charges = 3;
    ctx.activeAmmo[PickupKind.ORBIT_DRONES].cooldownRemaining = 0;
    const initialDepCount = ctx.activeDeployments.length;

    useActiveItem(ctx, PickupKind.ORBIT_DRONES);

    // 1 deployment pushed.
    expect(ctx.activeDeployments.length).toBe(initialDepCount + 1);
    // Charges reset to 0 (charge-stack deploy pattern: banked 3, cost 1 cooldown,
    // deploy tier=3, remaining charges=0 — see gameplay-context.ts:166-168).
    expect(ctx.activeAmmo[PickupKind.ORBIT_DRONES].charges).toBe(0);
    // DOM callbacks do NOT fire for the DRONES dispatch (the bomb is the
    // only kind that triggers screen flash / punch-zoom / edge flash).
    expect(onScreenFlash).not.toHaveBeenCalled();
    expect(onPunchZoom).not.toHaveBeenCalled();
    expect(onEdgeFlash).not.toHaveBeenCalled();
  });

  it('HOMING_MISSILES dispatch pushes a VolleySchedule without firing DOM callbacks', () => {
    // Pre-load: 1 charge.
    ctx.activeAmmo[PickupKind.HOMING_MISSILES].charges = 1;
    ctx.activeAmmo[PickupKind.HOMING_MISSILES].cooldownRemaining = 0;
    const initialScheduleCount = ctx.missileVolleySchedules.length;

    useActiveItem(ctx, PickupKind.HOMING_MISSILES);

    // 1 schedule pushed onto missileVolleySchedules.
    expect(ctx.missileVolleySchedules.length).toBe(initialScheduleCount + 1);
    // Charge decremented.
    expect(ctx.activeAmmo[PickupKind.HOMING_MISSILES].charges).toBe(0);
    // No DOM callbacks for missiles.
    expect(onScreenFlash).not.toHaveBeenCalled();
    expect(onPunchZoom).not.toHaveBeenCalled();
  });
});

describe('fireBombStrike (Phase 7i-3 refactor)', () => {
  let ctx: GameplayContext;
  let onScreenFlash: Mock<() => void>;
  let onPunchZoom: Mock<() => void>;
  let onEdgeFlash: Mock<() => void>;
  let onCameraShake: Mock<(amplitude: number, durationSeconds: number) => void>;
  let onFloatingText: Mock<(text: string, position: { x: number; y: number }, color: string) => void>;
  let onFreezeFrames: Mock<(ticks: number) => void>;

  beforeEach(() => {
    onScreenFlash = vi.fn();
    onPunchZoom = vi.fn();
    onEdgeFlash = vi.fn();
    onCameraShake = vi.fn();
    onFloatingText = vi.fn();
    onFreezeFrames = vi.fn();
    ctx = makeContext({
      onScreenFlash,
      onPunchZoom,
      onEdgeFlash,
      onCameraShake,
      onFloatingText,
      onFreezeFrames,
    });
  });

  it('with empty asteroids array still emits the T+0 callbacks + floating text + core flash mesh', () => {
    fireBombStrike(ctx, { x: 0, y: 0 });

    // T+0 callbacks all fire.
    expect(onScreenFlash).toHaveBeenCalledTimes(1);
    expect(onPunchZoom).toHaveBeenCalledTimes(1);
    expect(onFreezeFrames).toHaveBeenCalledWith(2);
    // Floating text fires synchronously at the end of fireBombStrike.
    expect(onFloatingText).toHaveBeenCalledTimes(1);
    expect(onFloatingText).toHaveBeenCalledWith(
      'BOMB!',
      { x: 0, y: 0 },
      '#ff8800',
    );
    // Layer 1 core flash: a Mesh was added to the scene.
    // T+0 layer 1 = a SphereGeometry-mesh in activeCoreFlashes[0].
    expect(ctx.activeCoreFlashes.length).toBe(1);
    expect(ctx.scene.children.length).toBeGreaterThan(0);
    // Camera shake is scheduled at T+200, not T+0 — so it has NOT fired
    // by the time the synchronous body returns. We assert no shake yet
    // (fake timers below advance time and assert the shake callback).
    expect(onCameraShake).not.toHaveBeenCalled();
    // No asteroids → damage callback not called.
    expect(ctx.onDamageAsteroid).not.toHaveBeenCalled();
  });

  it('with fake timers, T+200 camera shake + T+50 primary shockwave fire after advancing time', () => {
    vi.useFakeTimers();
    try {
      fireBombStrike(ctx, { x: 0, y: 0 });
      // T+0: core flash mesh is in the scene; no shockwave yet.
      expect(ctx.activeShockwaves.length).toBe(0);
      expect(onCameraShake).not.toHaveBeenCalled();

      // Advance 250ms — past the T+50 shockwave AND the T+200 camera shake.
      vi.advanceTimersByTime(250);
      expect(ctx.activeShockwaves.length).toBeGreaterThanOrEqual(1);
      expect(onCameraShake).toHaveBeenCalledWith(0.8, 0.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('with one asteroid in radius, the damage callback is called with BOMB source', () => {
    // Build a minimal asteroid — gameplay-context.ts reads asteroid.state.position
    // and asteroid.state.health. The state type from src/types.ts has these.
    const asteroid: GameplayAsteroid = {
      state: {
        position: { x: 5, y: 0 }, // within 15u of (0,0)
        velocity: { x: 0, y: 0 },
        health: 10,
        maxHealth: 10,
        size: 0,
        kind: 0,
        isTargeted: false,
        fractured: false,
        // The free function only reads .position and .health; the rest is
        // opaque to the test as long as the type compiles.
      } as unknown as GameplayAsteroid['state'],
      mesh: new Group(),
    };
    ctx.asteroids = [asteroid];

    fireBombStrike(ctx, { x: 0, y: 0 });

    // Damage callback fires once with the bomb's source attribution.
    expect(ctx.onDamageAsteroid).toHaveBeenCalledTimes(1);
    // First arg is the asteroid reference, second is the damage (10),
    // third is the KillSource ('BOMB').
    expect(ctx.onDamageAsteroid).toHaveBeenCalledWith(
      asteroid,
      10,
      'BOMB',
    );
    // The free function rebuilds ctx.asteroids to drop destroyed entries.
    // The single asteroid was destroyed (health 10 - damage 10 = 0),
    // so the rebuilt array is empty.
    expect(ctx.asteroids.length).toBe(0);
  });
});
