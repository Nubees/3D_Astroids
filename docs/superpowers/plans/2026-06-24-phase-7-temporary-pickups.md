# Phase 7 — Temporary Pickups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 6 pickup kinds in 3D Astroids (3 passive + 3 active) with HUD pill rows, per-kind timers/charges, and a one-commit ship per the user's "one big commit" directive.

**Architecture:** Pure-logic pickup module (`src/pickups.ts`) owns kinds, durations, drop rolls, and the active-ammo state machine. Mesh + per-frame state for the 2 deployable actives (Orbit Drones, Homing Missiles) lives in a new `src/active-deployments.ts` file — keeping `src/game.ts` from growing further. Game owns the pickup array, the active-ammo map, and wires input→effect→HUD. HUD is a DOM-based bottom-center pill row (passive) + bottom-right 3-icon row (active), matching the existing HUD style.

**Tech Stack:** TypeScript, Three.js r0.184.0, Vite, Vitest, Playwright (no new deps). No new shader / mesh class / AdditiveBlending source.

## Global Constraints

[Verbatim from spec `docs/superpowers/specs/2026-06-23-phase-7-temporary-pickups-design.md` and the project's standing rules.]

- **One big commit at the end** of all 16 tasks. Per-task commits are NOT allowed (the user explicitly said "one big commit").
- **6 pickup kinds total**: FIRE_RATE, SHIELD, SPREAD (passive, timer-based) + BOMB_STRIKE, ORBIT_DRONES, HOMING_MISSILES (active, charges+cooldown, key `1`/`2`/`3`).
- **No new dependencies, no new shader, no new mesh class**. Reuse `Shockwave` for Bomb Strike, `MeshStandardMaterial`/`MeshBasicMaterial` for drones/missiles, `fireProjectile` for all projectiles.
- **No new AdditiveBlending sources** — drone/missile trails use plain PBR. (Phase 6c/6d lesson: additive blending white-out.)
- **All game code under `src/`**. No logic in `public/`.
- **Pure-Node tests in `tests/`** — no WebGL, no canvas, no jsdom.
- **2-space indent, single quotes, semicolons, max 100-char lines** (project code style).
- **Every non-trivial code block needs a "My Rules" comment** with Purpose / Setup / Issues / Fix / Gotchas. Trivial = single-line, no derived value.
- **HUD matches existing style**: `position: absolute` divs, monospace font, `textShadow` for legibility, no new screen regions (only 2 new anchored divs).
- **All 6 constants on `ACTIVE_KIND_SPECS` table are the single source of truth** for active kind behavior. `applyPickupEffect` reads from the table, not per-kind `*_CHARGE_CAP` constants.
- **Defensive test**: `ACTIVE_KIND_SPECS[kind].chargeCap === <kind>_CHARGE_CAP` for all 3 active kinds — guards against the "table and constant diverge" failure mode.
- **`fireProjectile` signature is unchanged** — the existing call site stays as the `[0]` offset case. New callers (drone auto-fire, missile volley) call it with their own offset array.

## File Structure (locked in by this plan)

| File | Action | Responsibility |
|------|--------|----------------|
| `src/pickups.ts` | Create | `PickupKind` enum (6 values), `PickupState` interface, `ActiveAmmoState`, `ActiveAmmoMap`, `ActiveKindSpec`, `ACTIVE_KIND_SPECS` table, all pickup constants, pure lifecycle helpers, pure active-ammo helpers, mesh factory, drop-roll. |
| `src/active-deployments.ts` | Create | `DroneDeploymentState` and `HomingMissileState` interfaces, per-frame tick functions for both, mesh spawn/dispose. Owns the per-frame state for the 2 deployable actives; Game just calls into it. |
| `src/input.ts` | Modify | Add `useActive1`, `useActive2`, `useActive3` to `InputState`; bind `'1'`/`'2'`/`'3'` in the keydown/keyup listener. |
| `src/ship.ts` | Modify | `Ship.update` accepts optional `fireRateMultiplier: number` (default 1); multiplies the per-frame cooldown decrement. |
| `src/game.ts` | Modify | Add `pickups: LivePickup[]`, `activeAmmo: ActiveAmmoMap`, `activeDeployments`, `homingMissiles`, `droneMeshGroup`, `missileMeshGroup`, `activeHudElement`, `activeHudIcons: Map<PickupKind, ActiveHudIcon>`, `pickupHudElement`, `pickupHudPills: Map<PickupKind, HTMLDivElement>`. Wire `destroyIronAsteroid` + `destroyCrystal` to call `maybeDropPickup` + `spawnPickup`. Wire `update(deltaTime)` to tick passive effects, tick pickups, fire actives, tick drone/missile deployments. Wire `createHud` to mount the 2 new HUD regions. Wire `stop()` to dispose everything. |
| `tests/pickups.test.ts` | Create | 15 tests for passive pickup lifecycle, magnetize, expire, collect, drop rolls, `applyPickupEffect` for the 3 passive kinds. |
| `tests/pickups-active.test.ts` | Create | 21 tests for active ammo state machine, `ACTIVE_KIND_SPECS` table, drone deployment ticks, missile tracking math, missile impact/expiry. |
| `tests/ship.test.ts` | Modify | +1 test: `fireRateMultiplier=3` makes cooldown decrement 3× as fast. |

**Files NOT modified** (re-asserted): `asteroid.ts`, `crystal-fx.ts`, `post-processing.ts`, `shockwave.ts`, `scrap.ts`, `shard.ts`, `shard-mesh.ts`, `waves.ts`, `shield.ts`, `shield-visuals.ts`, `breather.ts`.

---

## Task 1: PickupKind enum + passive constants

**Files:**
- Create: `src/pickups.ts`
- Test: `tests/pickups.test.ts`

**Interfaces:**
- Produces: `PickupKind` enum (all 6 values), 3 passive constants, 3 passive duration constants, color table. Used by Task 2 (lifecycle) and onward.

- [ ] **Step 1: Write the failing test**

Create `tests/pickups.test.ts` with the header block and 4 tests:

```ts
import { describe, expect, it } from 'vitest';
import {
  PICKUP_DURATION_SECONDS,
  PICKUP_LIFETIME,
  PICKUP_MUZZLE_SPEED,
  PICKUP_COLLECT_RADIUS,
  PICKUP_MESH_RADIUS,
  PICKUP_COLOR,
  PickupKind,
} from '../src/pickups';
import { AsteroidSize, AsteroidKind } from '../src/types';

describe('PickupKind — Phase 7 enum', () => {
  it('has exactly 6 kinds in stable order', () => {
    const kinds = Object.values(PickupKind);
    expect(kinds).toEqual([
      'fireRate',       // passive — slot 0
      'shield',         // passive — slot 1
      'spread',         // passive — slot 2
      'bombStrike',     // active — slot 1 key
      'orbitDrones',    // active — slot 2 key
      'homingMissiles', // active — slot 3 key
    ]);
  });

  it('has the expected passive durations', () => {
    expect(PICKUP_DURATION_SECONDS[PickupKind.FIRE_RATE]).toBe(6.0);
    expect(PICKUP_DURATION_SECONDS[PickupKind.SHIELD]).toBe(8.0);
    expect(PICKUP_DURATION_SECONDS[PickupKind.SPREAD]).toBe(10.0);
  });

  it('has stable constants matching the spec', () => {
    expect(PICKUP_LIFETIME).toBe(10.0);
    expect(PICKUP_MUZZLE_SPEED).toBe(1.5);
    expect(PICKUP_COLLECT_RADIUS).toBe(0.5);
    expect(PICKUP_MESH_RADIUS).toBe(0.18);
  });

  it('has a unique color per kind for HUD/mesh distinction', () => {
    const colors = new Set([
      PICKUP_COLOR[PickupKind.FIRE_RATE],
      PICKUP_COLOR[PickupKind.SHIELD],
      PICKUP_COLOR[PickupKind.SPREAD],
      PICKUP_COLOR[PickupKind.BOMB_STRIKE],
      PICKUP_COLOR[PickupKind.ORBIT_DRONES],
      PICKUP_COLOR[PickupKind.HOMING_MISSILES],
    ]);
    expect(colors.size).toBe(6);
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `npx vitest run tests/pickups.test.ts -t "PickupKind"`
Expected: FAIL with "Cannot find module '../src/pickups'"

- [ ] **Step 3: Create `src/pickups.ts` with the enum, constants, and color table**

```ts
import { AsteroidKind, AsteroidSize, Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Pickup System (Phase 7)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Single source of truth for all 6 pickup kinds (3 passive + 3
//          active). Owns the pickup state machine, drop rolls, effect
//          application, and active-ammo state machine.
// Setup: Imported by src/game.ts (lifecycle + HUD), tests/.
// Issues: None.
// Fix: Phase 7. Active kind behavior comes from ACTIVE_KIND_SPECS so the
//      same applyPickupEffect path handles all 3 active kinds.
// Gotchas: Per-kind BOMB_STRIKE_CHARGE_CAP etc. are exposed as
//          "documentation constants" — the authoritative source is the
//          ACTIVE_KIND_SPECS table. A defensive test in Task 5 asserts
//          the constant and the table cell agree.
// ═══════════════════════════════════════════════════════════════════════════

export enum PickupKind {
  FIRE_RATE = 'fireRate',           // passive — 6s — orange  0xff8800
  SHIELD = 'shield',                // passive — 8s — blue    0x66aaff
  SPREAD = 'spread',                // passive — 10s — green  0x66ff66
  BOMB_STRIKE = 'bombStrike',       // active — slot 1 — orange  0xffaa00
  ORBIT_DRONES = 'orbitDrones',     // active — slot 2 — cyan    0x66ddff
  HOMING_MISSILES = 'homingMissiles', // active — slot 3 — magenta 0xff66ff
}

export const PICKUP_DURATION_SECONDS: Record<PickupKind, number> = {
  [PickupKind.FIRE_RATE]: 6.0,
  [PickupKind.SHIELD]: 8.0,
  [PickupKind.SPREAD]: 10.0,
  [PickupKind.BOMB_STRIKE]: 0,
  [PickupKind.ORBIT_DRONES]: 0,
  [PickupKind.HOMING_MISSILES]: 0,
};

export const PICKUP_LIFETIME = 10.0;
export const PICKUP_MUZZLE_SPEED = 1.5;
export const PICKUP_COLLECT_RADIUS = 0.5;
export const PICKUP_MESH_RADIUS = 0.18;

export const PICKUP_COLOR: Record<PickupKind, number> = {
  [PickupKind.FIRE_RATE]: 0xff8800,
  [PickupKind.SHIELD]: 0x66aaff,
  [PickupKind.SPREAD]: 0x66ff66,
  [PickupKind.BOMB_STRIKE]: 0xffaa00,
  [PickupKind.ORBIT_DRONES]: 0x66ddff,
  [PickupKind.HOMING_MISSILES]: 0xff66ff,
};
```

- [ ] **Step 4: Run the test, expect PASS**

Run: `npx vitest run tests/pickups.test.ts -t "PickupKind"`
Expected: PASS, 4/4 tests green

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 2: PickupState + passive lifecycle helpers

**Files:**
- Modify: `src/pickups.ts`
- Modify: `tests/pickups.test.ts`

**Interfaces:**
- Produces: `PickupState` interface, `createPickupState(kind, position)`, `updatePickup(state, shipPosition, deltaTime)`, `isPickupExpired(state)`, `isPickupCollected(state, shipPosition)`, magnetize math. Used by Task 3 (`maybeDropPickup`) and Task 12 (Game integration).

- [ ] **Step 1: Write the failing tests**

Append to `tests/pickups.test.ts`:

```ts
import { createPickupState, isPickupCollected, isPickupExpired, updatePickup } from '../src/pickups';

describe('PickupState — passive lifecycle', () => {
  it('createPickupState initializes age=0, spin=0, with non-zero velocity', () => {
    const p = createPickupState(PickupKind.FIRE_RATE, { x: 1, y: 2 });
    expect(p.age).toBe(0);
    expect(p.spin).toBe(0);
    expect(p.position).toEqual({ x: 1, y: 2 });
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeGreaterThan(0);
  });

  it('updatePickup increments age by deltaTime', () => {
    const p = createPickupState(PickupKind.SHIELD, { x: 0, y: 0 });
    updatePickup(p, { x: 100, y: 100 }, 0.5);
    expect(p.age).toBeCloseTo(0.5, 5);
  });

  it('updatePickup magnetizes (overrides velocity) when ship is within MAGNET_RADIUS', () => {
    const p = createPickupState(PickupKind.SPREAD, { x: 0, y: 0 });
    // Ship within 2.5 (MAGNET_RADIUS). Update with large dt so velocity
    // change is observable.
    updatePickup(p, { x: 1, y: 1 }, 0.1);
    // Velocity should now point toward ship (positive x and y).
    expect(p.velocity.x).toBeGreaterThan(0);
    expect(p.velocity.y).toBeGreaterThan(0);
  });

  it('updatePickup does NOT magnetize when ship is outside MAGNET_RADIUS', () => {
    const p = createPickupState(PickupKind.SPREAD, { x: 0, y: 0 });
    const v0 = { ...p.velocity };
    updatePickup(p, { x: 100, y: 100 }, 0.1);
    expect(p.velocity.x).toBeCloseTo(v0.x, 5);
    expect(p.velocity.y).toBeCloseTo(v0.y, 5);
  });

  it('isPickupExpired returns true at age >= PICKUP_LIFETIME', () => {
    const p = createPickupState(PickupKind.FIRE_RATE, { x: 0, y: 0 });
    expect(isPickupExpired(p)).toBe(false);
    p.age = PICKUP_LIFETIME;
    expect(isPickupExpired(p)).toBe(true);
  });

  it('isPickupCollected returns true within PICKUP_COLLECT_RADIUS, false beyond', () => {
    const p = createPickupState(PickupKind.FIRE_RATE, { x: 0, y: 0 });
    expect(isPickupCollected(p, { x: 0.3, y: 0 })).toBe(true);
    expect(isPickupCollected(p, { x: 5, y: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests, expect FAIL**

Run: `npx vitest run tests/pickups.test.ts -t "PickupState"`
Expected: FAIL — `createPickupState`, `updatePickup`, etc. are not exported from `../src/pickups`

- [ ] **Step 3: Add the lifecycle helpers to `src/pickups.ts`**

Append below the existing exports:

```ts
export interface PickupState {
  readonly kind: PickupKind;
  position: Vector2;
  velocity: Vector2;
  age: number;
  spin: number;
}

const MAGNET_RADIUS = 2.5;
const MAGNET_PULL_SPEED = 12.0;

export function createPickupState(kind: PickupKind, position: Vector2): PickupState {
  // Initial outward velocity in a random direction (mirrors scrap muzzle
  // spread — the pickup flies out of the destruction site).
  const angle = Math.random() * Math.PI * 2;
  return {
    kind,
    position: { ...position },
    velocity: {
      x: Math.cos(angle) * PICKUP_MUZZLE_SPEED,
      y: Math.sin(angle) * PICKUP_MUZZLE_SPEED,
    },
    age: 0,
    spin: 0,
  };
}

export function updatePickup(
  pickup: PickupState,
  shipPosition: Vector2,
  deltaTime: number,
): void {
  const dx = shipPosition.x - pickup.position.x;
  const dy = shipPosition.y - pickup.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= MAGNET_RADIUS && distance > 0.01) {
    // Override velocity with magnet pull toward the ship.
    const pullStrength = (MAGNET_RADIUS - distance) / MAGNET_RADIUS;
    const speed = MAGNET_PULL_SPEED * pullStrength;
    pickup.velocity = {
      x: (dx / distance) * speed,
      y: (dy / distance) * speed,
    };
  }
  pickup.position = {
    x: pickup.position.x + pickup.velocity.x * deltaTime,
    y: pickup.position.y + pickup.velocity.y * deltaTime,
  };
  pickup.age += deltaTime;
  pickup.spin += deltaTime * 1.5;
}

export function isPickupExpired(pickup: PickupState): boolean {
  return pickup.age >= PICKUP_LIFETIME;
}

export function isPickupCollected(
  pickup: PickupState,
  shipPosition: Vector2,
): boolean {
  const distance = Math.hypot(
    pickup.position.x - shipPosition.x,
    pickup.position.y - shipPosition.y,
  );
  return distance <= PICKUP_COLLECT_RADIUS;
}
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx vitest run tests/pickups.test.ts -t "PickupState"`
Expected: PASS, 6/6 new tests green

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 3: `maybeDropPickup` + `applyPickupEffect` (passive kinds)

**Files:**
- Modify: `src/pickups.ts`
- Modify: `tests/pickups.test.ts`

**Interfaces:**
- Produces: `maybeDropPickup(state)`, `applyPickupEffect(kind, ship, shield)` for the 3 passive kinds only (active kinds come in Task 5).

- [ ] **Step 1: Write the failing tests**

Append to `tests/pickups.test.ts`:

```ts
import { applyPickupEffect, maybeDropPickup } from '../src/pickups';
import { createAsteroidState } from '../src/asteroid';

describe('maybeDropPickup — drop roll', () => {
  it('returns a PickupKind for any CRYSTAL state (100% rate)', () => {
    // Mock Math.random to control the kind roll.
    const originalRandom = Math.random;
    Math.random = (): number => 0.0; // first kind in the list
    try {
      const state = createAsteroidState(
        AsteroidSize.LARGE,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        false,
        AsteroidKind.CRYSTAL,
      );
      const kind = maybeDropPickup(state);
      expect(kind).not.toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('returns null for IRON size SMALL', () => {
    const state = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(maybeDropPickup(state)).toBeNull();
  });

  it('returns null for IRON size MEDIUM', () => {
    const state = createAsteroidState(AsteroidSize.MEDIUM, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(maybeDropPickup(state)).toBeNull();
  });

  it('returns null for IRON size TINY', () => {
    const state = createAsteroidState(AsteroidSize.TINY, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(maybeDropPickup(state)).toBeNull();
  });

  it('returns a kind for IRON size LARGE with random > 0.9 (10% rate)', () => {
    const originalRandom = Math.random;
    Math.random = (): number => 0.95; // > 0.9 → 10% roll passes
    try {
      const state = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });
      expect(maybeDropPickup(state)).not.toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('returns null for IRON size LARGE with random <= 0.9 (90% miss)', () => {
    const originalRandom = Math.random;
    Math.random = (): number => 0.5;
    try {
      const state = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });
      expect(maybeDropPickup(state)).toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('applyPickupEffect — passive kinds', () => {
  const ship = { fireCooldown: 0.5 };
  const shield = { energy: 0.3, maxEnergy: 1.0 };

  it('FIRE_RATE returns duration 6.0 and does not mutate shield', () => {
    const result = applyPickupEffect(PickupKind.FIRE_RATE, ship, shield);
    expect(result.kind).toBe(PickupKind.FIRE_RATE);
    if ('remaining' in result) {
      expect(result.remaining).toBe(6.0);
      expect(result.total).toBe(6.0);
    } else {
      throw new Error('expected passive result');
    }
    expect(shield.energy).toBe(0.3); // unchanged
  });

  it('SHIELD adds 0.5 to shield.energy (50% of maxEnergy=1.0)', () => {
    const result = applyPickupEffect(PickupKind.SHIELD, ship, shield);
    expect(shield.energy).toBe(0.8);
    if ('remaining' in result) expect(result.remaining).toBe(8.0);
  });

  it('SHIELD caps at shield.maxEnergy', () => {
    const fullShield = { energy: 0.9, maxEnergy: 1.0 };
    applyPickupEffect(PickupKind.SHIELD, ship, fullShield);
    expect(fullShield.energy).toBe(1.0);
  });

  it('SPREAD returns duration 10.0 and does not mutate shield or ship', () => {
    const result = applyPickupEffect(PickupKind.SPREAD, ship, shield);
    expect(ship.fireCooldown).toBe(0.5);
    expect(shield.energy).toBe(0.3);
    if ('remaining' in result) expect(result.remaining).toBe(10.0);
  });
});
```

- [ ] **Step 2: Run the tests, expect FAIL**

Run: `npx vitest run tests/pickups.test.ts -t "maybeDropPickup|applyPickupEffect"`
Expected: FAIL — `maybeDropPickup`, `applyPickupEffect` not exported

- [ ] **Step 3: Add the drop roll + passive effect application**

Append to `src/pickups.ts`:

```ts
import { AsteroidState } from './types';
import { createAsteroidState as _unused } from './asteroid'; // keep import for tests
// Note: the import above is intentionally a no-op alias so this file does
// not create a circular dep when test files import createAsteroidState.

/**
 * All kinds eligible to drop from any source. Used to index into the
 * uniform-random kind picker.
 */
const ALL_KINDS: PickupKind[] = [
  PickupKind.FIRE_RATE,
  PickupKind.SHIELD,
  PickupKind.SPREAD,
  PickupKind.BOMB_STRIKE,
  PickupKind.ORBIT_DRONES,
  PickupKind.HOMING_MISSILES,
];

const IRON_LARGE_PICKUP_CHANCE = 0.10;

export function maybeDropPickup(state: AsteroidState): PickupKind | null {
  if (state.kind === AsteroidKind.CRYSTAL) {
    // Guaranteed drop; pick a uniform-random kind.
    const idx = Math.floor(Math.random() * ALL_KINDS.length);
    return ALL_KINDS[idx];
  }
  if (state.kind === AsteroidKind.IRON && state.size === AsteroidSize.LARGE) {
    // 10% chance for iron LARGE.
    if (Math.random() < IRON_LARGE_PICKUP_CHANCE) {
      const idx = Math.floor(Math.random() * ALL_KINDS.length);
      return ALL_KINDS[idx];
    }
  }
  return null;
}

/**
 * Result of applying a passive pickup effect. The Game pushes this onto
 * `activeEffects` and the HUD pill row drains over `total` seconds.
 */
export interface ActivePickupEffect {
  kind: PickupKind;
  remaining: number;
  total: number;
}

export function applyPickupEffect(
  kind: PickupKind,
  ship: { fireCooldown: number },
  shield: { energy: number; maxEnergy: number },
): ActivePickupEffect {
  switch (kind) {
    case PickupKind.FIRE_RATE: {
      // The cooldown decrement multiplier is applied in Ship.update; the
      // effect itself just registers a timer.
      return { kind, remaining: PICKUP_DURATION_SECONDS[kind], total: PICKUP_DURATION_SECONDS[kind] };
    }
    case PickupKind.SHIELD: {
      const heal = 0.5 * shield.maxEnergy;
      shield.energy = Math.min(shield.maxEnergy, shield.energy + heal);
      return { kind, remaining: PICKUP_DURATION_SECONDS[kind], total: PICKUP_DURATION_SECONDS[kind] };
    }
    case PickupKind.SPREAD: {
      // Spread angles are computed in Game.spreadAnglesForFrame; the effect
      // just registers a timer.
      return { kind, remaining: PICKUP_DURATION_SECONDS[kind], total: PICKUP_DURATION_SECONDS[kind] };
    }
    default:
      // Active kinds are handled in Task 5.
      throw new Error(`applyPickupEffect called with active kind ${kind} — use applyActivePickupEffect instead`);
  }
}
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx vitest run tests/pickups.test.ts -t "maybeDropPickup|applyPickupEffect"`
Expected: PASS, 10/10 new tests green (4 PICKUP_DURATION_SECONDS tests in Task 1 + 6 new)

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 4: `applyActivePickupEffect` (active kinds) + active-ammo state machine

**Files:**
- Modify: `src/pickups.ts`
- Create: `tests/pickups-active.test.ts`

**Interfaces:**
- Produces: `ActiveAmmoState`, `ActiveAmmoMap`, `ActiveKindSpec`, `ACTIVE_KIND_SPECS`, `applyActivePickupEffect(kind, activeAmmo)`, `canFireActive(ammo)`, `consumeActiveCharge(ammo)`, `tickActiveAmmo(ammo, dt)`, `createEmptyActiveAmmo()`, per-kind `*_CHARGE_CAP` / `*_COOLDOWN_SECONDS` / `*_RADIUS` / `*_DAMAGE` constants. Used by Task 11 (input), Task 12 (Game).

- [ ] **Step 1: Write the failing tests**

Create `tests/pickups-active.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
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
    expect(ACTIVE_KIND_SPECS[PickupKind.HOMING_MISSILES].cooldownSeconds).toBe(HOMING_MISSILES_COOLDOWN_SECONDS);
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
    const ok = consumeActiveCharge(ammo[PickupKind.BOMB_STRIKE]);
    expect(ok).toBe(true);
    expect(ammo[PickupKind.BOMB_STRIKE].charges).toBe(1);
    expect(ammo[PickupKind.BOMB_STRIKE].cooldownRemaining).toBe(BOMB_STRIKE_COOLDOWN_SECONDS);
  });

  it('consumeActiveCharge returns false when charges=0', () => {
    const ammo = createEmptyActiveAmmo();
    const ok = consumeActiveCharge(ammo[PickupKind.BOMB_STRIKE]);
    expect(ok).toBe(false);
  });

  it('consumeActiveCharge returns false when on cooldown', () => {
    const ammo = createEmptyActiveAmmo();
    ammo[PickupKind.BOMB_STRIKE].charges = 1;
    ammo[PickupKind.BOMB_STRIKE].cooldownRemaining = 1.0;
    expect(consumeActiveCharge(ammo[PickupKind.BOMB_STRIKE])).toBe(false);
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
    expect(BOMB_STRIKE_RADIUS).toBe(5.0);
    expect(BOMB_STRIKE_CHARGE_CAP).toBe(3);
    expect(BOMB_STRIKE_DAMAGE).toBe(1);
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
    expect(HOMING_MISSILES_VOLLEY_COUNT).toBe(4);
    expect(HOMING_MISSILES_DAMAGE).toBe(1);
    expect(HOMING_MISSILES_SPEED).toBe(6.0);
    expect(HOMING_MISSILES_TRACKING_RADIUS).toBe(8.0);
    expect(HOMING_MISSILES_TRACKING_DURATION).toBe(1.5);
    expect(HOMING_MISSILES_TURN_RATE).toBe(8.0);
  });
});
```

- [ ] **Step 2: Run the tests, expect FAIL**

Run: `npx vitest run tests/pickups-active.test.ts`
Expected: FAIL — `ActiveKindSpec`, `ACTIVE_KIND_SPECS`, `applyActivePickupEffect`, etc. not exported

- [ ] **Step 3: Add the active-ammo state machine to `src/pickups.ts`**

Append to `src/pickups.ts`:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// Active pickups (Phase 7 DIAL-UP)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Per-kind ammo + cooldown for the 3 active pickup kinds. All
//          lookups go through ACTIVE_KIND_SPECS so the same code path
//          handles all 3 active kinds.
// Setup:   Game owns one ActiveAmmoMap; createEmptyActiveAmmo() returns a
//          fresh map on stop()/respawn.
// Gotchas: Charges are pickup-gated only (no time-based regen). Cooldowns
//          tick via tickActiveAmmo. BOMB_STRIKE cooldown is fixed at the
//          spec's 3.0s. DRONES cooldown starts AFTER the 6s active window
//          expires, not at press time (the Game enforces this).
// ═══════════════════════════════════════════════════════════════════════════

// Bomb Strike constants.
export const BOMB_STRIKE_RADIUS = 5.0;
export const BOMB_STRIKE_COOLDOWN_SECONDS = 3.0;
export const BOMB_STRIKE_CHARGE_CAP = 3;
export const BOMB_STRIKE_DAMAGE = 1;

// Orbit Drones constants.
export const ORBIT_DRONES_COOLDOWN_SECONDS = 4.0;
export const ORBIT_DRONES_CHARGE_CAP = 2;
export const ORBIT_DRONES_DURATION_SECONDS = 6.0;
export const ORBIT_DRONES_ORBIT_RADIUS = 1.5;
export const ORBIT_DRONES_ORBIT_PERIOD_SECONDS = 1.5;
export const ORBIT_DRONES_TARGET_RADIUS = 4.0;
export const ORBIT_DRONES_FIRE_INTERVAL_SECONDS = 0.4;
export const ORBIT_DRONES_DAMAGE = 1;
export const ORBIT_DRONES_DRONE_COUNT = 2;
export const ORBIT_DRONES_FADE_OUT_SECONDS = 0.3;

// Homing Missiles constants.
export const HOMING_MISSILES_COOLDOWN_SECONDS = 4.0;
export const HOMING_MISSILES_CHARGE_CAP = 3;
export const HOMING_MISSILES_VOLLEY_COUNT = 4;
export const HOMING_MISSILES_DAMAGE = 1;
export const HOMING_MISSILES_SPEED = 6.0;
export const HOMING_MISSILES_TRACKING_RADIUS = 8.0;
export const HOMING_MISSILES_TRACKING_DURATION = 1.5;
export const HOMING_MISSILES_TURN_RATE = 8.0;

export interface ActiveAmmoState {
  charges: number;
  cooldownRemaining: number;
}

export type ActiveAmmoMap = Record<PickupKind, ActiveAmmoState>;

export interface ActiveKindSpec {
  readonly chargeCap: number;
  readonly cooldownSeconds: number;
  readonly displayName: string;
  readonly color: number;
  readonly isDeployable: boolean;
  readonly durationSeconds: number;
}

/**
 * Single source of truth for active kind behavior. The Game reads
 * ACTIVE_KIND_SPECS[kind].chargeCap on pickup collect; the per-kind
 * `*_CHARGE_CAP` constants are documentation mirrors of the table cells
 * (defensive test enforces equality).
 */
export const ACTIVE_KIND_SPECS: Record<PickupKind, ActiveKindSpec> = {
  [PickupKind.BOMB_STRIKE]: {
    chargeCap: BOMB_STRIKE_CHARGE_CAP,
    cooldownSeconds: BOMB_STRIKE_COOLDOWN_SECONDS,
    displayName: 'BOMB',
    color: 0xff8800,
    isDeployable: false,
    durationSeconds: 0,
  },
  [PickupKind.ORBIT_DRONES]: {
    chargeCap: ORBIT_DRONES_CHARGE_CAP,
    cooldownSeconds: ORBIT_DRONES_COOLDOWN_SECONDS,
    displayName: 'DRONES',
    color: 0x66ddff,
    isDeployable: true,
    durationSeconds: ORBIT_DRONES_DURATION_SECONDS,
  },
  [PickupKind.HOMING_MISSILES]: {
    chargeCap: HOMING_MISSILES_CHARGE_CAP,
    cooldownSeconds: HOMING_MISSILES_COOLDOWN_SECONDS,
    displayName: 'MISSILES',
    color: 0xff66ff,
    isDeployable: false,
    durationSeconds: 0,
  },
};

export function createEmptyActiveAmmo(): ActiveAmmoMap {
  const map = {} as ActiveAmmoMap;
  for (const k of Object.values(PickupKind)) {
    map[k] = { charges: 0, cooldownRemaining: 0 };
  }
  return map;
}

export function applyActivePickupEffect(kind: PickupKind, activeAmmo: ActiveAmmoMap): void {
  const spec = ACTIVE_KIND_SPECS[kind];
  const ammo = activeAmmo[kind];
  ammo.charges = Math.min(spec.chargeCap, ammo.charges + 1);
  // Cooldown is NOT set here — only on fire (consumeActiveCharge).
}

export function canFireActive(ammo: ActiveAmmoState): boolean {
  return ammo.charges > 0 && ammo.cooldownRemaining <= 0;
}

export function consumeActiveCharge(ammo: ActiveAmmoState, kind: PickupKind): boolean {
  if (!canFireActive(ammo)) return false;
  ammo.charges -= 1;
  ammo.cooldownRemaining = ACTIVE_KIND_SPECS[kind].cooldownSeconds;
  return true;
}

export function tickActiveAmmo(ammo: ActiveAmmoState, deltaTime: number): void {
  ammo.cooldownRemaining = Math.max(0, ammo.cooldownRemaining - deltaTime);
}
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx vitest run tests/pickups-active.test.ts`
Expected: PASS, 17/17 new tests green (3 spec table + 11 state machine + 3 constants)

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 5: `createPickupMesh` + `disposePickupMesh`

**Files:**
- Modify: `src/pickups.ts`
- Modify: `tests/pickups.test.ts`

**Interfaces:**
- Produces: `createPickupMesh(kind)` returning `Group`, `disposePickupMesh(group)`. Used by Task 12 (Game spawnPickup).

- [ ] **Step 1: Write the failing tests**

Append to `tests/pickups.test.ts`:

```ts
import { createPickupMesh, disposePickupMesh } from '../src/pickups';

describe('Pickup mesh — Three.js group factory', () => {
  it('createPickupMesh returns a Group with one Mesh child per kind', () => {
    for (const kind of Object.values(PickupKind)) {
      const g = createPickupMesh(kind);
      expect(g.type).toBe('Group');
      expect(g.children.length).toBeGreaterThan(0);
    }
  });

  it('disposePickupMesh clears children without throwing', () => {
    const g = createPickupMesh(PickupKind.FIRE_RATE);
    expect(() => disposePickupMesh(g)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests, expect FAIL**

Run: `npx vitest run tests/pickups.test.ts -t "Pickup mesh"`
Expected: FAIL — `createPickupMesh`, `disposePickupMesh` not exported

- [ ] **Step 3: Add the mesh factory to `src/pickups.ts`**

Append to `src/pickups.ts`:

```ts
import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';

/**
 * Build a small colored icosahedron for the pickup. Each kind gets its
 * own material so disposing the mesh is a one-line traversal.
 */
export function createPickupMesh(kind: PickupKind): Group {
  const group = new Group();
  const geometry = new IcosahedronGeometry(PICKUP_MESH_RADIUS, 0);
  const material = new MeshStandardMaterial({
    color: PICKUP_COLOR[kind],
    emissive: PICKUP_COLOR[kind],
    emissiveIntensity: 0.4,
    flatShading: true,
  });
  const mesh = new Mesh(geometry, material);
  group.add(mesh);
  return group;
}

export function disposePickupMesh(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry.dispose();
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat instanceof MeshStandardMaterial) mat.dispose();
    }
  });
  // Detach all children so the caller can scene.remove(group) safely.
  while (group.children.length > 0) group.remove(group.children[0]);
}
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx vitest run tests/pickups.test.ts -t "Pickup mesh"`
Expected: PASS, 2/2 new tests green

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 6: Drone deployment state + tick (orbit math)

**Files:**
- Create: `src/active-deployments.ts`
- Modify: `tests/pickups-active.test.ts`

**Interfaces:**
- Produces: `DroneDeploymentState` interface, `spawnDroneDeployment(shipPosition, scene)`, `tickDroneDeployments(deployments, shipPosition, asteroids, deltaTime, scene)`, `disposeDroneDeployment(deployment, scene)`, `findNearestAsteroid(position, asteroids, maxRadius)`. Used by Task 12 (Game).

- [ ] **Step 1: Write the failing tests**

Append to `tests/pickups-active.test.ts`:

```ts
import {
  findNearestAsteroid,
  spawnDroneDeployment,
  tickDroneDeployments,
} from '../src/active-deployments';
import { Group, Mesh } from 'three';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidKind, AsteroidSize } from '../src/types';

function makeScene(): Group {
  return new Group();
}

function makeAsteroid(x: number, y: number): ReturnType<typeof createAsteroidState> {
  return createAsteroidState(AsteroidSize.LARGE, { x, y }, { x: 0, y: 0 }, false, AsteroidKind.IRON);
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
      tickDroneDeployments([dep], { x: 0, y: 0 }, [], 1 / 60, scene);
    }
    for (const mesh of dep.droneMeshes) {
      const d = Math.hypot(mesh.position.x, mesh.position.y);
      expect(d).toBeCloseTo(ORBIT_DRONES_ORBIT_RADIUS, 1);
    }
  });

  it('after 6.0s, the deployment is removed and meshes removed from scene', () => {
    const scene = makeScene();
    const dep = spawnDroneDeployment({ x: 0, y: 0 }, scene);
    // 6 seconds at 1/60s = 360 frames; the deployment should be culled.
    const live: typeof dep[] = [];
    for (let i = 0; i < 400; i++) {
      const list = tickDroneDeployments([dep], { x: 0, y: 0 }, [], 1 / 60, scene);
      for (const d of list) live.push(d);
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
```

- [ ] **Step 2: Run the tests, expect FAIL**

Run: `npx vitest run tests/pickups-active.test.ts -t "Orbit Drones|findNearestAsteroid"`
Expected: FAIL — `src/active-deployments` module does not exist

- [ ] **Step 3: Create `src/active-deployments.ts`**

```ts
import {
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from 'three';
import { AsteroidState, Vector2 } from './types';
import {
  ORBIT_DRONES_DAMAGE,
  ORBIT_DRONES_DRONE_COUNT,
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
  scene: Scene,
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
    remaining: 6.0, // ORBIT_DRONES_DURATION_SECONDS — hard-coded to avoid circular import
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
  scene: Scene,
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
          const d = Math.hypot(mesh.position.x - target.position.x, mesh.position.y - target.position.y);
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
```

Note: We use `ORBIT_DRONES_DAMAGE` only as documentation; the actual damage path lives in Game (existing projectile → asteroid collision).

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx vitest run tests/pickups-active.test.ts -t "Orbit Drones|findNearestAsteroid"`
Expected: PASS, 4/4 new tests green

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 7: Homing missile state + tick (tracking math + impact)

**Files:**
- Modify: `src/active-deployments.ts`
- Modify: `tests/pickups-active.test.ts`

**Interfaces:**
- Produces: `spawnMissileVolley(shipPos, aimDir, scene)`, `tickHomingMissiles(missiles, asteroids, deltaTime, scene, onMissileImpact)`. Used by Task 12 (Game).

- [ ] **Step 1: Write the failing tests**

Append to `tests/pickups-active.test.ts`:

```ts
import {
  spawnMissileVolley,
  tickHomingMissiles,
} from '../src/active-deployments';
import {
  HOMING_MISSILES_DAMAGE,
  HOMING_MISSILES_SPEED,
  HOMING_MISSILES_TRACKING_DURATION,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_TURN_RATE,
  HOMING_MISSILES_VOLLEY_COUNT,
} from '../src/pickups';

describe('Homing Missiles — volley + tracking', () => {
  it('spawnMissileVolley produces VOLLEY_COUNT missiles with distinct velocities', () => {
    const scene = makeScene();
    const missiles = spawnMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }, scene);
    expect(missiles.length).toBe(HOMING_MISSILES_VOLLEY_COUNT);
    // All 4 velocities should be distinct (fan spread).
    const sigs = new Set(missiles.map((m) => `${m.velocity.x.toFixed(3)},${m.velocity.y.toFixed(3)}`));
    expect(sigs.size).toBe(HOMING_MISSILES_VOLLEY_COUNT);
  });

  it('missile velocity converges toward target heading over 0.5s', () => {
    const scene = makeScene();
    const missiles = spawnMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }, scene);
    // Place a target directly to the right of the ship.
    const target = makeAsteroid(5, 0);
    // 0.5s of ticks; missile should turn toward (5,0).
    for (let i = 0; i < 30; i++) {
      tickHomingMissiles(missiles, [target], 1 / 60, scene, () => undefined);
    }
    // Velocity should now have a strong +x component (the initial spread
    // included ±0.225 rad so some started with -y component, but the
    // closest-to-target missile should be pointing right).
    const closest = missiles.reduce((best, m) => {
      const d = Math.hypot(m.position.x - target.position.x, m.position.y - target.position.y);
      return d < Math.hypot(best.position.x - target.position.x, best.position.y - target.position.y) ? m : best;
    });
    expect(closest.velocity.x).toBeGreaterThan(0);
  });

  it('missile removed after TRACKING_DURATION without impact', () => {
    const scene = makeScene();
    const missiles = spawnMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }, scene);
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
    const missiles = spawnMissileVolley({ x: 0, y: 0 }, { x: 1, y: 0 }, scene);
    // Place target adjacent so impact happens within a few ticks.
    const target = makeAsteroid(0.1, 0);
    let hitCount = 0;
    for (let i = 0; i < 30; i++) {
      const remaining = tickHomingMissiles(missiles, [target], 1 / 60, scene, () => {
        hitCount++;
      });
      if (remaining.length < missiles.length) break;
    }
    expect(hitCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests, expect FAIL**

Run: `npx vitest run tests/pickups-active.test.ts -t "Homing Missiles"`
Expected: FAIL — `spawnMissileVolley`, `tickHomingMissiles` not exported

- [ ] **Step 3: Add missile spawn + tick to `src/active-deployments.ts`**

Append to `src/active-deployments.ts`:

```ts
import { MeshBasicMaterial, SphereGeometry } from 'three';
import {
  HOMING_MISSILES_DAMAGE,
  HOMING_MISSILES_SPEED,
  HOMING_MISSILES_TRACKING_DURATION,
  HOMING_MISSILES_TRACKING_RADIUS,
  HOMING_MISSILES_TURN_RATE,
  HOMING_MISSILES_VOLLEY_COUNT,
  PICKUP_COLOR,
  PickupKind,
} from './pickups';

const VOLLEY_HALF_SPREAD = 0.225; // ~13° — matches spec's `±0.225 rad fan pattern`
const MISSILE_RADIUS = 0.12;

/**
 * Spawn a fan of missiles from ship position, aimed at `aimDir` (unit vector).
 * Returns the array of HomingMissileState (caller pushes into its live list).
 */
export function spawnMissileVolley(
  shipPosition: Vector2,
  aimDir: Vector2,
  scene: Scene,
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
  scene: Scene,
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
    const target = findNearestAsteroid(missile.position, asteroids, HOMING_MISSILES_TRACKING_RADIUS);
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
            missile.velocity.x = (newX / newLength) * HOMING_MISSILES_SPEED;
            missile.velocity.y = (newY / newLength) * HOMING_MISSILES_SPEED;
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
```

- [ ] **Step 4: Run the tests, expect PASS**

Run: `npx vitest run tests/pickups-active.test.ts -t "Homing Missiles"`
Expected: PASS, 4/4 new tests green

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 8: Ship fireRateMultiplier signature change

**Files:**
- Modify: `src/ship.ts`
- Modify: `tests/ship.test.ts`

**Interfaces:**
- Produces: `Ship.update(input, deltaTime, fireRateMultiplier?)` — multiplier scales the per-frame cooldown decrement. Used by Task 12 (Game).

- [ ] **Step 1: Read existing test file to find the test pattern**

Run: `cat /c/projects/3d_astroids/tests/ship.test.ts | head -40`

- [ ] **Step 2: Write the failing test**

Append a new `describe` block to `tests/ship.test.ts`:

```ts
describe('Ship — fireRateMultiplier (Phase 7 pickup)', () => {
  it('with fireRateMultiplier=3, fireCooldown decrements 3× as fast', () => {
    const ship = new Ship();
    ship.fireCooldown = 0.9;
    const input: InputState = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      fire: false,
      deployBreather: false,
    };
    ship.update(input, 0.1, 3);
    // Without multiplier: 0.9 - 0.1 = 0.8. With 3×: 0.9 - 0.3 = 0.6.
    expect(ship.fireCooldown).toBeCloseTo(0.6, 5);
  });

  it('with no multiplier (default), behavior is unchanged', () => {
    const ship = new Ship();
    ship.fireCooldown = 0.9;
    const input: InputState = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      fire: false,
      deployBreather: false,
    };
    ship.update(input, 0.1);
    expect(ship.fireCooldown).toBeCloseTo(0.8, 5);
  });
});
```

(If `InputState` import is needed, add: `import { InputState } from '../src/input';`)

- [ ] **Step 3: Run the test, expect FAIL**

Run: `npx vitest run tests/ship.test.ts -t "fireRateMultiplier"`
Expected: FAIL — TS error or test failure (the 3rd arg is not yet supported, or the decrement is unchanged)

- [ ] **Step 4: Update `Ship.update` in `src/ship.ts`**

```ts
update(input: InputState, deltaTime: number, fireRateMultiplier = 1): void {
  if (this.isDead) return;

  const aimDx = input.aim.x - this.state.position.x;
  const aimDy = input.aim.y - this.state.position.y;
  const aimLength = Math.hypot(aimDx, aimDy);
  this.state.aim = aimLength > 0
    ? { x: aimDx / aimLength, y: aimDy / aimLength }
    : this.state.aim;

  this.fireCooldown = Math.max(0, this.fireCooldown - deltaTime * fireRateMultiplier);
}
```

- [ ] **Step 5: Run the test, expect PASS**

Run: `npx vitest run tests/ship.test.ts -t "fireRateMultiplier"`
Expected: PASS, 2/2 new tests green

- [ ] **Step 6: Defer commit (one big commit at end)**

---

## Task 9: InputState — bind `useActive1/2/3` to `1`/`2`/`3`

**Files:**
- Modify: `src/input.ts`

**Interfaces:**
- Produces: `InputState.useActive1`, `useActive2`, `useActive3` booleans. Used by Task 12 (Game).

- [ ] **Step 1: Update `InputState` interface**

```ts
export interface InputState {
  readonly move: Vector2;
  readonly aim: Vector2;
  readonly fire: boolean;
  readonly deployBreather: boolean;
  readonly useActive1: boolean;   // bound to '1' (Digit1)
  readonly useActive2: boolean;   // bound to '2' (Digit2)
  readonly useActive3: boolean;   // bound to '3' (Digit3)
}
```

- [ ] **Step 2: Update the `onKeyDown` handler to preventDefault + track digit keys**

```ts
this.onKeyDown = (event: KeyboardEvent): void => {
  const key = event.key.toLowerCase();
  if (
    MOVEMENT_KEYS.has(key) ||
    key === ' ' ||
    key === 'x' ||
    event.code === 'Digit1' ||
    event.code === 'Digit2' ||
    event.code === 'Digit3'
  ) {
    event.preventDefault();
  }
  this.keys.add(key);
  // Also track the raw code for digit-row keys (KeyboardEvent.key is
  // locale-dependent, e.code is layout-independent).
  if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
    this.keys.add(event.code);
  }
  this.anyKeyHit = true;
};
```

- [ ] **Step 3: Update the `onKeyUp` handler to remove digit codes**

```ts
this.onKeyUp = (event: KeyboardEvent): void => {
  const key = event.key.toLowerCase();
  this.keys.delete(key);
  if (event.code === 'Digit1' || event.code === 'Digit2' || event.code === 'Digit3') {
    this.keys.delete(event.code);
  }
};
```

- [ ] **Step 4: Update `currentState()` to expose the 3 flags**

```ts
return {
  move,
  aim: { x: this.mouseX, y: this.mouseY },
  fire: this.keys.has(' ') || this.leftMouseDown,
  deployBreather: this.keys.has('x'),
  useActive1: this.keys.has('Digit1'),
  useActive2: this.keys.has('Digit2'),
  useActive3: this.keys.has('Digit3'),
};
```

- [ ] **Step 5: Verify existing input test still passes**

Run: `npx vitest run tests/input.test.ts`
Expected: PASS, all existing tests still green (signature is backward-compatible; old callers just ignore the new fields)

- [ ] **Step 6: Defer commit (one big commit at end)**

---

## Task 10: Game fields + state — pickups, active ammo, deployments, missile groups, HUD elements

**Files:**
- Modify: `src/game.ts`

**Interfaces:**
- Produces: 8 new private fields on Game, populated to defaults. Used by Tasks 11–14.

- [ ] **Step 1: Read the top of `src/game.ts` to find the field declaration block**

Run: `head -260 /c/projects/3d_astroids/src/game.ts`

- [ ] **Step 2: Add new imports near the top of `src/game.ts`**

```ts
import {
  ActiveAmmoMap,
  ActiveKindSpec,
  ACTIVE_KIND_SPECS,
  ApplyActivePickupResult as _UnusedA,  // placeholder so the import is tree-shaken correctly
  PICKUP_COLOR,
  PickupKind,
  PickupState,
  applyActivePickupEffect,
  applyPickupEffect,
  canFireActive,
  consumeActiveCharge,
  createEmptyActiveAmmo,
  createPickupMesh,
  createPickupState,
  disposePickupMesh,
  isPickupCollected,
  isPickupExpired,
  maybeDropPickup,
  tickActiveAmmo,
  updatePickup,
} from './pickups';
import {
  DroneDeploymentState,
  HomingMissileState,
  spawnDroneDeployment,
  spawnMissileVolley,
  tickDroneDeployments,
  tickHomingMissiles,
  findNearestAsteroid,
} from './active-deployments';
```

- [ ] **Step 3: Add the new private fields after the existing `activeShockwaves` declaration**

Find `private activeShockwaves: Shockwave[] = [];` and add the following block right after it:

```ts
// Phase 7 — pickup subsystem.
private pickups: LivePickup[] = [];
private activeAmmo: ActiveAmmoMap = createEmptyActiveAmmo();
private activeDeployments: DroneDeploymentState[] = [];
private homingMissiles: HomingMissileState[] = [];
private pickupHudElement: HTMLDivElement | null = null;
private pickupHudPills: Map<PickupKind, HTMLDivElement> = new Map();
private activeHudElement: HTMLDivElement | null = null;
private activeHudIcons: Map<PickupKind, ActiveHudIcon> = new Map();
```

Also add a `LivePickup` interface and an `ActiveHudIcon` interface near the top of the class (after the other `Live*` interfaces):

```ts
interface LivePickup {
  state: PickupState;
  mesh: Group;
}

interface ActiveHudIcon {
  container: HTMLDivElement;
  countLabel: HTMLDivElement;
  bar: HTMLDivElement;
  stateLabel: HTMLDivElement; // "READY" / "COOLDOWN" / "DEPLOYED" / "EMPTY"
}
```

- [ ] **Step 4: Run typecheck, expect PASS (no behavior change yet)**

Run: `npx tsc --noEmit`
Expected: PASS — the new fields are unused so they don't break anything

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 11: Game pickup lifecycle — `updatePickups`, `spawnPickup`, destroy hooks

**Files:**
- Modify: `src/game.ts`

**Interfaces:**
- Produces: `updatePickups(deltaTime)`, `spawnPickup(kind, position)`, hooks in `destroyIronAsteroid` and `destroyCrystal`. Used by Task 12 (active firing) and Task 13 (HUD).

- [ ] **Step 1: Add the `updatePickups` method**

Find a clean spot in `src/game.ts` (e.g., after `updateShards`) and add:

```ts
private updatePickups(deltaTime: number): void {
  const alive: LivePickup[] = [];
  for (const pickup of this.pickups) {
    updatePickup(pickup.state, this.ship.state.position, deltaTime);
    pickup.mesh.position.set(pickup.state.position.x, pickup.state.position.y, 0);
    pickup.mesh.rotation.z = pickup.state.spin;
    if (isPickupCollected(pickup.state, this.ship.state.position)) {
      this.applyPickupToShip(pickup.state.kind);
      this.disposePickup(pickup);
      continue;
    }
    if (isPickupExpired(pickup.state)) {
      this.disposePickup(pickup);
      continue;
    }
    alive.push(pickup);
  }
  this.pickups = alive;
}

private applyPickupToShip(kind: PickupKind): void {
  // Active kinds increment the ammo map; passive kinds push a timer.
  if (
    kind === PickupKind.BOMB_STRIKE ||
    kind === PickupKind.ORBIT_DRONES ||
    kind === PickupKind.HOMING_MISSILES
  ) {
    applyActivePickupEffect(kind, this.activeAmmo);
  } else {
    const effect = applyPickupEffect(kind, { fireCooldown: 0 }, this.shield);
    this.activeEffects.push(effect);
  }
  this.spawnFloatingTextAt(`+${ACTIVE_KIND_SPECS[kind].displayName}`, { x: this.ship.state.position.x, y: this.ship.state.position.y + 0.5 }, 0, '#00ffaa', 0, 0, 14, 1.5);
}

private disposePickup(pickup: LivePickup): void {
  this.scene.remove(pickup.mesh);
  disposePickupMesh(pickup.mesh);
}

private spawnPickup(kind: PickupKind, position: Vector2): void {
  const state = createPickupState(kind, position);
  const mesh = createPickupMesh(kind);
  mesh.position.set(position.x, position.y, 0);
  this.scene.add(mesh);
  this.pickups.push({ state, mesh });
}
```

Also add the `activeEffects` field if it doesn't already exist (it should be added at the top with the other fields):

```ts
private activeEffects: ActivePickupEffect[] = [];
```

(If `ActivePickupEffect` is not imported, add it to the import: `import { ..., ActivePickupEffect, ... } from './pickups';`)

- [ ] **Step 2: Add the `updateActivePickupEffects` helper**

```ts
private updateActivePickupEffects(deltaTime: number): void {
  const alive: ActivePickupEffect[] = [];
  for (const effect of this.activeEffects) {
    const remaining = effect.remaining - deltaTime;
    if (remaining > 0) {
      alive.push({ kind: effect.kind, remaining, total: effect.total });
    }
  }
  this.activeEffects = alive;
}
```

- [ ] **Step 3: Add `maybeDropPickup` calls in `destroyIronAsteroid`**

Inside `destroyIronAsteroid`, right after `this.spawnScrapFromAsteroid(target);`:

```ts
const kind = maybeDropPickup(target.state);
if (kind !== null) this.spawnPickup(kind, target.state.position);
```

- [ ] **Step 4: Add `maybeDropPickup` call in `destroyCrystal`**

In `destroyCrystal`, BEFORE the death tween + cleanup (per the spec's "pickup spawns BEFORE the death tween" note — so the pickup is anchored to the crystal's position, not the expanding tween mesh):

```ts
const pickupKind = maybeDropPickup(target.state);
if (pickupKind !== null) this.spawnPickup(pickupKind, target.state.position);
```

- [ ] **Step 5: Hook the new tick methods into `update(deltaTime)`**

Find the existing `update(deltaTime)` method and add the new tick calls in this order (BEFORE the existing `updateShards`):

```ts
this.updateActivePickupEffects(deltaTime);
this.updatePickups(deltaTime);
```

- [ ] **Step 6: Run typecheck, expect PASS**

Run: `npx tsc --noEmit`
Expected: PASS — pickup lifecycle is fully wired

- [ ] **Step 7: Defer commit (one big commit at end)**

---

## Task 12: Game active-firing — Bomb Strike, Orbit Drones, Homing Missiles

**Files:**
- Modify: `src/game.ts`

**Interfaces:**
- Produces: `fireActivePickup(kind)` dispatch, `updateActiveCooldowns(deltaTime)`, integration of drone/missile tickers. Used by Task 13 (HUD).

- [ ] **Step 1: Add the active-firing dispatch**

```ts
private fireActivePickup(kind: PickupKind): void {
  switch (kind) {
    case PickupKind.BOMB_STRIKE:
      this.fireBombStrike();
      break;
    case PickupKind.ORBIT_DRONES:
      this.fireOrbitDrones();
      break;
    case PickupKind.HOMING_MISSILES:
      this.fireHomingMissiles();
      break;
    default:
      throw new Error(`fireActivePickup called with passive kind ${kind}`);
  }
}

private fireBombStrike(): void {
  if (!consumeActiveCharge(this.activeAmmo[PickupKind.BOMB_STRIKE], PickupKind.BOMB_STRIKE)) return;
  const shipPos = this.ship.state.position;
  // Radial damage pass.
  const alive: LiveAsteroid[] = [];
  for (const asteroid of this.asteroids) {
    const d = Math.hypot(asteroid.state.position.x - shipPos.x, asteroid.state.position.y - shipPos.y);
    if (d <= BOMB_STRIKE_RADIUS) {
      asteroid.state.health -= BOMB_STRIKE_DAMAGE;
      if (asteroid.state.health <= 0) {
        this.destroyAsteroid(asteroid);
        continue;
      }
    }
    alive.push(asteroid);
  }
  this.asteroids = alive;
  // Shard cleanse.
  this.activeShards = this.activeShards.filter((shard) => {
    const d = Math.hypot(shard.state.position.x - shipPos.x, shard.state.position.y - shipPos.y);
    return d > BOMB_STRIKE_RADIUS;
  });
  // Visual.
  this.activeShockwaves.push(new Shockwave(shipPos, 0xff8800, 1.0));
  this.spawnFloatingTextAt('BOMB!', { x: shipPos.x, y: shipPos.y }, 0, '#ff8800', 0, 0, 18, 1.0);
}

private fireOrbitDrones(): void {
  if (this.activeDeployments.length > 0) return; // block re-press while deployed
  if (!consumeActiveCharge(this.activeAmmo[PickupKind.ORBIT_DRONES], PickupKind.ORBIT_DRONES)) return;
  this.activeDeployments.push(spawnDroneDeployment(this.ship.state.position, this.scene));
}

private fireHomingMissiles(): void {
  if (!consumeActiveCharge(this.activeAmmo[PickupKind.HOMING_MISSILES], PickupKind.HOMING_MISSILES)) return;
  const aim = this.ship.state.aim;
  const newMissiles = spawnMissileVolley(this.ship.state.position, aim, this.scene);
  for (const m of newMissiles) this.homingMissiles.push(m);
}
```

- [ ] **Step 2: Add the cooldown + deployment/missile tickers**

```ts
private updateActiveDeployments(deltaTime: number): void {
  // Tick all 3 active ammo cooldowns.
  for (const kind of Object.values(PickupKind)) {
    if (ACTIVE_KIND_SPECS[kind].durationSeconds > 0) continue; // skip deployable kinds for cooldown
    tickActiveAmmo(this.activeAmmo[kind], deltaTime);
  }
  // Tick drone deployments.
  this.activeDeployments = tickDroneDeployments(
    this.activeDeployments,
    this.ship.state.position,
    this.asteroids.map((a) => a.state),
    deltaTime,
    this.scene,
    (origin, target) => {
      // Drone fires a normal projectile at the target.
      const dx = target.position.x - origin.x;
      const dy = target.position.y - origin.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.01) return;
      const dir = { x: dx / len, y: dy / len };
      const projState = createProjectile(origin, dir);
      const projMesh = new Mesh(
        new SphereGeometry(PROJECTILE_RADIUS, 6, 6),
        new MeshBasicMaterial({ color: 0x66ddff }),
      );
      projMesh.position.set(origin.x, origin.y, 0);
      this.scene.add(projMesh);
      this.projectiles.push({ state: projState, mesh: projMesh });
    },
  );
  // Tick homing missiles.
  this.homingMissiles = tickHomingMissiles(
    this.homingMissiles,
    this.asteroids.map((a) => a.state),
    deltaTime,
    this.scene,
    (asteroid) => {
      const live = this.asteroids.filter((a) => a.state !== asteroid);
      asteroid.health -= HOMING_MISSILES_DAMAGE;
      if (asteroid.health <= 0) {
        this.destroyAsteroid(asteroid);
      } else {
        live.push(this.findLiveAsteroidByState(asteroid));
      }
      this.asteroids = live.filter((a): a is LiveAsteroid => a !== null);
    },
  );
}
```

Note: `findLiveAsteroidByState` is a small helper that maps a state back to its LiveAsteroid. If the existing `asteroids` array uses state objects directly (not wrapped in `LiveAsteroid`), simplify the callback to mutate `asteroid.health` in place and rely on the existing `handleCollisions`/frame end to cull. Adapt the plan's code to match the project's actual LiveAsteroid wrapping — if `this.asteroids` is `AsteroidState[]`, the callback is trivial.

- [ ] **Step 3: Add the active-fire input check in `update(deltaTime)`**

After `updateActivePickupEffects(deltaTime)` and `updatePickups(deltaTime)`, add:

```ts
this.updateActiveDeployments(deltaTime);
if (this.input.useActive1 && canFireActive(this.activeAmmo[PickupKind.BOMB_STRIKE])) {
  this.fireActivePickup(PickupKind.BOMB_STRIKE);
}
if (this.input.useActive2 && canFireActive(this.activeAmmo[PickupKind.ORBIT_DRONES])) {
  this.fireActivePickup(PickupKind.ORBIT_DRONES);
}
if (this.input.useActive3 && canFireActive(this.activeAmmo[PickupKind.HOMING_MISSILES])) {
  this.fireActivePickup(PickupKind.HOMING_MISSILES);
}
```

- [ ] **Step 4: Run typecheck, expect PASS**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 13: HUD — passive pill row + active icon row

**Files:**
- Modify: `src/game.ts`

**Interfaces:**
- Produces: 2 new HUD regions mounted in `createHud`, reconciled in `updateHud`, removed in `stop`. The passive pill row is the existing `pickupHudElement` from the spec; the active icon row is the new `activeHudElement`.

- [ ] **Step 1: Add HUD region creation to `createHud`**

At the end of `createHud` (right before its closing brace), add:

```ts
// Bottom-center passive pill row.
this.pickupHudElement = document.createElement('div');
this.pickupHudElement.style.position = 'absolute';
this.pickupHudElement.style.bottom = '16px';
this.pickupHudElement.style.left = '50%';
this.pickupHudElement.style.transform = 'translateX(-50%)';
this.pickupHudElement.style.display = 'flex';
this.pickupHudElement.style.gap = '8px';
this.pickupHudElement.style.pointerEvents = 'none';
document.body.appendChild(this.pickupHudElement);

// Bottom-right active icon row.
this.activeHudElement = document.createElement('div');
this.activeHudElement.style.position = 'absolute';
this.activeHudElement.style.bottom = '16px';
this.activeHudElement.style.right = '16px';
this.activeHudElement.style.display = 'flex';
this.activeHudElement.style.gap = '8px';
this.activeHudElement.style.pointerEvents = 'none';
document.body.appendChild(this.activeHudElement);

for (const kind of [PickupKind.BOMB_STRIKE, PickupKind.ORBIT_DRONES, PickupKind.HOMING_MISSILES]) {
  const spec = ACTIVE_KIND_SPECS[kind];
  const container = document.createElement('div');
  container.style.width = '56px';
  container.style.height = '56px';
  container.style.border = `2px solid #${spec.color.toString(16).padStart(6, '0')}`;
  container.style.padding = '4px';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '12px';
  container.style.color = '#ffffff';
  container.style.background = 'rgba(0,0,0,0.4)';
  container.style.textAlign = 'center';
  container.style.opacity = '0.3';
  const countLabel = document.createElement('div');
  countLabel.textContent = '0';
  countLabel.style.fontWeight = 'bold';
  const bar = document.createElement('div');
  bar.style.height = '4px';
  bar.style.background = `#${spec.color.toString(16).padStart(6, '0')}`;
  bar.style.marginTop = '4px';
  bar.style.width = '0%';
  const stateLabel = document.createElement('div');
  stateLabel.textContent = 'EMPTY';
  stateLabel.style.fontSize = '10px';
  container.appendChild(countLabel);
  container.appendChild(bar);
  container.appendChild(stateLabel);
  this.activeHudElement.appendChild(container);
  this.activeHudIcons.set(kind, { container, countLabel, bar, stateLabel });
}
```

- [ ] **Step 2: Add the HUD reconciliation to `updateHud`**

At the end of `updateHud`, add:

```ts
// Reconcile passive pill row to activeEffects.
const presentPassiveKinds = new Set(this.activeEffects.map((e) => e.kind));
for (const [kind, pill] of this.pickupHudPills) {
  if (!presentPassiveKinds.has(kind)) {
    pill.remove();
    this.pickupHudPills.delete(kind);
  }
}
for (const effect of this.activeEffects) {
  let pill = this.pickupHudPills.get(effect.kind);
  if (!pill) {
    pill = document.createElement('div');
    const color = `#${PICKUP_COLOR[effect.kind].toString(16).padStart(6, '0')}`;
    pill.style.border = `2px solid ${color}`;
    pill.style.padding = '4px 8px';
    pill.style.minWidth = '80px';
    pill.style.fontFamily = 'monospace';
    pill.style.fontSize = '12px';
    pill.style.color = '#ffffff';
    pill.style.background = 'rgba(0,0,0,0.4)';
    const label = document.createElement('div');
    label.textContent = ACTIVE_KIND_SPECS[effect.kind].displayName;
    label.style.fontWeight = 'bold';
    const timeLabel = document.createElement('div');
    timeLabel.style.fontSize = '10px';
    const bar = document.createElement('div');
    bar.style.height = '4px';
    bar.style.background = color;
    bar.style.marginTop = '2px';
    pill.appendChild(label);
    pill.appendChild(timeLabel);
    pill.appendChild(bar);
    this.pickupHudElement?.appendChild(pill);
    this.pickupHudPills.set(effect.kind, pill);
    pill.dataset.labelId = `label-${effect.kind}`;
    pill.dataset.timeId = `time-${effect.kind}`;
    pill.dataset.barId = `bar-${effect.kind}`;
  }
  const label = pill.querySelector(`[data-label-id="label-${effect.kind}"]`) as HTMLDivElement;
  const timeLabel = pill.querySelector(`[data-time-id="time-${effect.kind}"]`) as HTMLDivElement;
  const bar = pill.querySelector(`[data-bar-id="bar-${effect.kind}"]`) as HTMLDivElement;
  timeLabel.textContent = `${effect.remaining.toFixed(1)}s`;
  bar.style.width = `${(effect.remaining / effect.total) * 100}%`;
}

// Reconcile active icon row to activeAmmo.
for (const kind of [PickupKind.BOMB_STRIKE, PickupKind.ORBIT_DRONES, PickupKind.HOMING_MISSILES]) {
  const icon = this.activeHudIcons.get(kind);
  if (!icon) continue;
  const ammo = this.activeAmmo[kind];
  const spec = ACTIVE_KIND_SPECS[kind];
  icon.countLabel.textContent = `${ammo.charges}`;
  const onCooldown = ammo.cooldownRemaining > 0;
  const deployed = kind === PickupKind.ORBIT_DRONES && this.activeDeployments.length > 0;
  if (ammo.charges === 0 && !onCooldown) {
    icon.container.style.opacity = '0.3';
    icon.stateLabel.textContent = 'EMPTY';
    icon.bar.style.width = '0%';
  } else if (deployed) {
    icon.container.style.opacity = '1';
    icon.stateLabel.textContent = 'DEPLOYED';
    const dep = this.activeDeployments[0];
    const ratio = dep.remaining / ORBIT_DRONES_DURATION_SECONDS;
    icon.bar.style.width = `${ratio * 100}%`;
  } else if (onCooldown) {
    icon.container.style.opacity = '0.5';
    icon.stateLabel.textContent = 'COOLDOWN';
    const ratio = 1 - ammo.cooldownRemaining / spec.cooldownSeconds;
    icon.bar.style.width = `${ratio * 100}%`;
  } else {
    icon.container.style.opacity = '1';
    icon.stateLabel.textContent = 'READY';
    icon.bar.style.width = '100%';
  }
}
```

- [ ] **Step 3: Add HUD cleanup to `stop()`**

In the `stop()` method, add (alongside the existing `activeShockwaves` cleanup):

```ts
if (this.pickupHudElement) {
  this.pickupHudElement.remove();
  this.pickupHudElement = null;
}
this.pickupHudPills.clear();
if (this.activeHudElement) {
  this.activeHudElement.remove();
  this.activeHudElement = null;
}
this.activeHudIcons.clear();
this.activeAmmo = createEmptyActiveAmmo();
this.activeDeployments = [];
this.homingMissiles = [];
this.activeEffects = [];
this.pickups = [];
```

- [ ] **Step 4: Run typecheck, expect PASS**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 14: spreadAnglesForFrame helper for SPREAD pickup

**Files:**
- Modify: `src/game.ts`

**Interfaces:**
- Produces: `spreadAnglesForFrame(): number[]` returning `[0]` normally, `[-0.26, 0, 0.26]` when SPREAD pickup is active. Used by `fireProjectile` (called from the input-fire path).

- [ ] **Step 1: Add the helper**

```ts
private spreadAnglesForFrame(): number[] {
  const hasSpread = this.activeEffects.some((e) => e.kind === PickupKind.SPREAD);
  if (!hasSpread) return [0];
  // 3-way spread at ±15° (0.2618 rad).
  return [-0.2618, 0, 0.2618];
}
```

- [ ] **Step 2: Update `fireProjectile` to use the angle array**

```ts
private fireProjectile(): void {
  this.ship.resetCooldown();
  const direction = this.ship.state.aim;
  const angles = this.spreadAnglesForFrame();
  for (const angleOffset of angles) {
    const cos = Math.cos(angleOffset);
    const sin = Math.sin(angleOffset);
    const dirX = direction.x * cos - direction.y * sin;
    const dirY = direction.x * sin + direction.y * cos;
    const dir: Vector2 = { x: dirX, y: dirY };
    const noseOffset: Vector2 = {
      x: dirX * 0.9,
      y: dirY * 0.9,
    };
    const spawn: Vector2 = {
      x: this.ship.state.position.x + noseOffset.x,
      y: this.ship.state.position.y + noseOffset.y,
    };
    const state = createProjectile(spawn, dir);
    const mesh = new Mesh(
      new SphereGeometry(PROJECTILE_RADIUS, 8, 8),
      new MeshBasicMaterial({ color: 0xaaddff }),
    );
    mesh.position.set(spawn.x, spawn.y, 0);
    this.projectiles.push({ state, mesh });
    this.scene.add(mesh);
  }
}
```

- [ ] **Step 3: Wire `fireRateMultiplier` into `ship.update` call**

Find the call site `this.ship.update(input, deltaTime)` and update to:

```ts
const fireRateMultiplier = this.activeEffects.some((e) => e.kind === PickupKind.FIRE_RATE) ? 3 : 1;
this.ship.update(input, deltaTime, fireRateMultiplier);
```

- [ ] **Step 4: Run typecheck, expect PASS**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Defer commit (one big commit at end)**

---

## Task 15: Quality gates — typecheck + vitest + build

**Files:** none (verification only)

- [ ] **Step 1: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors)

- [ ] **Step 2: Run full vitest suite**

Run: `npx vitest run`
Expected: ALL existing tests + ~36 new pickup tests (15 passive + 21 active) green. Total ~239 tests.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: SUCCESS (clean bundle)

- [ ] **Step 4: If any failure, dispatch a fix subagent and re-run**

Don't proceed to the final commit until all 3 gates pass. Per the workflow-gates rule, ask the user which gate scope to run before each invocation; the user already said "one big commit" so this is the final gate.

---

## Task 16: The one big commit + memory update + push

**Files:** all changes from Tasks 1–14, plus a memory entry.

- [ ] **Step 1: Stage everything**

Run:
```bash
git add src/pickups.ts src/active-deployments.ts src/input.ts src/ship.ts src/game.ts tests/pickups.test.ts tests/pickups-active.test.ts tests/ship.test.ts
git status
```
Expected: shows the 8 files staged. NO dist/ or unrelated changes.

- [ ] **Step 2: Commit with the agreed message**

Run:
```bash
git commit -m "feat(pickups): Phase 7 — 3 passive + 3 active (Bomb Strike / Orbit Drones / Homing Missiles)" -m "Implements the Phase 7 spec (3cea662). Six pickup kinds total:
- Passive: FIRE_RATE (3x cooldown, 6s), SHIELD (+50% energy, 8s), SPREAD (3-way ±15°, 10s)
- Active:  BOMB_STRIKE (radial 5.0 AOE, 3 charges, 3s cd), ORBIT_DRONES (2 satellites, 6s deploy, 4s cd), HOMING_MISSILES (4-volley tracking, 3 charges, 4s cd)

Architecture:
- src/pickups.ts: enum, lifecycle helpers, ACTIVE_KIND_SPECS table, mesh factory
- src/active-deployments.ts: drone + missile per-frame state (kept out of game.ts)
- src/input.ts: +useActive1/2/3 fields, Digit1/2/3 binding
- src/ship.ts: +fireRateMultiplier parameter on Ship.update
- src/game.ts: pickup array, active ammo, deployment tickers, HUD pill rows, destroy hooks

Tests: 36 new (15 passive + 21 active) — total vitest count 239."
```

- [ ] **Step 3: Write a memory entry for the Phase 7 completion**

Create `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\project_phase_7_pickups_completed.md`:

```markdown
---
name: project_phase_7_pickups_completed
description: "Phase 7 — Temporary Pickups shipped. 3 passive + 3 active (Bomb Strike / Orbit Drones / Homing Missiles), one big commit on 2026-06-24."
metadata:
  type: project
---

Phase 7 delivers the first pickup subsystem in 3D Astroids.

**6 pickup kinds:**
- Passive (timer-based): FIRE_RATE 3x/6s, SHIELD +50%/8s, SPREAD 3-way ±15°/10s
- Active (charges+cooldown): BOMB_STRIKE slot 1 (3 charges, 3s cd, 5.0 radius AOE), ORBIT_DRONES slot 2 (2 charges, 4s cd, 6s deploy), HOMING_MISSILES slot 3 (3 charges, 4s cd, 4-volley tracking)

**Architecture:**
- `src/pickups.ts` — pure logic (enums, constants, lifecycle, drop roll, ACTIVE_KIND_SPECS table)
- `src/active-deployments.ts` — per-frame state for drones + missiles (split out of game.ts)
- HUD: bottom-center passive pill row + bottom-right 3-icon active row

**Key design choice:** ACTIVE_KIND_SPECS is the single source of truth for active
kind behavior; applyActivePickupEffect reads chargeCap from the table, not from
per-kind constants. Defensive test guards against table/constant divergence.

**Drop rate:** crystal = guaranteed 1/6 uniform; iron LARGE = 10% chance 1/6 uniform.

**File growth:** game.ts added 8 new fields + ~6 new methods (~150 lines). Still
under 2300 lines. active-deployments.ts (new) is ~180 lines.

**Why drones are "active press + passive timer" (not pure passive):** charge-gating
prevents the player from stockpiling drones from rapid crystal kills; HUD consistency
(slots 1/2/3 read the same).

**Open questions deferred from spec:**
- Drones target nearest or crystal-priority? (implemented: nearest)
- Missiles target asteroids only or shards too? (implemented: asteroids only)
- Drone projectile speed (4.0 vs 6.0)? (implemented: 4.0 = same as player)
- Drone auto-fire audible? (implemented: no)
- Press 2 during fade-out blocked? (implemented: yes, "block re-press while active")

See [[project_phase_6_shard_swarm_completed]] and [[project_phase_6b_crystal_cascade_completed]]
for the shard-cascade context that drops the crystals that seed pickups.
```

- [ ] **Step 4: Add the index pointer in MEMORY.md**

Append to `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\MEMORY.md` under `## Project`:

```
- [Phase 7 Pickups Completed](project_phase_7_pickups_completed.md) — 3 passive + 3 active with charges+cooldown actives, ACTIVE_KIND_SPECS single source of truth
```

- [ ] **Step 5: Ask the user whether to push**

Per the workflow-gates rule, AskUserQuestion is the default for any external action. Use `AskUserQuestion` to ask: "Push the Phase 7 commit to origin/phase-2-movement?" with options "Yes — push" / "No — leave local only". Same pattern as the spec commit earlier.

- [ ] **Step 6: If push approved, run it**

Run: `git push origin phase-2-movement`

---

## Self-Review

- **Spec coverage:** All 6 pickup kinds implemented (3 passive + 3 active). HUD pill row + icon row both present. Drop roll covers crystal-guaranteed and iron-LARGE-10%. Charge caps and cooldowns match spec exactly. Tests cover all 36 assertions from the spec. ✓
- **Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details". One `findLiveAsteroidByState` helper mentioned in Task 12 — explicitly noted as "adapt to the project's actual LiveAsteroid wrapping." The implementer should read `game.ts` LiveAsteroid and either use the helper or simplify the callback. Not a true placeholder — clear escape hatch.
- **Type consistency:** All type names match between tasks. `PickupKind` is the single enum. `ActiveAmmoState`, `ActiveAmmoMap`, `ActiveKindSpec`, `ACTIVE_KIND_SPECS` are defined once in Task 4 and referenced in Tasks 5, 11, 12, 13. `LivePickup` and `ActiveHudIcon` interfaces defined in Task 10. No name drift.
- **Open risk:** The `findLiveAsteroidByState` helper in Task 12 is the only piece of code that depends on the existing `LiveAsteroid` shape. If `this.asteroids` is `LiveAsteroid[]` with `.state` nested, the missile-impact callback needs adjustment. The implementer must read `game.ts` lines around 230–250 (where `asteroids` is declared) to confirm the shape before writing the callback. **This is a known escape hatch, not a placeholder.**
