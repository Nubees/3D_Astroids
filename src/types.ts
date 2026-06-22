// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shared Types
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Export shared TypeScript interfaces and enums used across game systems.
// Setup: Imported by src/ modules.
// Issues: None.
// Fix: Created minimal types for Phase 0; expanded for Phase 1 input, ship,
//      projectiles, and asteroids. AsteroidSize lives here to avoid circular
//      imports between asteroid.ts and types.ts. Phase 6 added AsteroidKind
//      and ShardState for the Shard Swarm signature enemy. Phase 6b (Fracture
//      Burst Cascade) added FractureBurstState and the BURST_SCHEDULE constants
//      so the cascade cadence is shared between the scheduler, scoring, and
//      tests without a circular import.
// Gotchas: Keep this file flat; avoid deep barrel exports. Use readonly for
//          value semantics where mutation should be explicit. ShardState uses
//          mutable position/velocity (mirrors Projectile) because the shard
//          module mutates them in place each frame.
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}


export interface ScrapState {
  position: Vector2;
  velocity: Vector2;
  lifetime: number;
}

export interface BreatherZoneState {
  active: boolean;
  position: Vector2;
  radius: number;
  durationRemaining: number;
  meter: number;
}

export interface ShipState {
  position: Vector2;
  velocity: Vector2;
  aim: Vector2;
}

export interface Projectile {
  position: Vector2;
  velocity: Vector2;
  lifetime: number;
  readonly maxLifetime: number;
}

export enum AsteroidSize {
  TINY = 'tiny',
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export enum AsteroidKind {
  IRON = 'iron',
  CRYSTAL = 'crystal',
}

export interface AsteroidState {
  position: Vector2;
  velocity: Vector2;
  size: AsteroidSize;
  health: number;
  readonly maxHealth: number;
  isTargeted: boolean;
  readonly kind: AsteroidKind;
  fractured: boolean;
}

export interface ShardState {
  position: Vector2;
  velocity: Vector2;
  angle: number;
  targetAngle: number;
  homingDelay: number;
  lifetime: number;
  readonly maxLifetime: number;
  // Source-of-truth for which crystal spawned this shard. -1 for non-crystal
  // shards (none exist after Phase 6b deletes spawnCrystalShards, but the value
  // is reserved for forward-compat). Used by Game.crystalShardsAbsorbed map to
  // attribute shield absorptions back to the right crystal for the PERFECT
  // bonus gating.
  readonly crystalId: number;
}

export enum MovementMode {
  ARENA = 'arena',
  DRIFT = 'drift',
}

export interface ViewportBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface SpawnConfig {
  readonly minInterval: number;
  readonly maxInterval: number;
  nextSpawnIn: number;
}

import { InputState } from './input';

export interface MovementController {
  readonly mode: MovementMode;
  readonly cameraPosition: Vector2;
  readonly spawnConfig: SpawnConfig;
  apply(ship: ShipState, input: InputState, deltaTime: number): void;
  clampToBounds(position: Vector2): Vector2;
  getSpawnPosition(): Vector2;
  getSpawnVelocity(): Vector2;
  isOutsideCullBounds(position: Vector2): boolean;
  update(deltaTime: number): void;
}

// Forward reference: ShipState is defined above, but MovementController
// references it directly; avoid circular import by using types.ts as the hub.

// ═══════════════════════════════════════════════════════════════════════════
// Phase 6b — Fracture Burst Cascade constants
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Crystal cascading-burst cadence shared between the scheduler, the
//          scoring tier table, and the per-burst VFX in Game.
// Setup: Imported by src/shard.ts (re-export), src/crystal-fx.ts (scheduler),
//        src/game.ts (scoring and spawn logic), and tests.
// Issues: Earlier Phase 6 only had a single 8-shard burst with no escalation.
// Fix: Phase 6b adds the 1→2→4→8→16→24 schedule (user-approved saturation cap
//      at 24) with a fixed 2-second cadence and 0.1s first-burst delay so the
//      FRACTURING! telegraph text is visible before shards leave.
// Gotchas: BURST_SCHEDULE is exported as readonly so callers cannot mutate it.
//          Test fixtures rely on the exact values — do not reorder.
// ═══════════════════════════════════════════════════════════════════════════

export const BURST_SCHEDULE: readonly number[] = [1, 2, 4, 8, 16, 24];
export const BURST_INTERVAL_SECONDS = 2.0;
export const FIRST_BURST_DELAY_SECONDS = 0.1;
export const ULTRA_CLEAN_WINDOW_SECONDS = 4.0;
export const CLUTCH_WINDOW_SECONDS = 0.5;
export const SATURATION_DURATION_SECONDS = 10.0;

/**
 * Per-crystal scheduler for the fracture burst cascade. Owned by Game and
 * keyed by stable asteroid id (NOT array index — fixes 2nd-pass L7 fragility).
 *
 * Fields:
 *  - crystalId: stable asteroid id, used as the map key.
 *  - startedAt: GAME-TIME (not wall-clock) when the crystal first fractured,
 *    used to compute the time-bonus tier (CLEAN/ULTRA/LATE/SURVIVOR) on kill.
 *  - nextBurstAt: game-time at which the next burst in BURST_SCHEDULE fires.
 *    Initialized to startedAt + FIRST_BURST_DELAY_SECONDS.
 *  - burstIndex: 0..BURST_SCHEDULE.length-1; which step of the schedule we are
 *    currently waiting on. After firing, increments to the next step.
 */
export interface FractureBurstState {
  readonly crystalId: number;
  readonly startedAt: number;
  nextBurstAt: number;
  burstIndex: number;
}
