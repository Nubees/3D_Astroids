import { Vector2 } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Collision Utilities
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure, unit-testable circle/circle and circle/point collision math.
// Setup: Imported by game.ts and asteroid logic.
// Issues: None.
// Fix: Created in src/utils/ per project code-style rules; uses squared distance
//      to avoid Math.sqrt in hot paths.
// Gotchas: Radii must be non-negative; zero-radius points can still collide.
// ═══════════════════════════════════════════════════════════════════════════

export function circlesCollide(a: Vector2, radiusA: number, b: Vector2, radiusB: number): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = radiusA + radiusB;
  return dx * dx + dy * dy <= reach * reach;
}

export function circlePointCollide(circle: Vector2, radius: number, point: Vector2): boolean {
  return circlesCollide(circle, radius, point, 0);
}
