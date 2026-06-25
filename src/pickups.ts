import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  TetrahedronGeometry,
} from 'three';
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

// Phase 7b — per-kind geometry table. Allocated once at module load, reused
// across all instances of each kind. Color-blind-safe silhouette telegraph.
const PICKUP_GEOMETRY_BY_KIND: Record<PickupKind, BufferGeometry> = {
  [PickupKind.FIRE_RATE]: new TetrahedronGeometry(0.22, 0),
  [PickupKind.SHIELD]: new OctahedronGeometry(0.18, 0),
  [PickupKind.SPREAD]: new IcosahedronGeometry(0.18, 0),
  [PickupKind.BOMB_STRIKE]: new DodecahedronGeometry(0.20, 0),
  [PickupKind.ORBIT_DRONES]: new IcosahedronGeometry(0.14, 0),
  [PickupKind.HOMING_MISSILES]: new ConeGeometry(0.14, 0.30, 6),
};

// Phase 7b — per-kind spin axis. Each kind has a distinct rotation axis
// so color-blind players can distinguish pickups by silhouette + motion.
export const PICKUP_SPIN_AXIS: Record<PickupKind, 'x' | 'y' | 'z'> = {
  [PickupKind.FIRE_RATE]: 'x',
  [PickupKind.SHIELD]: 'y',
  [PickupKind.SPREAD]: 'z',
  [PickupKind.BOMB_STRIKE]: 'y',
  [PickupKind.ORBIT_DRONES]: 'x',
  [PickupKind.HOMING_MISSILES]: 'z',
};

export const PICKUP_BOB_AMPLITUDE = 0.12;
export const PICKUP_BOB_FREQUENCY_HZ = 0.6;
export const PICKUP_EMISSIVE_PULSE_FREQUENCY_HZ = 0.8;
export const PICKUP_EMISSIVE_PULSE_AMPLITUDE = 0.15;
export const PICKUP_SONAR_RING_PERIOD_SECONDS = 1.5;
export const PICKUP_HALO_BASE_OPACITY = 0.15;
export const PICKUP_HALO_PROXIMITY_BOOST = 0.4;

let _sharedHaloTexture: CanvasTexture | null = null;
function getSharedHaloTexture(): CanvasTexture | null {
  if (_sharedHaloTexture !== null) return _sharedHaloTexture;
  if (typeof document === 'undefined') {
    // Node test env (vitest). Cache the null so the second call also returns null
    // — the SpriteMaterial will then use no map (still works, just a flat sprite).
    _sharedHaloTexture = null;
    return null;
  }
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  _sharedHaloTexture = new CanvasTexture(canvas);
  _sharedHaloTexture.needsUpdate = true;
  return _sharedHaloTexture;
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

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7b powerup VFX upgrade constants
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7b upgrade — bomb radius bumped to match the "wipes out the
//          area" intent; missile constants tuned for the new staggered-volley
//          behavior and visibly tracking curve; two new constants (volley
//          stagger ms + impact radius) that later tasks consume.
// Setup: Imported by src/active-deployments.ts, src/game.ts, and tests.
//        Tests lock these values via expect().toBe() (pickups-active.test.ts).
// Issues: Old 5.0 bomb radius only covered a tight cluster around the ship;
//        old 1.5s tracking + 8.0 turn rate + 0.3 hard-coded impact radius let
//        missiles miss through small gaps and arc so shallow the curve was
//        invisible at gameplay speed.
// Fix: Phase 7b. Numbers picked from research findings; the user picked (A)
//        8.0 from the "5.0 / 8.0 / 10.0" bomb-radius fork. HOMING_MISSILES_*
//        increases aim for "satisfying tracking arc" — speed +60%, tracking
//        radius +25%, tracking duration +67%, turn rate +75%. Stagger (180ms
//        per missile × 4 missiles = 540ms total) gives the volley a visible
//        ripple. Impact radius pulled from a magic number into a named
//        constant so we can tune the hit window without grepping game.ts.
// Gotchas: BOMB_STRIKE_RADIUS change means fireBombStrike's damage pass now
//          also catches crystals at 6-8 units (was 4-5). Existing tests
//          assert the OLD values (BOMB_STRIKE_RADIUS===5.0 etc.) and need
//          updating — do this in Task 9, when the Game.ts wiring ships.
//          HOMING_MISSILES_MISSILE_IMPACT_RADIUS replaces a hard-coded 0.3
//          in game.ts; Task 7's wiring must read this constant rather than
//          re-introduce a literal.
//          Phase 7c — damage constants bumped 1→10 (one-shot any asteroid),
//          and SHIELD pickup now grants a bomb charge as a conversion bonus
//          (see applyActivePickupEffect). The KillSource type is also
//          exported from this file for the destroyAsteroid source param.
// ═══════════════════════════════════════════════════════════════════════════

// Bomb Strike constants.
export const BOMB_STRIKE_RADIUS = 8.0; // was 5.0 — Phase 7b "wipes out the area" upgrade
export const BOMB_STRIKE_COOLDOWN_SECONDS = 3.0;
export const BOMB_STRIKE_CHARGE_CAP = 3;
export const BOMB_STRIKE_DAMAGE = 10;

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — KillSource enum (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7c — tag every asteroid kill with its source so the destroy
//          path can decide whether to split (bullet/wall = split, bomb/
//          missile = no split). The enum is a string union so it shows up
//          grep-able in the call site (`destroyAsteroid(asteroid, 'BOMB')`)
//          and so future kill sources (drones, future charge-up weapons)
//          just add an entry without re-plumbing a parameter type.
// Setup:   Imported by src/game.ts (destroyAsteroid + 2 call sites). Tests
//          import the type and pass literal strings.
// Issues:  Phase 7b bomb killed iron LARGE in 4 hits (BOMB_STRIKE_DAMAGE=1,
//          SIZE_HEALTH[LARGE]=4) and ALWAYS spawned 2 MEDIUM children via
//          splitAsteroid — so the bomb "screen-cleared" but immediately
//          repopulated the arena. Phase 7c fixes both: damage 1→10, and
//          BOMB/MISSILE source skips splitAsteroid.
// Fix:     Bumping the damage constants + adding the source param. The
//          'BULLET'/'WALL' values preserve existing behavior; the new
//          'BOMB'/'MISSILE' values are the fix.
// Gotchas: CRYSTAL_HEALTH_FOR_TEST is a re-export of CRYSTAL_HEALTH from
//          src/asteroid.ts (not 6 hard-coded) so a future balance change
//          in asteroid.ts is picked up automatically. Re-exports of other
//          modules' types live in their natural home — pickups.ts is
//          convenient because the test file already imports from here.
// ═══════════════════════════════════════════════════════════════════════════

export type KillSource = 'BULLET' | 'BOMB' | 'MISSILE' | 'WALL' | 'SHARD';

export { CRYSTAL_HEALTH as CRYSTAL_HEALTH_FOR_TEST } from './asteroid';

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
export const HOMING_MISSILES_DAMAGE = 10;
export const HOMING_MISSILES_SPEED = 7.0; // was 6.0
export const HOMING_MISSILES_TRACKING_RADIUS = 10.0; // was 8.0
export const HOMING_MISSILES_TRACKING_DURATION = 2.5; // was 1.5
export const HOMING_MISSILES_TURN_RATE = 14.0; // was 8.0
export const HOMING_MISSILES_VOLLEY_STAGGER_MS = 180; // NEW — 0/180/360/540ms cadence
export const HOMING_MISSILES_MISSILE_IMPACT_RADIUS = 0.45; // NEW — was hard-coded 0.3

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
    color: 0xffaa00,
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
  // Phase 7c — SHIELD pickup grants a bomb charge as a conversion bonus, so
  // the player can "spend" a SHIELD on a bomb when the moment calls for it.
  // Without this, a SHIELD pickup in a tight spot only buys +50% shield
  // energy, which the player may not need if shields are already full.
  if (kind === PickupKind.SHIELD) {
    const bombAmmo = activeAmmo[PickupKind.BOMB_STRIKE];
    const bombSpec = ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE];
    bombAmmo.charges = Math.min(bombSpec.chargeCap, bombAmmo.charges + 1);
  }
  // Phase 7c — pickup-gated refills only. tickActiveAmmo no longer bumps
  // charges (the function only decrements cooldownRemaining). Charges are
  // gained ONLY through applyActivePickupEffect — no passive regen, no
  // time-based recovery. The Game previously called applyActivePickupEffect
  // from applyPickupToShip (lines 1177-1184); the path is unchanged.
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
// My Rules — Pickup mesh factory + dispose (Phase 7b)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Phase 7b — give each pickup a distinct visual identity
//          (color + silhouette + motion) so color-blind players can
//          distinguish kinds. Per-kind geometry, per-kind spin axis,
//          vertical bobbing, emissive pulse, sonar ring, proximity halo.
// Setup:   createPickupMesh is called from src/game.ts:1089 (spawnPickup);
//          disposePickupMesh is called from src/game.ts:1084 (disposePickup).
//          The per-frame updatePickups reads _body / _sonar / _halo refs
//          stashed on the group by createPickupMesh.
// Issues:  Phase 7 used IcosahedronGeometry for ALL 6 kinds — color was the
//          only differentiator, so color-blind players couldn't distinguish.
// Fix:     Phase 7b. Per-kind geometry table (Tetrahedron / Octahedron /
//          Icosahedron / Dodecahedron / small Icosahedron / Cone) plus
//          per-kind spin axis (X/Y/Z). Plus 3 VFX layers: sonar ring
//          (additive RingGeometry, scale 1.0→2.5× over 1.5s), emissive
//          pulse on the body (±0.15 at 0.8 Hz), vertical bob (0.12 amplitude
//          at 0.6 Hz), proximity halo (additive Sprite brightens within
//          2.5 units).
// Gotchas: The 6 per-kind geometries are module-scope — disposePickupMesh
//          MUST skip them or the second pickup spawn crashes with
//          "geometry is disposed". The shared halo CanvasTexture is
//          allocated once at first pickup spawn (Node test envs cache
//          the null fallback; SpriteMaterial still renders as a flat
//          color glow at the per-frame opacities used).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a small colored geometry for the pickup. Each kind gets:
 *   - Body: per-kind geometry (Octahedron, Tetrahedron, etc.) with kind color
 *   - Sonar ring: additive RingGeometry child that pulses scale 1.0→2.5×
 *   - Proximity halo: additive Sprite child that brightens as ship approaches
 * Each kind's geometry is shared from PICKUP_GEOMETRY_BY_KIND (one allocation
 * at module load). The sonar ring + halo are unique per-instance.
 */
export function createPickupMesh(kind: PickupKind): Group {
  const group = new Group();

  const body = new Mesh(
    PICKUP_GEOMETRY_BY_KIND[kind],
    new MeshStandardMaterial({
      color: PICKUP_COLOR[kind],
      emissive: PICKUP_COLOR[kind],
      emissiveIntensity: 0.4,
      flatShading: true,
    }),
  );
  group.add(body);

  // Sonar ring — additive, lies on the ground plane, pulses outward.
  const sonar = new Mesh(
    new RingGeometry(0.3, 0.5, 32),
    new MeshBasicMaterial({
      color: PICKUP_COLOR[kind],
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  sonar.rotation.x = -Math.PI / 2;
  sonar.position.y = -0.05;
  group.add(sonar);

  // Proximity halo — additive Sprite, brightens as the ship approaches.
  // map may be null in Node test envs; SpriteMaterial accepts this and
  // falls back to a flat color (still reads as a soft glow at the per-frame
  // opacities we use).
  const haloMat = new SpriteMaterial({
    map: getSharedHaloTexture(),
    color: PICKUP_COLOR[kind],
    transparent: true,
    opacity: PICKUP_HALO_BASE_OPACITY,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const halo = new Sprite(haloMat);
  halo.scale.set(0.6, 0.6, 0.6);
  group.add(halo);

  // Stash refs on the group for the per-frame updater.
  (group as Group & { _body: Mesh; _sonar: Mesh; _halo: Sprite })._body = body;
  (group as Group & { _body: Mesh; _sonar: Mesh; _halo: Sprite })._sonar = sonar;
  (group as Group & { _body: Mesh; _sonar: Mesh; _halo: Sprite })._halo = halo;

  return group;
}

export function disposePickupMesh(group: Group): void {
  group.traverse((child) => {
    if (child instanceof Mesh) {
      // Skip the shared per-kind geometry (it's module-scope, not per-instance).
      const sharedGeoms = Object.values(PICKUP_GEOMETRY_BY_KIND);
      if (!sharedGeoms.includes(child.geometry)) {
        child.geometry.dispose();
      }
      const mat = child.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat instanceof MeshStandardMaterial) mat.dispose();
      else if (mat instanceof MeshBasicMaterial) mat.dispose();
    } else if (child instanceof Sprite) {
      // Sprite's material is per-instance (opacity is unique); dispose it.
      child.material.dispose();
    }
  });
  while (group.children.length > 0) group.remove(group.children[0]);
}
