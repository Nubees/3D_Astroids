import { describe, expect, it } from 'vitest';
import {
  PICKUP_DURATION_SECONDS,
  PICKUP_LIFETIME,
  PICKUP_MUZZLE_SPEED,
  PICKUP_COLLECT_RADIUS,
  PICKUP_MESH_RADIUS,
  PICKUP_COLOR,
  PickupKind,
  applyPickupEffect,
  createPickupMesh,
  createPickupState,
  disposePickupMesh,
  isPickupCollected,
  isPickupExpired,
  maybeDropPickup,
  updatePickup,
} from '../src/pickups';
import { MAGNET_RADIUS } from '../src/scrap';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidSize, AsteroidKind } from '../src/types';

describe('PickupKind — Phase 7 enum', () => {
  it('has exactly 7 kinds in stable order', () => {
    const kinds = Object.values(PickupKind);
    expect(kinds).toEqual([
      'fireRate',       // passive — slot 0
      'shield',         // passive — slot 1
      'spread',         // passive — slot 2
      'bombStrike',     // active — slot 1 key
      'orbitDrones',    // active — slot 2 key
      'homingMissiles', // active — slot 3 key
      'magnetBooster',  // active — slot 4 key (Phase 7f)
    ]);
  });

  it('has the expected passive durations', () => {
    expect(PICKUP_DURATION_SECONDS[PickupKind.FIRE_RATE]).toBe(6.0);
    expect(PICKUP_DURATION_SECONDS[PickupKind.SHIELD]).toBe(8.0);
    expect(PICKUP_DURATION_SECONDS[PickupKind.SPREAD]).toBe(10.0);
  });

  it('has stable constants matching the spec', () => {
    expect(PICKUP_LIFETIME).toBe(10.0);
    expect(PICKUP_MUZZLE_SPEED).toBe(1.5);
    expect(PICKUP_COLLECT_RADIUS).toBe(0.5);
    expect(PICKUP_MESH_RADIUS).toBe(0.18);
  });

  it('has a unique color per kind for HUD/mesh distinction', () => {
    const colors = new Set([
      PICKUP_COLOR[PickupKind.FIRE_RATE],
      PICKUP_COLOR[PickupKind.SHIELD],
      PICKUP_COLOR[PickupKind.SPREAD],
      PICKUP_COLOR[PickupKind.BOMB_STRIKE],
      PICKUP_COLOR[PickupKind.ORBIT_DRONES],
      PICKUP_COLOR[PickupKind.HOMING_MISSILES],
    ]);
    expect(colors.size).toBe(6);
  });
});

describe('PickupState — passive lifecycle', () => {
  it('createPickupState initializes age=0, spin=0, with non-zero velocity', () => {
    const p = createPickupState(PickupKind.FIRE_RATE, { x: 1, y: 2 });
    expect(p.age).toBe(0);
    expect(p.spin).toBe(0);
    expect(p.position).toEqual({ x: 1, y: 2 });
    expect(Math.hypot(p.velocity.x, p.velocity.y)).toBeGreaterThan(0);
  });

  it('updatePickup increments age by deltaTime', () => {
    const p = createPickupState(PickupKind.SHIELD, { x: 0, y: 0 });
    updatePickup(p, { x: 100, y: 100 }, 0.5, MAGNET_RADIUS);
    expect(p.age).toBeCloseTo(0.5, 5);
  });

  it('updatePickup magnetizes (overrides velocity) when ship is within MAGNET_RADIUS', () => {
    const p = createPickupState(PickupKind.SPREAD, { x: 0, y: 0 });
    // Ship within 2.5 (MAGNET_RADIUS). Update with large dt so velocity
    // change is observable.
    updatePickup(p, { x: 1, y: 1 }, 0.1, MAGNET_RADIUS);
    // Velocity should now point toward ship (positive x and y).
    expect(p.velocity.x).toBeGreaterThan(0);
    expect(p.velocity.y).toBeGreaterThan(0);
  });

  it('updatePickup does NOT magnetize when ship is outside MAGNET_RADIUS', () => {
    const p = createPickupState(PickupKind.SPREAD, { x: 0, y: 0 });
    const v0 = { ...p.velocity };
    updatePickup(p, { x: 100, y: 100 }, 0.1, MAGNET_RADIUS);
    expect(p.velocity.x).toBeCloseTo(v0.x, 5);
    expect(p.velocity.y).toBeCloseTo(v0.y, 5);
  });

  it('isPickupExpired returns true at age >= PICKUP_LIFETIME', () => {
    const p = createPickupState(PickupKind.FIRE_RATE, { x: 0, y: 0 });
    expect(isPickupExpired(p)).toBe(false);
    p.age = PICKUP_LIFETIME;
    expect(isPickupExpired(p)).toBe(true);
  });

  it('isPickupCollected returns true within PICKUP_COLLECT_RADIUS, false beyond', () => {
    const p = createPickupState(PickupKind.FIRE_RATE, { x: 0, y: 0 });
    expect(isPickupCollected(p, { x: 0.3, y: 0 })).toBe(true);
    expect(isPickupCollected(p, { x: 5, y: 0 })).toBe(false);
  });
});

describe('maybeDropPickup — drop roll', () => {
  it('returns a PickupKind for any CRYSTAL state (100% rate)', () => {
    // Mock Math.random to control the kind roll.
    const originalRandom = Math.random;
    Math.random = (): number => 0.0; // first kind in the list
    try {
      const state = createAsteroidState(
        AsteroidSize.LARGE,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        false,
        AsteroidKind.CRYSTAL,
      );
      const kind = maybeDropPickup(state);
      expect(kind).not.toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('returns null for IRON size SMALL', () => {
    const state = createAsteroidState(AsteroidSize.SMALL, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(maybeDropPickup(state)).toBeNull();
  });

  it('returns null for IRON size MEDIUM', () => {
    const state = createAsteroidState(AsteroidSize.MEDIUM, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(maybeDropPickup(state)).toBeNull();
  });

  it('returns null for IRON size TINY', () => {
    const state = createAsteroidState(AsteroidSize.TINY, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(maybeDropPickup(state)).toBeNull();
  });

  it('returns a kind for IRON size LARGE when the 10% roll passes', () => {
    // Math.random() < IRON_LARGE_PICKUP_CHANCE (0.10) → drop. Use 0.05.
    const originalRandom = Math.random;
    Math.random = (): number => 0.05;
    try {
      const state = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });
      expect(maybeDropPickup(state)).not.toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });

  it('returns null for IRON size LARGE when the 10% roll misses', () => {
    // Math.random() >= IRON_LARGE_PICKUP_CHANCE (0.10) → miss. Use 0.5.
    const originalRandom = Math.random;
    Math.random = (): number => 0.5;
    try {
      const state = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });
      expect(maybeDropPickup(state)).toBeNull();
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe('applyPickupEffect — passive kinds', () => {
  const ship = { fireCooldown: 0.5 };
  const shield = { energy: 0.3, maxEnergy: 1.0 };

  it('FIRE_RATE returns duration 6.0 and does not mutate shield', () => {
    const result = applyPickupEffect(PickupKind.FIRE_RATE, ship, shield);
    expect(result.kind).toBe(PickupKind.FIRE_RATE);
    if ('remaining' in result) {
      expect(result.remaining).toBe(6.0);
      expect(result.total).toBe(6.0);
    } else {
      throw new Error('expected passive result');
    }
    expect(shield.energy).toBe(0.3); // unchanged
  });

  it('SHIELD adds 0.5 to shield.energy (50% of maxEnergy=1.0)', () => {
    const result = applyPickupEffect(PickupKind.SHIELD, ship, shield);
    expect(shield.energy).toBe(0.8);
    if ('remaining' in result) expect(result.remaining).toBe(8.0);
  });

  it('SHIELD caps at shield.maxEnergy', () => {
    const fullShield = { energy: 0.9, maxEnergy: 1.0 };
    applyPickupEffect(PickupKind.SHIELD, ship, fullShield);
    expect(fullShield.energy).toBe(1.0);
  });

  it('SPREAD returns duration 10.0 and does not mutate shield or ship', () => {
    // Use a fresh shield because the SHIELD tests above mutate the
    // shared one in this describe block. SPREAD must not touch the shield.
    const freshShield = { energy: 0.3, maxEnergy: 1.0 };
    const result = applyPickupEffect(PickupKind.SPREAD, ship, freshShield);
    expect(ship.fireCooldown).toBe(0.5);
    expect(freshShield.energy).toBe(0.3);
    if ('remaining' in result) expect(result.remaining).toBe(10.0);
  });
});

describe('Pickup mesh — Three.js group factory', () => {
  it('createPickupMesh returns a Group with one Mesh child per kind', () => {
    for (const kind of Object.values(PickupKind)) {
      const g = createPickupMesh(kind);
      expect(g.type).toBe('Group');
      expect(g.children.length).toBeGreaterThan(0);
    }
  });

  it('disposePickupMesh clears children without throwing', () => {
    const g = createPickupMesh(PickupKind.FIRE_RATE);
    expect(() => disposePickupMesh(g)).not.toThrow();
    expect(g.children.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Color consistency invariant — user-reported mismatch 2026-06-25
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Lock in the contract that the dropped-pickup body color and the
//           HUD icon color are the SAME value for every kind. Phase 7b
//           shipped with a real mismatch on BOMB_STRIKE (PICKUP_COLOR
//           0xffaa00 vs ACTIVE_KIND_SPECS[].color 0xff8800) — the dropped
//           pickup was yellow-orange but the HUD border was deeper orange.
//           This test fails CI if the two tables drift apart for any kind.
// Setup:    Iterates every PickupKind and asserts the two color sources
//           match. To run, the test file imports ACTIVE_KIND_SPECS (added
//           here) and PICKUP_COLOR (already imported above).
// Issues:   None.
// Fix:      2026-06-25 — added after the user asked "Are the HUD numbers
//           matching the dropped item's color?" and we found BOMB_STRIKE
//           was the one mismatched kind.
// Gotchas:  ACTIVE_KIND_SPECS only has 3 entries (the active kinds);
//           PICKUP_COLOR has all 6. The test iterates ALL 6 kinds and
//           compares against the active kind's spec — for passive kinds
//           the test asserts PICKUP_COLOR is still consistent (the test
//           is symmetric: both tables should agree wherever they both
//           have an entry, AND PICKUP_COLOR should cover every kind).
// ═══════════════════════════════════════════════════════════════════════════
describe('Pickup color consistency — PICKUP_COLOR vs ACTIVE_KIND_SPECS', () => {
  it('every ACTIVE_KIND_SPECS color matches PICKUP_COLOR for the same kind', async () => {
    // Lazy import so the test file's existing import block stays clean and
    // ACTIVE_KIND_SPECS isn't pulled into every test in this file.
    const { ACTIVE_KIND_SPECS } = await import('../src/pickups');
    for (const kind of Object.values(PickupKind)) {
      const pickupColor = PICKUP_COLOR[kind];
      const spec = ACTIVE_KIND_SPECS[kind];
      // ACTIVE_KIND_SPECS covers all 6 kinds (passive entries are
      // no-op markers with color set to match PICKUP_COLOR). Assert
      // the two agree for every kind — no exception types.
      expect(spec.color, `ACTIVE_KIND_SPECS[${kind}].color`).toBe(pickupColor);
    }
  });
});
