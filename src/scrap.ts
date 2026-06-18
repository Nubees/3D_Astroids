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
const MAGNET_RADIUS = 2.5;
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
): void {
  const dx = shipPosition.x - scrap.position.x;
  const dy = shipPosition.y - scrap.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance > MAGNET_RADIUS || distance <= 0.01) return;

  const pullStrength = (MAGNET_RADIUS - distance) / MAGNET_RADIUS;
  const speed = 12.0 * pullStrength;
  scrap.velocity = {
    x: (dx / distance) * speed,
    y: (dy / distance) * speed,
  };
}

export function isScrapCollected(scrap: ScrapState, shipPosition: Vector2): boolean {
  const distance = Math.hypot(
    scrap.position.x - shipPosition.x,
    scrap.position.y - shipPosition.y,
  );
  return distance <= COLLECTION_RADIUS;
}
