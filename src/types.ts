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
