import { describe, expect, it } from 'vitest';
import {
  MAGNET_BOOSTER_DURATION_SECONDS,
  MAX_PENDING_TIER,
  activateMagnetBooster,
  activeRemainingSeconds,
  collectMagnetBooster,
  createMagnetBooster,
  effectiveMagnetMultiplier,
  effectiveMagnetRadius,
  tickMagnetBooster,
} from '../src/magnet-booster';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster Tests (Phase 7f Task 1)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure-logic unit tests for the Magnet Booster state machine. No
//          Three.js imports — everything is deterministic over (state, time).
// Setup: src/magnet-booster.ts exports the state interface + 8 lifecycle
//        helpers + 2 constants. Each `it` block constructs a fresh state via
//        `createMagnetBooster()` and exercises one rule.
// Issues: None at creation.
// Fix: Phase 7f Task 1. Tests cover the four transitions of the state
//      machine (COLLECT-inactive, COLLECT-active, ACTIVATE, TICK), the
//      effectiveMagnetMultiplier/Radius math (so Task 3's `magnetPull` call
//      sites can rely on `game.effectiveMagnetRadius` returning 2.5/5.0/7.5),
//      and the `activeRemainingSeconds` getter consumed by Task 6's HUD
//      countdown.
// Gotchas: Tests assert `state.pendingTier = (state.pendingTier + 1) as
//          1 | 2;` semantics for the active-branch (not Math.min) — the
//          cap check uses `<` not `<=` because MAX_PENDING_TIER is the
//          ceiling, not the legal upper index. tickMagnetBooster returns
//          true on the frame the window crosses — Task 6's HUD uses this
//          signal to trigger the expiry animation.
// ═══════════════════════════════════════════════════════════════════════════

const BASELINE = 2.5; // matches src/scrap.ts:19 (the canonical baseline)

describe('MagnetBooster constants', () => {
  it('exposes MAGNET_BOOSTER_DURATION_SECONDS = 6.0', () => {
    expect(MAGNET_BOOSTER_DURATION_SECONDS).toBe(6.0);
  });

  it('exposes MAX_PENDING_TIER = 2', () => {
    expect(MAX_PENDING_TIER).toBe(2);
  });
});

describe('createMagnetBooster', () => {
  it('returns pendingTier=0, activeUntil=0, activeTier=0', () => {
    const state = createMagnetBooster();
    expect(state.pendingTier).toBe(0);
    expect(state.activeUntil).toBe(0);
    expect(state.activeTier).toBe(0);
  });
});

describe('collectMagnetBooster (inactive)', () => {
  it('bumps pendingTier from 0 to 1 when inactive', () => {
    const state = createMagnetBooster();
    collectMagnetBooster(state, false);
    expect(state.pendingTier).toBe(1);
  });

  it('bumps pendingTier from 1 to 2 when inactive', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    collectMagnetBooster(state, false);
    expect(state.pendingTier).toBe(2);
  });

  it('caps pendingTier at MAX_PENDING_TIER when inactive', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    collectMagnetBooster(state, false);
    expect(state.pendingTier).toBe(2);
  });
});

describe('collectMagnetBooster (active)', () => {
  it('bumps pendingTier but does NOT change activeUntil when active', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 1;
    state.pendingTier = 0;
    collectMagnetBooster(state, true);
    expect(state.pendingTier).toBe(1);
    expect(state.activeUntil).toBe(10.0); // unchanged
    expect(state.activeTier).toBe(1); // unchanged
  });

  it('caps pendingTier at MAX_PENDING_TIER when active', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    state.pendingTier = 2;
    collectMagnetBooster(state, true);
    expect(state.pendingTier).toBe(2);
  });
});

describe('activateMagnetBooster', () => {
  it('succeeds with pendingTier=1, sets activeUntil = gameTime + 6, sets activeTier = 1', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    const ok = activateMagnetBooster(state, 5.0);
    expect(ok).toBe(true);
    expect(state.activeUntil).toBeCloseTo(11.0, 5);
    expect(state.activeTier).toBe(1);
    expect(state.pendingTier).toBe(0); // consumed
  });

  it('succeeds with pendingTier=2, sets activeTier = 2', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    const ok = activateMagnetBooster(state, 5.0);
    expect(ok).toBe(true);
    expect(state.activeTier).toBe(2);
    expect(state.pendingTier).toBe(0);
  });

  it('returns false with pendingTier=0', () => {
    const state = createMagnetBooster();
    expect(activateMagnetBooster(state, 5.0)).toBe(false);
  });

  it('returns false when activeUntil > gameTime (already active)', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    state.activeUntil = 10.0;
    state.activeTier = 1;
    const ok = activateMagnetBooster(state, 5.0); // gameTime < activeUntil
    expect(ok).toBe(false);
    expect(state.activeTier).toBe(1); // unchanged
    expect(state.pendingTier).toBe(1); // preserved
  });
});

describe('tickMagnetBooster', () => {
  it('returns true and clears activeUntil/activeTier when expired', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    const expired = tickMagnetBooster(state, 10.5);
    expect(expired).toBe(true);
    expect(state.activeUntil).toBe(0);
    expect(state.activeTier).toBe(0);
  });

  it('returns false when not expired', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    const expired = tickMagnetBooster(state, 9.5);
    expect(expired).toBe(false);
    expect(state.activeUntil).toBe(10.0);
    expect(state.activeTier).toBe(2);
  });

  it('returns false when activeUntil is 0 (inactive)', () => {
    const state = createMagnetBooster();
    const expired = tickMagnetBooster(state, 100.0);
    expect(expired).toBe(false);
  });
});

describe('effectiveMagnetMultiplier', () => {
  it('returns 1 when both pendingTier and activeTier are 0', () => {
    const state = createMagnetBooster();
    expect(effectiveMagnetMultiplier(state)).toBe(1);
  });

  it('returns 2 when pendingTier=1 and activeTier=0', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    expect(effectiveMagnetMultiplier(state)).toBe(2);
  });

  it('returns 3 when pendingTier=2 and activeTier=0', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    expect(effectiveMagnetMultiplier(state)).toBe(3);
  });

  it('returns 2 when activeTier=1 (active overrides pending)', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 1;
    state.pendingTier = 2; // queued for next activation
    expect(effectiveMagnetMultiplier(state)).toBe(2);
  });

  it('returns 3 when activeTier=2', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    expect(effectiveMagnetMultiplier(state)).toBe(3);
  });
});

describe('effectiveMagnetRadius', () => {
  it('returns baseline when both tiers are 0', () => {
    const state = createMagnetBooster();
    expect(effectiveMagnetRadius(state, BASELINE)).toBe(2.5);
  });

  it('returns 5.0 for tier 1 (2x baseline)', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    expect(effectiveMagnetRadius(state, BASELINE)).toBe(5.0);
  });

  it('returns 7.5 for tier 2 (3x baseline)', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    expect(effectiveMagnetRadius(state, BASELINE)).toBe(7.5);
  });
});

describe('activeRemainingSeconds', () => {
  it('returns 0 when inactive', () => {
    const state = createMagnetBooster();
    expect(activeRemainingSeconds(state, 100.0)).toBe(0);
  });

  it('returns remaining when active', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    expect(activeRemainingSeconds(state, 7.0)).toBeCloseTo(3.0, 5);
  });

  it('returns 0 when active window has expired (just expired)', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    expect(activeRemainingSeconds(state, 10.5)).toBe(0);
  });
});
