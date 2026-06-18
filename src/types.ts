// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shared Types
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Export shared TypeScript interfaces and enums used across game systems.
// Setup: Imported by src/ modules.
// Issues: None.
// Fix: Created minimal types for Phase 0; expanded for Phase 1 input, ship,
//      projectiles, and asteroids. AsteroidSize lives here to avoid circular
//      imports between asteroid.ts and types.ts.
// Gotchas: Keep this file flat; avoid deep barrel exports. Use readonly for
//          value semantics where mutation should be explicit.
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface InputState {
  readonly move: Vector2;
  readonly aim: Vector2;
  readonly fire: boolean;
  readonly shield: boolean;
  readonly deployBreather: boolean;
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
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export interface AsteroidState {
  position: Vector2;
  velocity: Vector2;
  size: AsteroidSize;
  health: number;
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
