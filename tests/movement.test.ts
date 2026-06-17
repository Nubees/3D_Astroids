import { describe, expect, it } from 'vitest';
import { MovementMode } from '../src/types';
import {
  ARENA_SHIP_SPEED,
  DEFAULT_ARENA_BOUNDS,
  DEFAULT_DRIFT_CONFIG,
  updateArenaMovement,
  updateDriftMovement,
  updateShipAim,
} from '../src/movement';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Movement Unit Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify pure movement helpers for arena and drift modes.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: Phase 2 extracted movement math from Ship into movement.ts.
// Fix: Added coverage for acceleration, clamping, drift strafe, and aim.
// Gotchas: Arena clamps position to bounds; drift allows free strafe. Both
//          updaters preserve z=0 for the ship.
// ═══════════════════════════════════════════════════════════════════════════

const zeroState = () => ({
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
});

describe('updateArenaMovement', () => {
  it('accelerates toward the input direction', () => {
    const state = zeroState();
    const input = { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, fire: false, toggleMode: false };
    const next = updateArenaMovement(state, input, 0.1, DEFAULT_ARENA_BOUNDS);

    expect(next.velocity.x).toBeGreaterThan(0);
    expect(next.velocity.x).toBeLessThanOrEqual(ARENA_SHIP_SPEED);
  });

  it('clamps position inside the arena bounds', () => {
    const state = {
      position: { x: 100, y: 100, z: 0 },
      velocity: { x: 10, y: 10 },
      aim: { x: 1, y: 0 },
    };
    const input = { move: { x: 1, y: 1 }, aim: { x: 1, y: 0 }, fire: false, toggleMode: false };
    const next = updateArenaMovement(state, input, 0.1, DEFAULT_ARENA_BOUNDS);

    expect(next.position.x).toBeLessThanOrEqual(DEFAULT_ARENA_BOUNDS.halfWidth);
    expect(next.position.y).toBeLessThanOrEqual(DEFAULT_ARENA_BOUNDS.halfHeight);
  });

  it('keeps ship z at 0', () => {
    const state = zeroState();
    const input = { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, fire: false, toggleMode: false };
    const next = updateArenaMovement(state, input, 0.1, DEFAULT_ARENA_BOUNDS);

    expect(next.position.z).toBe(0);
  });
});

describe('updateDriftMovement', () => {
  it('allows free strafe without arena clamping', () => {
    const state = {
      position: { x: 20, y: 20, z: 0 },
      velocity: { x: 0, y: 0 },
      aim: { x: 1, y: 0 },
    };
    const input = { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, fire: false, toggleMode: false };
    const next = updateDriftMovement(state, input, 0.1, DEFAULT_DRIFT_CONFIG);

    expect(next.position.x).toBeGreaterThan(20);
  });

  it('accelerates toward the input direction', () => {
    const state = zeroState();
    const input = { move: { x: 0, y: 1 }, aim: { x: 0, y: 1 }, fire: false, toggleMode: false };
    const next = updateDriftMovement(state, input, 0.1, DEFAULT_DRIFT_CONFIG);

    expect(next.velocity.y).toBeGreaterThan(0);
  });

  it('keeps ship z at 0', () => {
    const state = zeroState();
    const input = { move: { x: 0, y: 1 }, aim: { x: 0, y: 1 }, fire: false, toggleMode: false };
    const next = updateDriftMovement(state, input, 0.1, DEFAULT_DRIFT_CONFIG);

    expect(next.position.z).toBe(0);
  });
});

describe('updateShipAim', () => {
  it('points toward the aim world position', () => {
    const state = zeroState();
    const input = { move: { x: 0, y: 0 }, aim: { x: 10, y: 0 }, fire: false, toggleMode: false };
    const aim = updateShipAim(state, input);

    expect(aim.x).toBeCloseTo(1);
    expect(aim.y).toBeCloseTo(0);
  });

  it('preserves the previous aim when aim input is zero length', () => {
    const state = zeroState();
    const input = { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, toggleMode: false };
    const aim = updateShipAim(state, input);

    expect(aim.x).toBeCloseTo(1);
    expect(aim.y).toBeCloseTo(0);
  });
});
