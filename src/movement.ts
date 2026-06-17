import { InputState, MovementMode, ShipState, Vector2, Vector3 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Movement Logic
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure functions that update ship position/velocity for each movement
//          mode. Keeps arena and drift math isolated and testable.
// Setup: Imported by Ship and Game; takes ShipState, InputState, dt, and mode
//        config. Returns updated state rather than mutating the input object.
// Issues: Phase 1 baked arena movement directly into Ship.update. Phase 2 needs
//         two distinct feels (arena strafe vs. drift strafe with streaming world).
// Fix: Extracted updaters into this module. Ship.update now delegates to the
//      appropriate helper based on the current MovementMode.
// Gotchas: Arena clamps velocity to bounds in Game. Drift keeps the ship at z=0
//          and lets the camera/asteroids create the forward-motion illusion.
//          Soft camera lag is handled in Game, not here; this module only moves
//          the ship so the camera has a target to chase.
// ═══════════════════════════════════════════════════════════════════════════

export const ARENA_SHIP_SPEED = 7;
export const ARENA_SHIP_ACCEL = 12;

export interface ArenaBounds {
  readonly halfWidth: number;
  readonly halfHeight: number;
}

export interface DriftConfig {
  readonly shipSpeed: number;
  readonly shipAccel: number;
}

export const DEFAULT_ARENA_BOUNDS: ArenaBounds = {
  halfWidth: 13,
  halfHeight: 9,
};

export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  shipSpeed: 8,
  shipAccel: 14,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function updateArenaMovement(
  state: ShipState,
  input: InputState,
  deltaTime: number,
  bounds: ArenaBounds,
): ShipState {
  const targetVx = input.move.x * ARENA_SHIP_SPEED;
  const targetVy = input.move.y * ARENA_SHIP_SPEED;

  const t = Math.min(1, ARENA_SHIP_ACCEL * deltaTime);
  const velocity: Vector2 = {
    x: state.velocity.x + (targetVx - state.velocity.x) * t,
    y: state.velocity.y + (targetVy - state.velocity.y) * t,
  };

  const rawX = state.position.x + velocity.x * deltaTime;
  const rawY = state.position.y + velocity.y * deltaTime;
  const facing = getMovementFacing(input.move, state.facing);

  return {
    ...state,
    velocity,
    facing,
    position: {
      x: clamp(rawX, -bounds.halfWidth, bounds.halfWidth),
      y: clamp(rawY, -bounds.halfHeight, bounds.halfHeight),
      z: 0,
    },
  };
}

export function updateDriftMovement(
  state: ShipState,
  input: InputState,
  deltaTime: number,
  config: DriftConfig,
): ShipState {
  const targetVx = input.move.x * config.shipSpeed;
  const targetVy = input.move.y * config.shipSpeed;

  const t = Math.min(1, config.shipAccel * deltaTime);
  const velocity: Vector2 = {
    x: state.velocity.x + (targetVx - state.velocity.x) * t,
    y: state.velocity.y + (targetVy - state.velocity.y) * t,
  };
  const facing = getMovementFacing(input.move, state.facing);

  return {
    ...state,
    velocity,
    facing,
    position: {
      x: state.position.x + velocity.x * deltaTime,
      y: state.position.y + velocity.y * deltaTime,
      z: 0,
    },
  };
}

export function updateShipAim(state: ShipState, input: InputState): Vector2 {
  const aimDx = input.aim.x - state.position.x;
  const aimDy = input.aim.y - state.position.y;
  const aimLength = Math.hypot(aimDx, aimDy);
  return aimLength > 0
    ? { x: aimDx / aimLength, y: aimDy / aimLength }
    : state.aim;
}

export function getMovementFacing(move: Vector2, currentFacing: Vector2): Vector2 {
  const length = Math.hypot(move.x, move.y);
  return length > 0.001
    ? { x: move.x / length, y: move.y / length }
    : currentFacing;
}

export function toVector3(v: Vector2, z = 0): Vector3 {
  return { x: v.x, y: v.y, z };
}
