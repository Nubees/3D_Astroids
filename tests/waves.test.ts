import { describe, expect, it } from 'vitest';
import {
  AsteroidSize,
} from '../src/types';
import {
  POINTS_PER_LARGE,
  POINTS_PER_MEDIUM,
  POINTS_PER_SMALL,
  awardBreak,
  createWaveState,
  getAsteroidBaseSpeed,
  getSpawnInterval,
  updateWave,
} from '../src/waves';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Wave Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify wave escalation, spawn interval compression, speed scaling,
//          and scoring per asteroid size.
// Setup: Create a fresh wave state and mutate it with updateWave / awardBreak.
// Issues: None.
// Fix: Added coverage for the wave pacing and scoring phase.
// Gotchas: Wave number advances based on elapsed time, not kills.
// ═══════════════════════════════════════════════════════════════════════════

describe('WaveState', () => {
  it('starts at wave 1', () => {
    const wave = createWaveState();
    expect(wave.waveNumber).toBe(1);
    expect(wave.score).toBe(0);
    expect(wave.asteroidsDestroyed).toBe(0);
  });

  it('advances wave after enough time', () => {
    const wave = createWaveState();
    updateWave(wave, 25);
    expect(wave.waveNumber).toBe(2);
  });

  it('increases spawn pressure over waves', () => {
    const wave = createWaveState();
    const initial = getSpawnInterval(wave);

    wave.waveNumber = 10;
    const later = getSpawnInterval(wave);

    expect(later).toBeLessThan(initial);
  });

  it('caps spawn interval at a minimum', () => {
    const wave = createWaveState();
    wave.waveNumber = 100;
    expect(getSpawnInterval(wave)).toBe(1.0);
  });

  it('increases asteroid speed over waves', () => {
    const wave = createWaveState();
    const initial = getAsteroidBaseSpeed(wave);

    wave.waveNumber = 10;
    const later = getAsteroidBaseSpeed(wave);

    expect(later).toBeGreaterThan(initial);
  });

  it('awards points by size', () => {
    const wave = createWaveState();

    awardBreak(wave, AsteroidSize.SMALL);
    expect(wave.score).toBe(POINTS_PER_SMALL);

    awardBreak(wave, AsteroidSize.MEDIUM);
    expect(wave.score).toBe(POINTS_PER_SMALL + POINTS_PER_MEDIUM);

    awardBreak(wave, AsteroidSize.LARGE);
    expect(wave.score).toBe(POINTS_PER_SMALL + POINTS_PER_MEDIUM + POINTS_PER_LARGE);
    expect(wave.asteroidsDestroyed).toBe(3);
  });
});
