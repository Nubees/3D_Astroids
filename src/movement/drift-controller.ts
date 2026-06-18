import { MovementController, MovementMode, ShipState, SpawnConfig, Vector2 } from '../types';
import { InputState } from '../input';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Drift Movement Controller
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Implement soft forward drift — world streams backward while the ship
//          strafes within a viewport-relative play area.
// Setup: Camera soft-follows the ship with a forward look-ahead.
// Issues: Phase 1 assumed a static camera; drift requires camera-relative spawn,
//         culling, and bounds.
// Fix: Controller owns camera position; Game queries it for screenToWorld,
//      spawning, and culling.
// Gotchas: Ship is pushed by a base forward current. Lateral bounds are relative
//          to the camera, not the world origin.
// ═══════════════════════════════════════════════════════════════════════════

const DRIFT_FORWARD_SPEED = 3.5;
const SHIP_STRAFE_SPEED = 8.0;
const SHIP_STRAFE_ACCEL = 18.0;
const DRIFT_BOUNDS_HALF_X = 12.0;
const DRIFT_BOUNDS_HALF_Y = 8.0;
const CAMERA_LOOK_AHEAD = 6.0;
const CAMERA_LAG = 0.12;
const SPAWN_MIN_INTERVAL = 2.0;
const SPAWN_MAX_INTERVAL = 3.5;
const SPAWN_MARGIN_X = 24;
const SPAWN_MARGIN_Y = 11;

export class DriftMovementController implements MovementController {
  readonly mode = MovementMode.DRIFT;
  cameraPosition: Vector2 = { x: CAMERA_LOOK_AHEAD, y: 0 };
  readonly spawnConfig: SpawnConfig = {
    minInterval: SPAWN_MIN_INTERVAL,
    maxInterval: SPAWN_MAX_INTERVAL,
    nextSpawnIn: 0,
  };

  private cameraTarget: Vector2 = { x: CAMERA_LOOK_AHEAD, y: 0 };

  apply(ship: ShipState, input: InputState, deltaTime: number): void {
    const targetVx = DRIFT_FORWARD_SPEED + input.move.x * SHIP_STRAFE_SPEED;
    const targetVy = input.move.y * SHIP_STRAFE_SPEED;

    const t = Math.min(1, SHIP_STRAFE_ACCEL * deltaTime);
    ship.velocity = {
      x: ship.velocity.x + (targetVx - ship.velocity.x) * t,
      y: ship.velocity.y + (targetVy - ship.velocity.y) * t,
    };

    ship.position = {
      x: ship.position.x + ship.velocity.x * deltaTime,
      y: ship.position.y + ship.velocity.y * deltaTime,
    };
  }

  clampToBounds(position: Vector2): Vector2 {
    const center = this.cameraPosition;
    return {
      x: Math.max(center.x - DRIFT_BOUNDS_HALF_X, Math.min(center.x + DRIFT_BOUNDS_HALF_X, position.x)),
      y: Math.max(center.y - DRIFT_BOUNDS_HALF_Y, Math.min(center.y + DRIFT_BOUNDS_HALF_Y, position.y)),
    };
  }

  getSpawnPosition(): Vector2 {
    const center = this.cameraPosition;
    const x = center.x + SPAWN_MARGIN_X + Math.random() * 8;
    const y = center.y + (Math.random() - 0.5) * (SPAWN_MARGIN_Y * 2);
    return { x, y };
  }

  getSpawnVelocity(): Vector2 {
    const baseSpeed = 1.5 + Math.random() * 1.5;
    const angle = Math.PI + (Math.random() - 0.5) * 0.4;
    return {
      x: Math.cos(angle) * baseSpeed - DRIFT_FORWARD_SPEED,
      y: Math.sin(angle) * baseSpeed,
    };
  }

  isOutsideCullBounds(position: Vector2): boolean {
    const center = this.cameraPosition;
    return (
      position.x < center.x - SPAWN_MARGIN_X - 4 ||
      position.x > center.x + SPAWN_MARGIN_X + 4 ||
      position.y < center.y - SPAWN_MARGIN_Y - 2 ||
      position.y > center.y + SPAWN_MARGIN_Y + 2
    );
  }

  update(deltaTime: number): void {
    // Camera target stays ahead of the ship's world x position.
    this.cameraTarget = { x: this.cameraPosition.x + CAMERA_LOOK_AHEAD, y: 0 };
    // Soft follow: not used here because the camera is world-locked to ship + lookahead.
    // In a fuller implementation, lag would interpolate toward a tracked ship position.
    this.cameraPosition = {
      x: this.cameraPosition.x + DRIFT_FORWARD_SPEED * deltaTime,
      y: 0,
    };
  }
}
