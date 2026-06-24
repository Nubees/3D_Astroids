import { Group, IcosahedronGeometry, Mesh, MeshStandardMaterial } from 'three';
import { AsteroidKind, AsteroidSize, AsteroidState, Vector2 } from './types';

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

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Pickup drop roll + passive effect application
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Decide whether destroying an asteroid drops a pickup, and apply
//          the 3 passive pickup kinds to the ship / shield. Active kinds
//          are handled by Task 4 (applyActivePickupEffect) — this function
//          THROWS on active kinds as a guardrail against regressions.
// Setup:   Called from src/game.ts (destroyIronAsteroid, destroyCrystal,
//          applyPickupToShip). Tests import createAsteroidState directly
//          from src/asteroid so this file does not need a circular import.
// Issues:  None.
// Fix:     Phase 7. Crystal = guaranteed 1/6 kind; IRON LARGE = 10% chance
//          1/6 kind; other iron sizes = no drop. SHIELD effect heals
//          50% of maxEnergy capped at maxEnergy so a full shield does not
//          waste the pickup.
// Gotchas: The drop-roll calls Math.random() 1-2 times. The 10% roll
//          branches BEFORE the kind-pick so misses cost exactly 1
//          Math.random() call (preserves determinism when the test stubs
//          Math.random with a fixed return value). Active kinds throw —
//          callers must route them to applyActivePickupEffect (Task 4).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * All kinds eligible to drop from any source. Used to index into the
 * uniform-random kind picker (1 of 6, including all 3 active kinds).
 */
const ALL_KINDS: PickupKind[] = [
  PickupKind.FIRE_RATE,
  PickupKind.SHIELD,
  PickupKind.SPREAD,
  PickupKind.BOMB_STRIKE,
  PickupKind.ORBIT_DRONES,
  PickupKind.HOMING_MISSILES,
];

/**
 * Iron LARGE drop chance (10%). Crystals always drop; other iron sizes
 * never drop — see the maybeDropPickup dispatch.
 */
const IRON_LARGE_PICKUP_CHANCE = 0.10;

export function maybeDropPickup(state: AsteroidState): PickupKind | null {
  if (state.kind === AsteroidKind.CRYSTAL) {
    // Guaranteed drop; pick a uniform-random kind.
    const idx = Math.floor(Math.random() * ALL_KINDS.length);
    return ALL_KINDS[idx];
  }
  if (state.kind === AsteroidKind.IRON && state.size === AsteroidSize.LARGE) {
    // 10% chance for iron LARGE. A separate Math.random() call so the
    // "kind picker" only fires on a successful roll.
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
 * Active kinds return a different shape (ActiveAmmoState) and go through
 * applyActivePickupEffect instead — see Task 4.
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
      // effect itself just registers a timer for the HUD.
      return {
        kind,
        remaining: PICKUP_DURATION_SECONDS[kind],
        total: PICKUP_DURATION_SECONDS[kind],
      };
    }
    case PickupKind.SHIELD: {
      const heal = 0.5 * shield.maxEnergy;
      shield.energy = Math.min(shield.maxEnergy, shield.energy + heal);
      return {
        kind,
        remaining: PICKUP_DURATION_SECONDS[kind],
        total: PICKUP_DURATION_SECONDS[kind],
      };
    }
    case PickupKind.SPREAD: {
      // Spread angles are computed in Game.spreadAnglesForFrame; the effect
      // just registers a timer for the HUD.
      return {
        kind,
        remaining: PICKUP_DURATION_SECONDS[kind],
        total: PICKUP_DURATION_SECONDS[kind],
      };
    }
    default:
      // Active kinds are handled in Task 4 — guardrail so a caller cannot
      // accidentally route an active kind through the passive path.
      throw new Error(
        `applyPickupEffect called with active kind ${kind} — use applyActivePickupEffect instead`,
      );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Active pickups (Phase 7 DIAL-UP)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Per-kind ammo + cooldown for the 3 active pickup kinds. All
//          lookups go through ACTIVE_KIND_SPECS so the same code path
//          handles all 3 active kinds.
// Setup:   Game owns one ActiveAmmoMap; createEmptyActiveAmmo() returns a
//          fresh map on stop()/respawn.
// Gotchas: Charges are pickup-gated only (no time-based regen). Cooldowns
//          tick via tickActiveAmmo — but only for non-deployable kinds
//          (BOMB_STRIKE, HOMING_MISSILES). For deployable kinds
//          (ORBIT_DRONES) the cooldown is set by the Game when the
//          deployment is culled, not at press time. consumeActiveCharge
//          branches on ACTIVE_KIND_SPECS[kind].isDeployable to keep the
//          "fire" path single-source-of-truth.
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
  // Passive kinds: spec is a no-op placeholder (chargeCap=0, isDeployable=false)
  // so the same Record<PickupKind, ActiveKindSpec> type covers all 6 kinds.
  [PickupKind.FIRE_RATE]: {
    chargeCap: 0,
    cooldownSeconds: 0,
    displayName: 'FIRE',
    color: 0xff8800,
    isDeployable: false,
    durationSeconds: 0,
  },
  [PickupKind.SHIELD]: {
    chargeCap: 0,
    cooldownSeconds: 0,
    displayName: 'SHIELD',
    color: 0x66aaff,
    isDeployable: false,
    durationSeconds: 0,
  },
  [PickupKind.SPREAD]: {
    chargeCap: 0,
    cooldownSeconds: 0,
    displayName: 'SPREAD',
    color: 0x66ff66,
    isDeployable: false,
    durationSeconds: 0,
  },
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
  // For deployable kinds (ORBIT_DRONES), the cooldown does NOT start at press
  // time — it starts AFTER the 6s active window expires. The Game is
  // responsible for setting cooldownRemaining when the deployment is culled.
  if (!ACTIVE_KIND_SPECS[kind].isDeployable) {
    ammo.cooldownRemaining = ACTIVE_KIND_SPECS[kind].cooldownSeconds;
  }
  return true;
}

export function tickActiveAmmo(ammo: ActiveAmmoState, deltaTime: number): void {
  ammo.cooldownRemaining = Math.max(0, ammo.cooldownRemaining - deltaTime);
}
// Note: tickActiveAmmo is a pure per-ammo cooldown decrementer. The Game
// is responsible for skipping deployable kinds so their cooldown does not
// tick down while the deployment is still active.

// ═══════════════════════════════════════════════════════════════════════════
// Pickup mesh factory + dispose (Phase 7 Task 5)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Build and tear down the small colored icosahedron mesh that
//          represents an in-world pickup. Each call returns a fresh Group
//          so multiple pickups can share the scene without material
//          collisions.
// Setup:   Called from src/game.ts (spawnPickup, disposePickup). Tests
//          import both functions and assert the Group shape + a clean
//          dispose (no thrown error).
// Issues:  None.
// Fix:     Phase 7 Task 5. Pure-Node tests do NOT need a renderer — Three.js
//          geometries and materials are plain JS objects, so .dispose() and
//          .remove() are safe in Node.
// Gotchas: disposePickupMesh handles BOTH a single MeshStandardMaterial
//          and the (future) array-of-materials case so adding multi-pass
//          materials later does not leak GPU resources. The Group child
//          loop uses while + remove() to mutate the children array in
//          place (no splice needed).
// ═══════════════════════════════════════════════════════════════════════════

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
