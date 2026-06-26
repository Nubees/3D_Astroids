import { describe, expect, it } from 'vitest';
import { PickupKind, maybeDropPickup } from '../src/pickups';
import { createAsteroidState } from '../src/asteroid';
import { AsteroidKind, AsteroidSize } from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7f Magnet Booster Drop Regression
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Regression test for the 2026-06-26 user-reported bug — magnet
//          booster never dropped because ALL_KINDS in src/pickups.ts was
//          missing the MAGNET_BOOSTER entry. Each test forces a specific
//          Math.random return value and verifies the indexer reaches the
//          7th slot (MAGNET_BOOSTER).
// Setup:   maybeDropPickup rolls Math.random() * ALL_KINDS.length → idx
//          0..6. With length=7 and Math.random=0.999999, idx = 6 (the 7th
//          kind). With length=6, idx would max at 5, never reaching the
//          magnet booster slot — that's the bug shape this guards.
// Issues:  None — pure logic, no Three.js, no time, no DOM.
// Fix:     Phase 7f bugfix 2026-06-26 — single-line add of
//          PickupKind.MAGNET_BOOSTER to ALL_KINDS array.
// Gotchas: Math.random stubbing pattern from tests/pickups.test.ts:113-127.
//          The 7 kinds live at indices 0..6: 0=FIRE_RATE, 1=SHIELD,
//          2=SPREAD, 3=BOMB_STRIKE, 4=ORBIT_DRONES, 5=HOMING_MISSILES,
//          6=MAGNET_BOOSTER. Index 6 requires Math.random in (6/7, 1) —
//          use 0.999 to guarantee a floor of 6. Don't use 0.86 (would
//          give idx=6 when length=7 but idx=5 when length=6, ambiguous).
// ═══════════════════════════════════════════════════════════════════════════

function withRandomStub<T>(value: number, fn: () => T): T {
  const original = Math.random;
  Math.random = (): number => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

describe('maybeDropPickup — Phase 7f MAGNET_BOOSTER coverage', () => {
  it('returns MAGNET_BOOSTER from a crystal when Math.random picks index 6', () => {
    // ALL_KINDS[6] = MAGNET_BOOSTER. Math.random=0.999 → floor(0.999*7)=6.
    withRandomStub(0.999, () => {
      const state = createAsteroidState(
        AsteroidSize.LARGE,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        false,
        AsteroidKind.CRYSTAL,
      );
      const kind = maybeDropPickup(state);
      expect(kind).toBe(PickupKind.MAGNET_BOOSTER);
    });
  });

  it('returns MAGNET_BOOSTER from an iron LARGE when both rolls pass', () => {
    // Iron LARGE path makes TWO Math.random() calls — first for the 10%
    // gate (< 0.10), second for the kind index (idx 6 of 7). Both must
    // land in the success zone.
    let callCount = 0;
    const original = Math.random;
    Math.random = (): number => {
      callCount++;
      return callCount === 1 ? 0.05 : 0.999; // 0.05 < 0.10 → pass; then idx 6
    };
    try {
      const state = createAsteroidState(AsteroidSize.LARGE, { x: 0, y: 0 }, { x: 0, y: 0 });
      expect(maybeDropPickup(state)).toBe(PickupKind.MAGNET_BOOSTER);
    } finally {
      Math.random = original;
    }
  });

  it('returns all 7 kinds including MAGNET_BOOSTER across a full index sweep', () => {
    // Walk idx 0..6 by stepping Math.random = (idx + 0.5) / 7. Each call
    // lands exactly on the target index. This catches ANY future kind
    // addition (idx 7, 8, …) without rewriting the test.
    const original = Math.random;
    try {
      for (let targetIdx = 0; targetIdx < 7; targetIdx++) {
        Math.random = (): number => (targetIdx + 0.5) / 7;
        const state = createAsteroidState(
          AsteroidSize.LARGE,
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          false,
          AsteroidKind.CRYSTAL,
        );
        const kind = maybeDropPickup(state);
        const expected = [
          PickupKind.FIRE_RATE,
          PickupKind.SHIELD,
          PickupKind.SPREAD,
          PickupKind.BOMB_STRIKE,
          PickupKind.ORBIT_DRONES,
          PickupKind.HOMING_MISSILES,
          PickupKind.MAGNET_BOOSTER,
        ][targetIdx];
        expect(kind).toBe(expected);
      }
    } finally {
      Math.random = original;
    }
  });

  it('returns MAGNET_BOOSTER at least once across 1000 crystal drops (statistical)', () => {
    // With ALL_KINDS length=7, the magnet booster occupies 1/7 ≈ 14.3%
    // of crystal drops. Across 1000 rolls, the probability of zero hits
    // is (6/7)^1000 ≈ 5.5e-67 — effectively impossible. This is a smoke
    // test against future array splits or filtering regressions.
    const state = createAsteroidState(
      AsteroidSize.LARGE,
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      false,
      AsteroidKind.CRYSTAL,
    );
    let sawMagnetBooster = false;
    for (let i = 0; i < 1000; i++) {
      if (maybeDropPickup(state) === PickupKind.MAGNET_BOOSTER) {
        sawMagnetBooster = true;
        break;
      }
    }
    expect(sawMagnetBooster).toBe(true);
  });
});