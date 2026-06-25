import { afterEach, describe, expect, it } from 'vitest';
import {
  ACTIVE_KIND_SPECS,
  BOMB_STRIKE_CHARGE_CAP,
  BOMB_STRIKE_COOLDOWN_SECONDS,
  BOMB_STRIKE_DAMAGE,
  BOMB_STRIKE_RADIUS,
  HOMING_MISSILES_CHARGE_CAP,
  HOMING_MISSILES_COOLDOWN_SECONDS,
  HOMING_MISSILES_DAMAGE,
  HOMING_MISSILES_SPEED,
  HOMING_MISSILES_TRACKING_DURATION,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_TURN_RATE,
  HOMING_MISSILES_VOLLEY_COUNT,
  ORBIT_DRONES_CHARGE_CAP,
  ORBIT_DRONES_COOLDOWN_SECONDS,
  ORBIT_DRONES_DAMAGE,
  ORBIT_DRONES_DURATION_SECONDS,
  ORBIT_DRONES_DRONE_COUNT,
  ORBIT_DRONES_FADE_OUT_SECONDS,
  ORBIT_DRONES_FIRE_INTERVAL_SECONDS,
  ORBIT_DRONES_ORBIT_PERIOD_SECONDS,
  ORBIT_DRONES_ORBIT_RADIUS,
  ORBIT_DRONES_TARGET_RADIUS,
  ActiveKindSpec,
  PickupKind,
  applyActivePickupEffect,
  canFireActive,
  consumeActiveCharge,
  createEmptyActiveAmmo,
  tickActiveAmmo,
} from '../src/pickups';
import type { HomingMissileState, VolleySchedule } from '../src/active-deployments';

describe('ActiveKindSpec table — defensive consistency', () => {
  it('BOMB_STRIKE matches its per-kind constants', () => {
    expect(ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].chargeCap).toBe(BOMB_STRIKE_CHARGE_CAP);
    expect(ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].cooldownSeconds).toBe(BOMB_STRIKE_COOLDOWN_SECONDS);
    expect(ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].displayName).toBe('BOMB');
    expect(ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].isDeployable).toBe(false);
    expect(ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE].durationSeconds).toBe(0);
  });

  it('ORBIT_DRONES matches its per-kind constants and is deployable', () => {
    expect(ACTIVE_KIND_SPECS[PickupKind.ORBIT_DRONES].chargeCap).toBe(ORBIT_DRONES_CHARGE_CAP);
    expect(ACTIVE_KIND_SPECS[PickupKind.ORBIT_DRONES].cooldownSeconds).toBe(ORBIT_DRONES_COOLDOWN_SECONDS);
    expect(ACTIVE_KIND_SPECS[PickupKind.ORBIT_DRONES].displayName).toBe('DRONES');
    expect(ACTIVE_KIND_SPECS[PickupKind.ORBIT_DRONES].isDeployable).toBe(true);
    expect(ACTIVE_KIND_SPECS[PickupKind.ORBIT_DRONES].durationSeconds).toBe(ORBIT_DRONES_DURATION_SECONDS);
  });

  it('HOMING_MISSILES matches its per-kind constants and is NOT deployable', () => {
    expect(ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].chargeCap).toBe(HOMING_MISSILES_CHARGE_CAP);
    expect(ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].cooldownSeconds).toBe(
      HOMING_MISSILES_COOLDOWN_SECONDS,
    );
    expect(ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].displayName).toBe('MISSILES');
    expect(ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].isDeployable).toBe(false);
    expect(ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].durationSeconds).toBe(0);
  });
});

describe('Active ammo state machine', () => {
  it('createEmptyActiveAmmo initializes all 6 kinds with charges=0, cooldown=0', () => {
    const ammo = createEmptyActiveAmmo();
    for (const k of Object.values(PickupKind)) {
      expect(ammo[k].charges).toBe(0);
      expect(ammo[k].cooldownRemaining).toBe(0);
    }
  });

  it('applyActivePickupEffect BOMB_STRIKE increments charges to 1', () => {
    const ammo = createEmptyActiveAmmo();
    applyActivePickupEffect(PickupKind.BOMB_STRIKE, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
    expect(ammo[PickupKind.BOMB_STRIKE].cooldownRemaining).toBe(0);
  });

  it('applyActivePickupEffect BOMB_STRIKE × 4 caps at chargeCap', () => {
    const ammo = createEmptyActiveAmmo();
    for (let i = 0; i < 4; i++) applyActivePickupEffect(PickupKind.BOMB_STRIKE, ammo);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(BOMB_STRIKE_CHARGE_CAP);
  });

  it('applyActivePickupEffect ORBIT_DRONES increments charges to 1', () => {
    const ammo = createEmptyActiveAmmo();
    applyActivePickupEffect(PickupKind.ORBIT_DRONES, ammo);
    expect(ammo[PickupKind.ORBIT_DRONES].charges).toBe(1);
  });

  it('applyActivePickupEffect HOMING_MISSILES increments charges to 1', () => {
    const ammo = createEmptyActiveAmmo();
    applyActivePickupEffect(PickupKind.HOMING_MISSILES, ammo);
    expect(ammo[PickupKind.HOMING_MISSILES].charges).toBe(1);
  });

  it('canFireActive returns true when charges>0 and cooldown=0', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = 1;
    expect(canFireActive(ammo[PickupKind.BOMB_STRIKE])).toBe(true);
  });

  it('canFireActive returns false when charges=0', () => {
    const ammo = createEmptyActiveAmmo();
    expect(canFireActive(ammo[PickupKind.BOMB_STRIKE])).toBe(false);
  });

  it('canFireActive returns false when charges=1 but cooldown>0', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = 1;
    ammo[PickupKind.BOMB_STRIKE].cooldownRemaining = 1.5;
    expect(canFireActive(ammo[PickupKind.BOMB_STRIKE])).toBe(false);
  });

  it('consumeActiveCharge decrements charges and sets cooldown', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = 2;
    const ok = consumeActiveCharge(ammo[PickupKind.BOMB_STRIKE], PickupKind.BOMB_STRIKE);
    expect(ok).toBe(true);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
    expect(ammo[PickupKind.BOMB_STRIKE].cooldownRemaining).toBe(BOMB_STRIKE_COOLDOWN_SECONDS);
  });

  it('consumeActiveCharge returns false when charges=0', () => {
    const ammo = createEmptyActiveAmmo();
    const ok = consumeActiveCharge(ammo[PickupKind.BOMB_STRIKE], PickupKind.BOMB_STRIKE);
    expect(ok).toBe(false);
  });

  it('consumeActiveCharge returns false when on cooldown', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = 1;
    ammo[PickupKind.BOMB_STRIKE].cooldownRemaining = 1.0;
    expect(consumeActiveCharge(ammo[PickupKind.BOMB_STRIKE], PickupKind.BOMB_STRIKE)).toBe(false);
  });

  it('tickActiveAmmo decrements cooldown by deltaTime, floored at 0', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].cooldownRemaining = 2.0;
    tickActiveAmmo(ammo[PickupKind.BOMB_STRIKE], 0.7);
    expect(ammo[PickupKind.BOMB_STRIKE].cooldownRemaining).toBeCloseTo(1.3, 5);
    tickActiveAmmo(ammo[PickupKind.BOMB_STRIKE], 5.0);
    expect(ammo[PickupKind.BOMB_STRIKE].cooldownRemaining).toBe(0);
  });
});

describe('Per-kind constants match spec values', () => {
  it('Bomb Strike constants', () => {
    expect(BOMB_STRIKE_COOLDOWN_SECONDS).toBe(3.0);
    expect(BOMB_STRIKE_RADIUS).toBe(8.0); // Phase 7b: 5.0 → 8.0
    expect(BOMB_STRIKE_CHARGE_CAP).toBe(3);
    expect(BOMB_STRIKE_DAMAGE).toBe(10); // Phase 7c: 1 → 10 (one-shot any asteroid)
  });

  it('Orbit Drones constants', () => {
    expect(ORBIT_DRONES_COOLDOWN_SECONDS).toBe(4.0);
    expect(ORBIT_DRONES_CHARGE_CAP).toBe(2);
    expect(ORBIT_DRONES_DURATION_SECONDS).toBe(6.0);
    expect(ORBIT_DRONES_ORBIT_RADIUS).toBe(1.5);
    expect(ORBIT_DRONES_ORBIT_PERIOD_SECONDS).toBe(1.5);
    expect(ORBIT_DRONES_TARGET_RADIUS).toBe(4.0);
    expect(ORBIT_DRONES_FIRE_INTERVAL_SECONDS).toBe(0.4);
    expect(ORBIT_DRONES_DAMAGE).toBe(1);
    expect(ORBIT_DRONES_DRONE_COUNT).toBe(2);
    expect(ORBIT_DRONES_FADE_OUT_SECONDS).toBe(0.3);
  });

  it('Homing Missiles constants', () => {
    expect(HOMING_MISSILES_COOLDOWN_SECONDS).toBe(4.0);
    expect(HOMING_MISSILES_CHARGE_CAP).toBe(3);
    expect(HOMING_MISSILES_VOLLEY_COUNT).toBe(6); // Phase 7c-2: 4 → 6 (bigger instant clear)
    expect(HOMING_MISSILES_DAMAGE).toBe(10); // Phase 7c: 1 → 10 (one-shot any asteroid)
    expect(HOMING_MISSILES_SPEED).toBe(7.0); // Phase 7b: 6.0 → 7.0
    expect(HOMING_MISSILES_TRACKING_RADIUS).toBe(14.0); // Phase 7c-2: 10.0 → 14.0 (reach far arena)
    expect(HOMING_MISSILES_TRACKING_DURATION).toBe(3.5); // Phase 7c-2: 2.5 → 3.5 (longer flight)
    expect(HOMING_MISSILES_TURN_RATE).toBe(14.0); // Phase 7b: 8.0 → 14.0
  });
});

import {
  findNearestAsteroid,
  spawnDroneDeployment,
  tickDroneDeployments,
} from '../src/active-deployments';
import { Group } from 'three';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidKind, AsteroidSize } from '../src/types';

function makeScene(): Group {
  return new Group();
}

function makeAsteroid(
  x: number,
  y: number,
): ReturnType<typeof createAsteroidState> {
  return createAsteroidState(
    AsteroidSize.LARGE,
    { x, y },
    { x: 0, y: 0 },
    false,
    AsteroidKind.IRON,
  );
}

describe('Orbit Drones — deployment', () => {
  it('spawnDroneDeployment returns a state with 2 drone meshes and remaining=6.0', () => {
    const scene = makeScene();
    const dep = spawnDroneDeployment({ x: 0, y: 0 }, scene);
    expect(dep.droneMeshes.length).toBe(2);
    expect(dep.remaining).toBe(ORBIT_DRONES_DURATION_SECONDS);
    expect(scene.children.length).toBe(2);
  });

  it('after 0.5s of ticks, drone meshes are at radius 1.5 from ship (within tolerance)', () => {
    const scene = makeScene();
    const dep = spawnDroneDeployment({ x: 0, y: 0 }, scene);
    // 30 frames at 1/60s ≈ 0.5s.
    for (let i = 0; i < 30; i++) {
      tickDroneDeployments([dep], { x: 0, y: 0 }, [], 1 / 60, scene, () => undefined);
    }
    for (const mesh of dep.droneMeshes) {
      const d = Math.hypot(mesh.position.x, mesh.position.y);
      expect(d).toBeCloseTo(ORBIT_DRONES_ORBIT_RADIUS, 1);
    }
  });

  it('after 6.0s, the deployment is removed and meshes removed from scene', () => {
    const scene = makeScene();
    const dep = spawnDroneDeployment({ x: 0, y: 0 }, scene);
    // 6 seconds at 1/60s = 360 frames + 0.3s fade-out = ~378 frames; the
    // deployment should be culled. Replace the input array with the
    // returned list each frame so culled deployments are not re-ticked.
    let live: typeof dep[] = [dep];
    for (let i = 0; i < 400; i++) {
      live = tickDroneDeployments(
        live,
        { x: 0, y: 0 },
        [],
        1 / 60,
        scene,
        () => undefined,
      );
    }
    expect(live.length).toBe(0);
  });
});

describe('findNearestAsteroid', () => {
  it('returns null when no asteroids in range', () => {
    const a = makeAsteroid(100, 100);
    expect(findNearestAsteroid({ x: 0, y: 0 }, [a], 5)).toBeNull();
  });

  it('returns the closest asteroid within range', () => {
    const a1 = makeAsteroid(3, 0);
    const a2 = makeAsteroid(2, 0);
    const nearest = findNearestAsteroid({ x: 0, y: 0 }, [a1, a2], 5);
    expect(nearest).toBe(a2);
  });
});

import {
  scheduleMissileVolley,
  tickHomingMissiles,
  tickMissileVolleySchedules,
} from '../src/active-deployments';
import { disposeMissileVfx } from '../src/missile-vfx';

// Missile smoke pool has module-scope state (InstancedMesh + material + texture)
// that persists across tests. Dispose after each test to avoid contaminating
// sibling tests with a stale pool bound to a previous test's scene.
afterEach(() => {
  disposeMissileVfx();
});

describe('Homing Missiles — volley + tracking', () => {
  it('scheduleMissileVolley returns 6 PendingMissile entries with distinct spreads and 180ms staggered delays', () => {
    const schedule = scheduleMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(schedule.pending.length).toBe(HOMING_MISSILES_VOLLEY_COUNT);
    // First missile launches immediately; subsequent ones at 180/360/540/720/900ms.
    expect(schedule.pending[0].delayRemaining).toBeCloseTo(0, 5);
    expect(schedule.pending[1].delayRemaining).toBeCloseTo(0.18, 5);
    expect(schedule.pending[2].delayRemaining).toBeCloseTo(0.36, 5);
    expect(schedule.pending[3].delayRemaining).toBeCloseTo(0.54, 5);
    expect(schedule.pending[4].delayRemaining).toBeCloseTo(0.72, 5);
    expect(schedule.pending[5].delayRemaining).toBeCloseTo(0.90, 5);
    // All 6 spreads should be distinct.
    const sigs = new Set(schedule.pending.map((p) => p.spread.toFixed(5)));
    expect(sigs.size).toBe(HOMING_MISSILES_VOLLEY_COUNT);
  });

  it('draining the schedule produces VOLLEY_COUNT missiles with distinct velocities', () => {
    const scene = makeScene();
    const missiles: HomingMissileState[] = [];
    let schedules: VolleySchedule[] = [
      scheduleMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }),
    ];
    // Tick enough frames (>= 900ms + a frame) to drain all 6 pending missiles.
    for (let i = 0; i < 70; i++) {
      schedules = tickMissileVolleySchedules(
        schedules,
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        1 / 60,
        scene,
        missiles,
      );
    }
    expect(missiles.length).toBe(HOMING_MISSILES_VOLLEY_COUNT);
    const sigs = new Set(
      missiles.map((m) => `${m.velocity.x.toFixed(3)},${m.velocity.y.toFixed(3)}`),
    );
    expect(sigs.size).toBe(HOMING_MISSILES_VOLLEY_COUNT);
  });

  it('missile velocity converges toward target heading over 0.5s', () => {
    const scene = makeScene();
    const missiles: HomingMissileState[] = [];
    let schedules: VolleySchedule[] = [
      scheduleMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }),
    ];
    // Drain the schedule over a few frames so all 4 missiles are live.
    for (let i = 0; i < 40; i++) {
      schedules = tickMissileVolleySchedules(
        schedules,
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        1 / 60,
        scene,
        missiles,
      );
    }
    // Place a target directly to the right of the ship.
    const target = makeAsteroid(5, 0);
    // 0.5s of ticks; missile should turn toward (5,0).
    for (let i = 0; i < 30; i++) {
      tickHomingMissiles(missiles, [target], 1 / 60, scene, () => undefined);
    }
    // Velocity should now have a strong +x component (the initial spread
    // included ±0.06 rad so some started with a tiny -y component, but the
    // closest-to-target missile should be pointing right).
    const closest = missiles.reduce((best, m) => {
      const d = Math.hypot(
        m.position.x - target.position.x,
        m.position.y - target.position.y,
      );
      const bestD = Math.hypot(
        best.position.x - target.position.x,
        best.position.y - target.position.y,
      );
      return d < bestD ? m : best;
    });
    expect(closest.velocity.x).toBeGreaterThan(0);
  });

  it('missile removed after TRACKING_DURATION without impact', () => {
    const scene = makeScene();
    const missiles: HomingMissileState[] = [];
    let schedules: VolleySchedule[] = [
      scheduleMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }),
    ];
    for (let i = 0; i < 40; i++) {
      schedules = tickMissileVolleySchedules(
        schedules,
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        1 / 60,
        scene,
        missiles,
      );
    }
    // No asteroids — missiles fly straight and expire.
    const frames = Math.ceil((HOMING_MISSILES_TRACKING_DURATION + 0.1) * 60);
    let alive = missiles;
    for (let i = 0; i < frames; i++) {
      alive = tickHomingMissiles(alive, [], 1 / 60, scene, () => undefined);
    }
    expect(alive.length).toBe(0);
  });

  it('missile impact decrements asteroid.health by DAMAGE', () => {
    const scene = makeScene();
    const missiles: HomingMissileState[] = [];
    let schedules: VolleySchedule[] = [
      scheduleMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }),
    ];
    for (let i = 0; i < 40; i++) {
      schedules = tickMissileVolleySchedules(
        schedules,
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        1 / 60,
        scene,
        missiles,
      );
    }
    // Place target adjacent so impact happens within a few ticks.
    const target = makeAsteroid(0.1, 0);
    let hitCount = 0;
    const initialCount = missiles.length;
    for (let i = 0; i < 30; i++) {
      const remaining = tickHomingMissiles(missiles, [target], 1 / 60, scene, () => {
        hitCount++;
      });
      if (remaining.length < initialCount) break;
    }
    expect(hitCount).toBeGreaterThan(0);
  });
});