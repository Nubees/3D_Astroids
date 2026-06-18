import { describe, expect, it } from 'vitest';
import {
  ShieldState,
  absorbHit,
  createShieldState,
  updateShield,
  SHIELD_COOLDOWN,
  SHIELD_MAX_ENERGY,
} from '../src/shield';
import { ShipState } from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify shield activation, drain, recharge, cooldown, and hit absorption.
// Setup: Create a fresh shield state and synthetic ship state.
// Issues: None.
// Fix: Added coverage for the Phase 5 shield panic mechanic.
// Gotchas: updateShield depletes energy while active and recharges while inactive.
//          absorbHit forces the shield off and starts cooldown.
// ═══════════════════════════════════════════════════════════════════════════

function createShip(): ShipState {
  return {
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
  };
}

describe('ShieldState', () => {
  it('starts with full energy and no cooldown', () => {
    const shield = createShieldState();
    expect(shield.energy).toBe(SHIELD_MAX_ENERGY);
    expect(shield.active).toBe(false);
    expect(shield.cooldownRemaining).toBe(0);
  });

  it('activates when input is held and energy is available', () => {
    const shield = createShieldState();
    updateShield(shield, true, 0.1);
    expect(shield.active).toBe(true);
    expect(shield.energy).toBeLessThan(SHIELD_MAX_ENERGY);
  });

  it('does not activate during cooldown', () => {
    const shield = createShieldState();
    shield.cooldownRemaining = 1.0;
    updateShield(shield, true, 0.1);
    expect(shield.active).toBe(false);
  });

  it('recharges when inactive', () => {
    const shield = createShieldState();
    shield.energy = 0.0;
    updateShield(shield, false, 4.0);
    expect(shield.energy).toBeGreaterThan(0);
    expect(shield.energy).toBeLessThanOrEqual(SHIELD_MAX_ENERGY);
  });

  it('absorbs a hit and forces cooldown', () => {
    const shield = createShieldState();
    const ship = createShip();
    shield.active = true;

    const absorbed = absorbHit(shield, ship);

    expect(absorbed).toBe(true);
    expect(shield.active).toBe(false);
    expect(shield.energy).toBe(0);
    expect(shield.cooldownRemaining).toBe(SHIELD_COOLDOWN);
  });

  it('does not absorb a hit when inactive', () => {
    const shield = createShieldState();
    const ship = createShip();

    const absorbed = absorbHit(shield, ship);

    expect(absorbed).toBe(false);
  });
});
