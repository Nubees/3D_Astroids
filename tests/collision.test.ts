import { describe, expect, it } from 'vitest';
import { circlesCollide, circlePointCollide } from '../src/utils/collision';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Collision Unit Tests
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the pure collision math used by the game loop.
// Setup: Vitest loads this file via vitest.config.ts.
// Issues: None.
// Fix: Added tests for overlap, touching, far apart, and zero-radius cases.
// Gotchas: Uses squared distance; no square-root needed.
// ═══════════════════════════════════════════════════════════════════════════

describe('circlesCollide', () => {
  it('returns true when circles overlap', () => {
    expect(circlesCollide({ x: 0, y: 0 }, 1, { x: 1, y: 0 }, 1)).toBe(true);
  });

  it('returns true when circles just touch', () => {
    expect(circlesCollide({ x: 0, y: 0 }, 1, { x: 2, y: 0 }, 1)).toBe(true);
  });

  it('returns false when circles are far apart', () => {
    expect(circlesCollide({ x: 0, y: 0 }, 1, { x: 5, y: 0 }, 1)).toBe(false);
  });

  it('returns true for a point inside a circle', () => {
    expect(circlePointCollide({ x: 0, y: 0 }, 1, { x: 0.5, y: 0 })).toBe(true);
  });

  it('returns false for a point outside a circle', () => {
    expect(circlePointCollide({ x: 0, y: 0 }, 1, { x: 2, y: 0 })).toBe(false);
  });
});
