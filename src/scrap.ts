import { AsteroidSize, ScrapState, Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Scrap System
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Drop collectible scrap from destroyed asteroids; scrap magnetizes to
//          the ship and fills the Breather Zone meter.
// Setup: Game creates ScrapState instances when asteroids break; updateScrap
//        handles drift, lifetime, and magnet attraction.
// Issues: Without lifetime or a cap, scrap can clutter the arena indefinitely.
// Fix: Scrap has a fixed lifetime and a small collection radius. The magnet pulls
//      scrap once it enters range.
// Gotchas: Scrap should not count as a collision object. It drifts downward so
//          collection becomes a positional mini-game.
// ═══════════════════════════════════════════════════════════════════════════

const SCRAP_LIFETIME = 8.0;
const SCRAP_DRIFT_SPEED = 0.8;
export const MAGNET_RADIUS = 2.5;
const COLLECTION_RADIUS = 0.4;

export function createScrap(position: Vector2): ScrapState {
  return {
    position,
    velocity: { x: 0, y: -SCRAP_DRIFT_SPEED },
    lifetime: SCRAP_LIFETIME,
  };
}

export function updateScrap(scrap: ScrapState, deltaTime: number): void {
  scrap.position = {
    x: scrap.position.x + scrap.velocity.x * deltaTime,
    y: scrap.position.y + scrap.velocity.y * deltaTime,
  };
  scrap.lifetime -= deltaTime;
}

export function isScrapExpired(scrap: ScrapState): boolean {
  return scrap.lifetime <= 0;
}

export function scrapDropChance(size: AsteroidSize): number {
  switch (size) {
    case AsteroidSize.TINY:
      return 0.1;
    case AsteroidSize.SMALL:
      return 0.2;
    case AsteroidSize.MEDIUM:
      return 0.4;
    case AsteroidSize.LARGE:
      return 0.6;
  }
}

export function magnetPull(
  scrap: ScrapState,
  shipPosition: Vector2,
  deltaTime: number,
  effectiveRadius: number,
): void {
  const dx = shipPosition.x - scrap.position.x;
  const dy = shipPosition.y - scrap.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance > effectiveRadius || distance <= 0.01) return;

  const pullStrength = (effectiveRadius - distance) / effectiveRadius;
  // 2026-06-26 tuning pass v2 — +40% faster on top of the v1 2x boost.
  // 12.0 (baseline) → 24.0 (v1) → 33.6 (v2, current). Falloff shape
  // preserved; total impulse over the 10s active window is now ~9.3x
  // baseline (was 6.7x at v1) — 10s + 33.6 makes a single magnet
  // activation actually worth triggering.
  const speed = 33.6 * pullStrength;
  scrap.velocity = {
    x: (dx / distance) * speed,
    y: (dy / distance) * speed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7f magnetPull signature change
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Add a required `effectiveRadius: number` parameter so the Magnet
//          Booster pickup can widen the pull radius. Task 3 unblocks
//          threading the boosted value from src/game.ts.
// Setup:   Game passes `MAGNET_RADIUS` (this file's exported baseline) for
//          now — Task 6 replaces those with `this.effectiveMagnetRadius`.
// Issues:  Pre-Task 3, magnetPull hard-coded `MAGNET_RADIUS` in the gate
//          check and the falloff formula, so the booster had nowhere to
//          plug its boosted value.
// Fix:     Replace `MAGNET_RADIUS` references inside the function body with
//          `effectiveRadius`. The constant stays exported for Game imports
//          and for tests that pin the baseline value (2.5).
// Gotchas: Required param — no default value. TypeScript will reject any
//          call site that forgets the new arg, which is the design intent.
// ═══════════════════════════════════════════════════════════════════════════

export function isScrapCollected(scrap: ScrapState, shipPosition: Vector2): boolean {
  const distance = Math.hypot(
    scrap.position.x - shipPosition.x,
    scrap.position.y - shipPosition.y,
  );
  return distance <= COLLECTION_RADIUS;
}
