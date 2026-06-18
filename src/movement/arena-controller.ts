import { MovementController, MovementMode, ShipState, SpawnConfig, Vector2 } from '../types';
import { InputState } from '../input';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Arena Movement Controller
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Preserve Phase 1 behavior — ship flies freely inside fixed arena bounds.
// Setup: Used as the default movement mode.
// Issues: None.
// Fix: Extracted from Game.ts so drift mode can reuse the same controller slot.
// Gotchas: Camera stays at origin; asteroids spawn from any arena edge and drift
//          inward to create unpredictable approach angles.
// ═══════════════════════════════════════════════════════════════════════════

const ARENA_WIDTH = 26;
const ARENA_HEIGHT = 18;
const SHIP_SPEED = 7;
const SHIP_ACCEL = 12;
const SPAWN_MIN_INTERVAL = 3.0;
const SPAWN_MAX_INTERVAL = 5.0;

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
    const targetVx = input.move.x * SHIP_SPEED;
    const targetVy = input.move.y * SHIP_SPEED;

    const t = Math.min(1, SHIP_ACCEL * deltaTime);
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
