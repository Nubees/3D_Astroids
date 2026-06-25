import type { KillSource } from './pickups';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Game Helpers (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Extract pure-logic gates out of game.ts so they can be unit-tested
//          in the vitest Node env without a WebGL context. The first
//          extraction is the split-on-kill rule, which is a 4-branch switch
//          over a string union — pure logic, no scene/mesh access.
// Setup:   Imported by src/game.ts destroyIronAsteroid. Tests import the
//          helper directly.
// Issues:  Without this helper, the split rule could only be tested through
//          a full Game instance, which requires a WebGL context that vitest
//          does not provide.
// Fix:     Phase 7c. shouldSplitForKillSource is the single source of truth
//          for the split-on-kill rule; both destroyIronAsteroid and the test
//          call the same function.
// Gotchas: This is the FIRST helper extracted. If a second gate is extracted
//          in a future phase, it should join this file (not game.ts).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Return true if a kill of `source` kind should split the iron asteroid into
 * smaller children. Bullet, wall, and shard kills all keep the classic
 * Asteroids split behavior; bomb and missile kills skip splitting so the
 * screen-clearing weapons actually clear the screen.
 */
export function shouldSplitForKillSource(source: KillSource): boolean {
  return source === 'BULLET' || source === 'WALL' || source === 'SHARD';
}
