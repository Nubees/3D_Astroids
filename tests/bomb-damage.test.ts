import { describe, it, expect } from 'vitest';
import { BOMB_STRIKE_DAMAGE, HOMING_MISSILES_DAMAGE, CRYSTAL_HEALTH_FOR_TEST } from '../src/pickups';

// CRYSTAL_HEALTH is defined in src/asteroid.ts; we re-export it from pickups
// for this test. (The re-export is added in Step 4.)

describe('BOMB_STRIKE_DAMAGE and HOMING_MISSILES_DAMAGE — Phase 7c one-shot guarantee', () => {
  it('BOMB_STRIKE_DAMAGE is 10 (one-shot any asteroid, including crystal)', () => {
    expect(BOMB_STRIKE_DAMAGE).toBe(10);
  });

  it('HOMING_MISSILES_DAMAGE is 10 (one-shot any asteroid, including crystal)', () => {
    expect(HOMING_MISSILES_DAMAGE).toBe(10);
  });

  it('BOMB_STRIKE_DAMAGE exceeds CRYSTAL_HEALTH so a crystal cannot survive', () => {
    expect(BOMB_STRIKE_DAMAGE).toBeGreaterThanOrEqual(CRYSTAL_HEALTH_FOR_TEST);
  });
});

describe('KillSource split rule — Phase 7c', () => {
  // Split-rule verification is exercised through the destroy path's gate.
  // We test the GATE LOGIC directly by calling a thin helper that mirrors
  // destroyIronAsteroid's source check. This avoids spinning up a full Game
  // instance in the test (which would require a WebGL context).
  //
  // The helper under test: shouldSplitForKillSource(source) — extracted from
  // destroyIronAsteroid's gate and re-exported from src/game-helpers for
  // unit-test access. (The extraction is added in Step 8.)

  it('BOMB source does not call splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('BOMB')).toBe(false);
  });

  it('MISSILE source does not call splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('MISSILE')).toBe(false);
  });

  it('BULLET source calls splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('BULLET')).toBe(true);
  });

  it('WALL source calls splitAsteroid', async () => {
    const { shouldSplitForKillSource } = await import('../src/game-helpers');
    expect(shouldSplitForKillSource('WALL')).toBe(true);
  });
});