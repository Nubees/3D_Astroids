// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Drone Kill Sparks Tests (Phase 7i Sprint 2 Task 6)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: TDD tests for the additive sprite burst spawned when a drone
//          projectile kills an asteroid. Pins the public contract from
//          src/drone-kill-sparks.ts: 12 sprites at the kill position,
//          tier-colored, additive blending with opacity capped at 0.4,
//          radial spread (≥8 unique positions), 0.4s lifetime, returns
//          true on expiry and removes sprites from the scene.
// Setup:   Vitest node environment. Shared lock-on CanvasTexture guard in
//          orbit-drone-vfx.ts returns null in node; Sprite's map ends up
//          null but every other property is still asserted (mirrors
//          tests/orbit-drone-vfx.test.ts).
// Issues:  Pre-Phase 7i drone kills were silent — no visible feedback
//          distinguished them from background scrap collection.
// Fix:     Phase 7i Sprint 2 Task 6. Sprites spread radially with random
//          angle + outward velocity. opacity capped at 0.4 per additive
//          budget. Callers add sprites to scene THEN set visible=true
//          (factory defaults to visible=false so the add-cycle never
//          renders the sprites at z=0 before the position is set).
// Gotchas: The "tick expires after 0.5s" test manually flips
//          sprite.visible=true before invoking tickDroneKillSparks — the
//          factory hides sprites for the caller's scene.add cycle, but
//          the test bypasses scene.add (it operates on a bare Object3D
//          container) so it must enable visibility itself.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expect, it } from 'vitest';
import { AdditiveBlending, Object3D, Sprite } from 'three';
import {
  createDroneKillSparks,
  tickDroneKillSparks,
} from '../src/drone-kill-sparks';

describe('createDroneKillSparks', () => {
  it('returns 12 sprites at position, tier-colored', () => {
    const sparks = createDroneKillSparks({ x: 1, y: 2 }, 3);
    expect(sparks.sprites.length).toBe(12);
    expect(sparks.sprites[0]).toBeInstanceOf(Sprite);
    expect(sparks.tier).toBe(3);
    // First spark position is roughly at (1, 2, 0)
    expect(sparks.sprites[0].position.x).toBeCloseTo(1, 1);
    expect(sparks.sprites[0].position.y).toBeCloseTo(2, 1);
  });

  it('uses additive blending with opacity capped at 0.4', () => {
    const sparks = createDroneKillSparks({ x: 0, y: 0 }, 1);
    const mat = sparks.sprites[0].material as { blending: number; opacity: number };
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.opacity).toBeLessThanOrEqual(0.4);
  });

  it('sprites are spread radially (different positions per spark)', () => {
    const sparks = createDroneKillSparks({ x: 0, y: 0 }, 1);
    const positions = sparks.sprites.map((s) => `${s.position.x.toFixed(2)},${s.position.y.toFixed(2)}`);
    const unique = new Set(positions).size;
    expect(unique).toBeGreaterThanOrEqual(8); // at least 8/12 unique positions
  });
});

describe('tickDroneKillSparks', () => {
  it('returns true and hides sprites after 0.4s lifetime', () => {
    const sparks = createDroneKillSparks({ x: 0, y: 0 }, 1);
    // Make sprites visible (factory defaults to false for scene.add safety)
    for (const s of sparks.sprites) s.visible = true;
    const scene = new Object3D();
    sparks.sprites.forEach((s) => scene.add(s));
    const expired = tickDroneKillSparks(sparks, 0.5, scene);
    expect(expired).toBe(true);
    for (const s of sparks.sprites) {
      expect(s.visible).toBe(false);
    }
  });

  it('returns false before expiry', () => {
    const sparks = createDroneKillSparks({ x: 0, y: 0 }, 1);
    for (const s of sparks.sprites) s.visible = true;
    const scene = new Object3D();
    const expired = tickDroneKillSparks(sparks, 0.2, scene);
    expect(expired).toBe(false);
  });
});
