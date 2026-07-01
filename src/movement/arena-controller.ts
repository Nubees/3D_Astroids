import { MovementController, MovementMode, ShipState, SpawnConfig, Vector2 } from '../types';
import { InputState } from '../input';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Arena Movement Controller
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Arena movement with space-drift inertia: input applies thrust, the
//          ship coasts when input stops, and it bounces softly off arena walls.
// Setup: Used as the default movement mode.
// Issues: Phase 1 movement snapped velocity toward the input each frame, killing
//         inertia and making the ship feel like a car on rails.
// Fix: Apply input as continuous acceleration, cap top speed, integrate velocity
//      into position, and reflect/damp velocity at arena bounds for a reactive,
//      weightless feel.
// Gotchas: Camera stays at origin; asteroids spawn from any arena edge and drift
//          inward to create unpredictable approach angles. Bound bounce uses
//          damping so the ship does not ping-pong forever.
//
//          Phase 7i-3 refactor — the body of `apply()` is lifted into a free
//          function `applyArenaShipMovement` so the weapon testbed lab can
//          call the SAME movement code without subclassing the controller.
//          The controller's apply() becomes a 1-line delegation. Both
//          production and the lab execute the same control flow.
// ═══════════════════════════════════════════════════════════════════════════

const ARENA_WIDTH = 26;
const ARENA_HEIGHT = 18;
const SHIP_MAX_SPEED = 7;
const SHIP_ACCEL = 12;
const BOUNCE_DAMPING = 0.55;
const SPAWN_MIN_INTERVAL = 3.0;
const SPAWN_MAX_INTERVAL = 5.0;

/**
 * Pure arena-movement step: applies thrust, caps top speed, integrates
 * position, and bounces off arena walls. Lifted from
 * ArenaMovementController.apply() so the weapon testbed lab can call the
 * SAME movement code path as production (Phase 7i-3 refactor).
 *
 * Byte-equivalent to the original method body. Mutates `ship.position`
 * and `ship.velocity` in place (same pattern as the controller's apply).
 */
export function applyArenaShipMovement(
  ship: ShipState,
  input: InputState,
  deltaTime: number,
): void {
  // Apply thrust relative to the ship's facing direction. Up/W is forward
  // thrust along aim, Down/S is reverse thrust, Left/Right strafe sideways.
  // No input means coast on momentum.
  const aim = ship.aim;
  const forward = input.move.y; // +1 forward, -1 reverse
  const strafe = input.move.x;  // +1 right, -1 left from the ship's view
  const accelX = (forward * aim.x + strafe * aim.y) * SHIP_ACCEL;
  const accelY = (forward * aim.y - strafe * aim.x) * SHIP_ACCEL;

  ship.velocity = {
    x: ship.velocity.x + accelX * deltaTime,
    y: ship.velocity.y + accelY * deltaTime,
  };

  // Cap top speed so the ship remains controllable.
  const speed = Math.hypot(ship.velocity.x, ship.velocity.y);
  if (speed > SHIP_MAX_SPEED) {
    const scale = SHIP_MAX_SPEED / speed;
    ship.velocity = {
      x: ship.velocity.x * scale,
      y: ship.velocity.y * scale,
    };
  }

  ship.position = {
    x: ship.position.x + ship.velocity.x * deltaTime,
    y: ship.position.y + ship.velocity.y * deltaTime,
  };

  // Soft bounce at arena bounds.
  const halfW = ARENA_WIDTH / 2;
  const halfH = ARENA_HEIGHT / 2;
  let { x: vx, y: vy } = ship.velocity;
  let { x: px, y: py } = ship.position;
  if (px > halfW) {
    px = halfW;
    vx *= -BOUNCE_DAMPING;
  } else if (px < -halfW) {
    px = -halfW;
    vx *= -BOUNCE_DAMPING;
  }
  if (py > halfH) {
    py = halfH;
    vy *= -BOUNCE_DAMPING;
  } else if (py < -halfH) {
    py = -halfH;
    vy *= -BOUNCE_DAMPING;
  }
  ship.position = { x: px, y: py };
  ship.velocity = { x: vx, y: vy };
}

export class ArenaMovementController implements MovementController {
  readonly mode = MovementMode.ARENA;
  readonly cameraPosition: Vector2 = { x: 0, y: 0 };
  readonly spawnConfig: SpawnConfig = {
    minInterval: SPAWN_MIN_INTERVAL,
    maxInterval: SPAWN_MAX_INTERVAL,
    nextSpawnIn: 0,
  };
  private lastSpawnPosition: Vector2 = { x: 0, y: 10 };

  apply(ship: ShipState, input: InputState, deltaTime: number): void {
    // Phase 7i-3 refactor — the body of apply() is now a free function in
    // this module (applyArenaShipMovement). The lab calls it directly.
    applyArenaShipMovement(ship, input, deltaTime);
  }

  clampToBounds(position: Vector2): Vector2 {
    const halfW = ARENA_WIDTH / 2;
    const halfH = ARENA_HEIGHT / 2;
    return {
      x: Math.max(-halfW, Math.min(halfW, position.x)),
      y: Math.max(-halfH, Math.min(halfH, position.y)),
    };
  }

  getSpawnPosition(): Vector2 {
    const halfW = ARENA_WIDTH / 2;
    const halfH = ARENA_HEIGHT / 2;
    const pad = 1.0;
    const side = Math.floor(Math.random() * 4);

    let position: Vector2;
    switch (side) {
      case 0: // top
        position = { x: (Math.random() - 0.5) * ARENA_WIDTH, y: halfH + pad };
        break;
      case 1: // right
        position = { x: halfW + pad, y: (Math.random() - 0.5) * ARENA_HEIGHT };
        break;
      case 2: // bottom
        position = { x: (Math.random() - 0.5) * ARENA_WIDTH, y: -halfH - pad };
        break;
      default: // left
        position = { x: -halfW - pad, y: (Math.random() - 0.5) * ARENA_HEIGHT };
        break;
    }
    this.lastSpawnPosition = position;
    return position;
  }

  getSpawnVelocity(): Vector2 {
    const speed = 1.0 + Math.random();
    const baseAngle = Math.atan2(-this.lastSpawnPosition.y, -this.lastSpawnPosition.x);
    const spread = 0.5;
    const angle = baseAngle + (Math.random() - 0.5) * spread;
    return {
      x: Math.cos(angle) * speed,
      y: Math.sin(angle) * speed,
    };
  }

  isOutsideCullBounds(position: Vector2): boolean {
    const halfW = ARENA_WIDTH / 2 + 2;
    const halfH = ARENA_HEIGHT / 2 + 2;
    return position.x < -halfW || position.x > halfW || position.y < -halfH || position.y > halfH;
  }

  update(): void {
    // Static camera; nothing to update.
  }
}
