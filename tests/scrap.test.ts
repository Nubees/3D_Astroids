import { describe, expect, it } from 'vitest';
import {
  createScrap,
  isScrapCollected,
  isScrapExpired,
  magnetPull,
  scrapDropChance,
  updateScrap,
} from '../src/scrap';
import { AsteroidSize } from '../src/types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Scrap Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify scrap lifetime, drift, magnet pull, collection radius, and
//          size-based drop chances.
// Setup: Create scrap states and synthetic ship positions.
// Issues: None.
// Fix: Added coverage for the Phase 4 scrap collection system.
// Gotchas: Scrap drifts downward by default. Magnet pull is proportional to
//          distance and only acts within the magnet radius.
// ═══════════════════════════════════════════════════════════════════════════

describe('Scrap', () => {
  it('has the expected drop chances by size', () => {
    expect(scrapDropChance(AsteroidSize.SMALL)).toBe(0.2);
    expect(scrapDropChance(AsteroidSize.MEDIUM)).toBe(0.4);
    expect(scrapDropChance(AsteroidSize.LARGE)).toBe(0.6);
  });

  it('drifts downward and expires after its lifetime', () => {
    const scrap = createScrap({ x: 0, y: 0 });
    updateScrap(scrap, 8.5);
    expect(scrap.position.y).toBeLessThan(0);
    expect(isScrapExpired(scrap)).toBe(true);
  });

  it('is collected when close to the ship', () => {
    const scrap = createScrap({ x: 0, y: 0 });
    expect(isScrapCollected(scrap, { x: 0.3, y: 0 })).toBe(true);
    expect(isScrapCollected(scrap, { x: 5, y: 0 })).toBe(false);
  });

  it('is pulled toward the ship when inside magnet radius', () => {
    const scrap = createScrap({ x: 0, y: 2 });
    magnetPull(scrap, { x: 0, y: 0 }, 0.016);
    expect(scrap.velocity.y).toBeLessThan(0);
  });

  it('is not pulled when outside magnet radius', () => {
    const scrap = createScrap({ x: 0, y: 10 });
    const originalVy = scrap.velocity.y;
    magnetPull(scrap, { x: 0, y: 0 }, 0.016);
    expect(scrap.velocity.y).toBe(originalVy);
  });
});
