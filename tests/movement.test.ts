import { describe, expect, it } from 'vitest';
import { ArenaMovementController } from '../src/movement/arena-controller';
import { DriftMovementController } from '../src/movement/drift-controller';
import { InputState } from '../src/input';
import { ShipState } from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Movement Controller Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify arena and drift controllers handle movement, bounds, camera,
//          spawning, and culling independently.
// Setup: Create fresh controllers and synthetic ship/input states.
// Issues: None.
// Fix: Added coverage for the new Phase 2 strategy classes.
// Gotchas: Controllers mutate the provided ShipState. Tests must start with a
//          fresh state to avoid cross-test interference.
// ═══════════════════════════════════════════════════════════════════════════

function createShip(x = 0, y = 0): ShipState {
  return {
    position: { x, y },
    velocity: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
  };
}

const zeroInput: InputState = {
  move: { x: 0, y: 0 },
  aim: { x: 0, y: 0 },
  fire: false,
  deployBreather: false,
};

describe('ArenaMovementController', () => {
  it('applies forward thrust along the aim direction', () => {
    const ship = createShip();
    const input: InputState = {
      move: { x: 0, y: 1 },
      aim: { x: 1, y: 0 },
      fire: false,
      deployBreather: false,
    };
    const controller = new ArenaMovementController();

    controller.apply(ship, input, 1.0);

    expect(ship.velocity.x).toBeCloseTo(7, 2);
    expect(ship.position.x).toBeCloseTo(7, 2);
  });

  it('applies reverse thrust opposite the aim direction', () => {
    const ship = createShip();
    ship.velocity = { x: 4, y: 0 };
    const input: InputState = {
      move: { x: 0, y: -1 },
      aim: { x: 1, y: 0 },
      fire: false,
      deployBreather: false,
    };
    const controller = new ArenaMovementController();

    controller.apply(ship, input, 1.0);

    expect(ship.velocity.x).toBeCloseTo(-7, 2);
  });

  it('strafes perpendicular to the aim direction', () => {
    const ship = createShip();
    const input: InputState = {
      move: { x: 1, y: 0 },
      aim: { x: 1, y: 0 },
      fire: false,
      deployBreather: false,
    };
    const controller = new ArenaMovementController();

    controller.apply(ship, input, 1.0);

    expect(ship.velocity.y).toBeCloseTo(-7, 2);
  });

  it('clamps positions inside arena bounds', () => {
    const controller = new ArenaMovementController();

    expect(controller.clampToBounds({ x: 100, y: 0 }).x).toBe(13);
    expect(controller.clampToBounds({ x: -100, y: 0 }).x).toBe(-13);
    expect(controller.clampToBounds({ x: 0, y: 100 }).y).toBe(9);
    expect(controller.clampToBounds({ x: 0, y: -100 }).y).toBe(-9);
  });

  it('reports positions outside the cull bounds', () => {
    const controller = new ArenaMovementController();

    expect(controller.isOutsideCullBounds({ x: 16, y: 0 })).toBe(true);
    expect(controller.isOutsideCullBounds({ x: 0, y: 12 })).toBe(true);
    expect(controller.isOutsideCullBounds({ x: 0, y: 0 })).toBe(false);
  });

  it('spawns asteroids from any arena edge', () => {
    const controller = new ArenaMovementController();

    const position = controller.getSpawnPosition();
    const halfW = 26 / 2;
    const halfH = 18 / 2;
    const onEdge =
      Math.abs(position.x) >= halfW || Math.abs(position.y) >= halfH;
    expect(onEdge).toBe(true);

    const velocity = controller.getSpawnVelocity();
    expect(Math.hypot(velocity.x, velocity.y)).toBeGreaterThan(0);
  });

  it('coasts with no input instead of stopping', () => {
    const ship = createShip();
    ship.velocity = { x: 4, y: 0 };
    const controller = new ArenaMovementController();

    controller.apply(ship, zeroInput, 0.5);

    expect(ship.velocity.x).toBeCloseTo(4, 5);
    expect(ship.position.x).toBeCloseTo(2, 5);
  });

  it('reflects and dampens velocity at arena bounds', () => {
    const ship = createShip(12.9, 0);
    ship.velocity = { x: 5, y: 0 };
    const controller = new ArenaMovementController();

    controller.apply(ship, zeroInput, 0.1);

    expect(ship.position.x).toBe(13);
    expect(ship.velocity.x).toBeCloseTo(-2.75, 2);
  });
});

describe('DriftMovementController', () => {
  it('pushes the ship forward even with no input', () => {
    const ship = createShip();
    const controller = new DriftMovementController();

    controller.apply(ship, zeroInput, 1.0);

    expect(ship.velocity.x).toBeCloseTo(3.5, 2);
    expect(ship.position.x).toBeCloseTo(3.5, 2);
  });

  it('advances the camera with the forward current', () => {
    const controller = new DriftMovementController();

    controller.update(1.0);

    expect(controller.cameraPosition.x).toBeCloseTo(9.5, 2);
  });

  it('clamps positions relative to the camera', () => {
    const controller = new DriftMovementController();
    controller.cameraPosition = { x: 100, y: 10 };

    const clamped = controller.clampToBounds({ x: 200, y: 0 });
    expect(clamped.x).toBe(112);
    expect(clamped.y).toBe(2);
  });

  it('culls objects far outside the camera view', () => {
    const controller = new DriftMovementController();
    controller.cameraPosition = { x: 100, y: 0 };

    expect(controller.isOutsideCullBounds({ x: 120, y: 0 })).toBe(false);
    expect(controller.isOutsideCullBounds({ x: 200, y: 0 })).toBe(true);
  });

  it('spawns asteroids ahead of the camera', () => {
    const controller = new DriftMovementController();
    controller.cameraPosition = { x: 100, y: 0 };

    const position = controller.getSpawnPosition();
    expect(position.x).toBeGreaterThan(controller.cameraPosition.x + 20);
  });
});
