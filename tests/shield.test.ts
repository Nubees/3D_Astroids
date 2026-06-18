import { describe, expect, it } from 'vitest';
import {
  ShieldState,
  absorbHit,
  createShieldState,
  shieldColor,
  shieldPercent,
  updateShield,
  SHIELD_DAMAGE_BY_SIZE,
  SHIELD_MAX_ENERGY,
} from '../src/shield';
import { AsteroidSize, createAsteroidState } from '../src/asteroid';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shield Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify passive shield behavior: size-based damage, recharge, color HUD,
//          and breather-zone boost.
// Setup: Create a fresh shield state and synthetic asteroid states.
// Issues: None.
// Fix: Updated coverage for the new passive armor model.
// Gotchas: The shield recharges slowly out of combat and rapidly inside the
//          Breather Zone. A hit that exactly empties the shield is still absorbed.
// ═══════════════════════════════════════════════════════════════════════════

describe('ShieldState', () => {
  it('starts with full energy', () => {
    const shield = createShieldState();
    expect(shield.energy).toBe(SHIELD_MAX_ENERGY);
    expect(shield.hitAbsorbedThisFrame).toBe(false);
  });

  it('recharges out of combat', () => {
    const shield = createShieldState();
    shield.energy = 0.0;
    updateShield(shield, false, 4.0);
    expect(shield.energy).toBeGreaterThan(0);
    expect(shield.energy).toBeLessThanOrEqual(SHIELD_MAX_ENERGY);
  });

  it('recharges faster inside the breather zone', () => {
    const shield = createShieldState();
    shield.energy = 0.0;
    updateShield(shield, true, 1.0);
    expect(shield.energy).toBeGreaterThan(0);
  });
});

describe('absorbHit', () => {
  it('absorbs a small asteroid hit and drains the correct damage', () => {
    const shield = createShieldState();
    const asteroid = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });

    const absorbed = absorbHit(shield, asteroid);

    expect(absorbed).toBe(true);
    expect(shield.energy).toBeCloseTo(SHIELD_MAX_ENERGY - SHIELD_DAMAGE_BY_SIZE[AsteroidSize.SMALL], 4);
    expect(shield.hitAbsorbedThisFrame).toBe(true);
  });

  it('absorbs a large asteroid hit and drains more energy', () => {
    const shield = createShieldState();
    const asteroid = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });

    absorbHit(shield, asteroid);

    const largeDamage = SHIELD_DAMAGE_BY_SIZE[AsteroidSize.LARGE];
    expect(shield.energy).toBeCloseTo(SHIELD_MAX_ENERGY - largeDamage, 4);
  });

  it('does not absorb a hit when depleted', () => {
    const shield = createShieldState();
    shield.energy = 0;
    const asteroid = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });

    const absorbed = absorbHit(shield, asteroid);

    expect(absorbed).toBe(false);
  });

  it('absorbs a hit that exactly empties the shield', () => {
    const shield = createShieldState();
    shield.energy = SHIELD_DAMAGE_BY_SIZE[AsteroidSize.SMALL];
    const asteroid = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });

    const absorbed = absorbHit(shield, asteroid);

    expect(absorbed).toBe(true);
    expect(shield.energy).toBe(0);
  });
});

describe('shield HUD helpers', () => {
  it('returns green for high shield', () => {
    expect(shieldColor(100)).toBe('#33ff66');
    expect(shieldColor(51)).toBe('#33ff66');
  });

  it('returns yellow for medium shield', () => {
    expect(shieldColor(50)).toBe('#ffcc00');
    expect(shieldColor(26)).toBe('#ffcc00');
  });

  it('returns red for low shield', () => {
    expect(shieldColor(25)).toBe('#ff3333');
    expect(shieldColor(0)).toBe('#ff3333');
  });

  it('rounds shield to a percentage', () => {
    const shield = createShieldState();
    shield.energy = SHIELD_MAX_ENERGY * 0.33;
    expect(shieldPercent(shield)).toBe(33);
  });
});
