import { describe, expect, it } from 'vitest';
import { Ship } from '../src/ship';
import { InputState } from '../src/input';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Ship Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the Ship wrapper handles aiming, firing cooldown, and the
//          new dead/respawn lifecycle.
// Setup: Create fresh Ship instances with synthetic input states.
// Issues: None.
// Fix: Added coverage for the Phase 4 respawn/explosion state machine.
// Gotchas: Ship.update ignores aim input while the ship is dead. canFire is
//          false while dead even if cooldown is zero.
// ═══════════════════════════════════════════════════════════════════════════

function createInput(overrides: Partial<InputState> = {}): InputState {
  return {
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    fire: false,
    deployBreather: false,
    useActive1: false,
    useActive2: false,
    useActive3: false,
    useMagnetBooster: false,
    // Phase 7i-2 (Task 8) — Digit2 charge-up defaults. Tests that don't
    // exercise the charge-up path can leave these at their resting state.
    useActive2PressTime: null,
    useActive2ChargeUpRing: null,
    useActive2ChargeUpTier: null,
    useActive2ChargeUpStart: null,
    useActive2IsChargeUp: false,
    ...overrides,
  };
}

describe('Ship', () => {
  it('starts alive at the given position', () => {
    const ship = new Ship(2, 3);

    expect(ship.isDead).toBe(false);
    expect(ship.state.position).toEqual({ x: 2, y: 3 });
    expect(ship.state.velocity).toEqual({ x: 0, y: 0 });
    expect(ship.state.aim).toEqual({ x: 1, y: 0 });
    expect(ship.canFire()).toBe(true);
  });

  it('updates aim toward the input aim point', () => {
    const ship = new Ship();
    const input = createInput({ aim: { x: 0, y: 5 } });

    ship.update(input, 0.016);

    expect(ship.state.aim.x).toBeCloseTo(0, 5);
    expect(ship.state.aim.y).toBeCloseTo(1, 5);
  });

  it('counts down fire cooldown', () => {
    const ship = new Ship();
    ship.resetCooldown();

    expect(ship.canFire()).toBe(false);

    ship.update(createInput(), 0.2);

    expect(ship.canFire()).toBe(true);
  });

  it('marks the ship dead with a respawn timer', () => {
    const ship = new Ship();
    ship.markDead(1.0);

    expect(ship.isDead).toBe(true);
    expect(ship.respawnTimer).toBe(1.0);
    expect(ship.canFire()).toBe(false);
  });

  it('ignores aim input while dead', () => {
    const ship = new Ship();
    ship.markDead(1.0);
    const input = createInput({ aim: { x: 0, y: 5 } });

    ship.update(input, 0.016);

    expect(ship.state.aim).toEqual({ x: 1, y: 0 });
  });

  it('resets state when marked alive again', () => {
    const ship = new Ship();
    ship.state.velocity = { x: 4, y: -2 };
    ship.state.aim = { x: 0, y: 1 };
    ship.fireCooldown = 0.5;
    ship.markDead(1.0);

    ship.markAlive();

    expect(ship.isDead).toBe(false);
    expect(ship.respawnTimer).toBe(0);
    expect(ship.state.position).toEqual({ x: 0, y: 0 });
    expect(ship.state.velocity).toEqual({ x: 0, y: 0 });
    expect(ship.state.aim).toEqual({ x: 1, y: 0 });
    expect(ship.fireCooldown).toBe(0);
    expect(ship.canFire()).toBe(true);
  });
});

describe('Ship — fireRateMultiplier (Phase 7 pickup)', () => {
  it('with fireRateMultiplier=3, fireCooldown decrements 3x as fast', () => {
    const ship = new Ship();
    ship.fireCooldown = 0.9;
    const input: InputState = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      fire: false,
      deployBreather: false,
      useActive1: false,
      useActive2: false,
      useActive3: false,
      useMagnetBooster: false,
      useActive2PressTime: null,
      useActive2ChargeUpRing: null,
      useActive2ChargeUpTier: null,
      useActive2ChargeUpStart: null,
      useActive2IsChargeUp: false,
    };
    ship.update(input, 0.1, 3);
    expect(ship.fireCooldown).toBeCloseTo(0.6, 5);
  });

  it('with no multiplier (default), behavior is unchanged', () => {
    const ship = new Ship();
    ship.fireCooldown = 0.9;
    const input: InputState = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      fire: false,
      deployBreather: false,
      useActive1: false,
      useActive2: false,
      useActive3: false,
      useMagnetBooster: false,
      useActive2PressTime: null,
      useActive2ChargeUpRing: null,
      useActive2ChargeUpTier: null,
      useActive2ChargeUpStart: null,
      useActive2IsChargeUp: false,
    };
    ship.update(input, 0.1);
    expect(ship.fireCooldown).toBeCloseTo(0.8, 5);
  });
});
