// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shared Types
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Export shared TypeScript interfaces and enums used across game systems.
// Setup: Imported by src/ modules.
// Issues: Phase 1 types only tracked X/Y. Phase 2 adds a Z axis for drift mode
//          and a movement mode enum so systems can branch cleanly.
// Fix: Added Vector3, MovementMode, and extended input/ship/asteroid/projectile
//      state to carry the new data without changing arena math.
// Gotchas: Keep this file flat; avoid deep barrel exports. Use readonly for
//          value semantics where mutation should be explicit. Collision still
//          happens in X/Y; Z is for rendering, spawning depth, and camera feel.
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface InputState {
  readonly move: Vector2;
  readonly aim: Vector2;
  readonly fire: boolean;
  readonly toggleMode: boolean;
}

export enum MovementMode {
  ARENA = 'arena',
  DRIFT = 'drift',
}

export interface ShipState {
  position: Vector3;
  velocity: Vector2;
  aim: Vector2;
}

export interface Projectile {
  position: Vector3;
  velocity: Vector3;
  lifetime: number;
  readonly maxLifetime: number;
}

export enum AsteroidSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
}

export interface AsteroidState {
  position: Vector3;
  velocity: Vector3;
  size: AsteroidSize;
  health: number;
}
