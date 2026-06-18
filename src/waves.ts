import { AsteroidSize } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Wave Pacing & Scoring
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Drive escalating difficulty and reward the player for breaking rocks.
// Setup: Game owns the WaveState and queries it for spawn rate/asteroid speed.
// Issues: Without pacing, the game spawns asteroids at a flat rate forever.
// Fix: Waves increase spawn frequency and asteroid speed over time. Score is
//      awarded per break, scaled by asteroid size.
// Gotchas: Score should reward full clears (large → medium → small). Wave index
//          increases based on elapsed time, not kill count, to keep pressure up.
// ═══════════════════════════════════════════════════════════════════════════

export const POINTS_PER_SMALL = 100;
export const POINTS_PER_MEDIUM = 250;
export const POINTS_PER_LARGE = 500;

export interface WaveState {
  waveNumber: number;
  elapsedTime: number;
  score: number;
  asteroidsDestroyed: number;
  nextWaveIn: number;
}

export function createWaveState(): WaveState {
  return {
    waveNumber: 1,
    elapsedTime: 0,
    score: 0,
    asteroidsDestroyed: 0,
    nextWaveIn: WAVE_DURATION,
  };
}

const WAVE_DURATION = 20.0;
const BASE_SPAWN_INTERVAL = 4.0;
const MIN_SPAWN_INTERVAL = 1.0;
const BASE_SPEED = 1.0;
const MAX_SPEED = 3.0;

export function updateWave(wave: WaveState, deltaTime: number): void {
  wave.elapsedTime += deltaTime;
  wave.nextWaveIn -= deltaTime;
  if (wave.nextWaveIn <= 0) {
    wave.waveNumber += 1;
    wave.nextWaveIn = WAVE_DURATION;
  }
}

export function getSpawnInterval(wave: WaveState): number {
  const pressure = Math.min(wave.waveNumber * 0.15, 1.0);
  return BASE_SPAWN_INTERVAL - (BASE_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL) * pressure;
}

export function getAsteroidBaseSpeed(wave: WaveState): number {
  const pressure = Math.min(wave.waveNumber * 0.12, 1.0);
  return BASE_SPEED + (MAX_SPEED - BASE_SPEED) * pressure;
}

export function awardBreak(wave: WaveState, size: AsteroidSize): void {
  wave.asteroidsDestroyed += 1;
  switch (size) {
    case AsteroidSize.SMALL:
      wave.score += POINTS_PER_SMALL;
      break;
    case AsteroidSize.MEDIUM:
      wave.score += POINTS_PER_MEDIUM;
      break;
    case AsteroidSize.LARGE:
      wave.score += POINTS_PER_LARGE;
      break;
  }
}
