import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7h v11 IcosahedronGeometry + DoubleSide + Chroma-Key Screenshots
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Verify the v11 visual change — the RED targeted asteroid is now
//           an IcosahedronGeometry(radius, 0) with DoubleSide + chroma-key,
//           at emissiveIntensity 1.5. The lab-winning NO34 stack from the
//           Asteroid Test Lab (/test-lab/asteroid-lab.html) is the
//           production port.
//
// Setup:    Boot the game, wait for a natural targeted-asteroid spawn
//           (every 4th spawn is targeted — see game.ts:2424), screenshot
//           the canvas when one is on screen.
//
// Issues:   v6 used BoxGeometry with cube-cross UV remap so every flat
//           face showed a unique 1/4 × 1/3 portion of the video. The user
//           tested 37 methods in the Asteroid Lab and picked NO34 as the
//           production winner — chunky icosahedron + emissive 1.5 +
//           DoubleSide + chroma-key. v11 swaps BoxGeometry for
//           IcosahedronGeometry (the user explicitly preferred NO30's
//           icosahedron silhouette over NO23's sphere because "30 Is
//           Better as it doesnt dissapear as it rotates and is always
//           viewable" — DoubleSide was the deciding factor).
//
// Fix:      2026-06-28 — capture v11 visual confirmation. Scene-walker
//           now probes for `geometry.type === 'IcosahedronGeometry'` (was
//           'BoxGeometry' in v6 / 'SphereGeometry' in v3-v5) AND
//           `material.emissiveMap.isVideoTexture === true` (v5 channel
//           routing — kept unchanged through v11).
//
// Gotchas:  The targeted spawn rate is 1 in 4. On a fresh game the
//           spawn cadence takes ~2-4 seconds before the first targeted
//           asteroid appears. We poll up to 20 seconds. We probe the scene
//           for a Group whose first child is a Mesh with an
//           IcosahedronGeometry AND a material whose emissiveMap is a
//           VideoTexture — this is the exact signature of the v11
//           createVideoAsteroidMesh output.
// ═══════════════════════════════════════════════════════════════════════════

async function bootGame(page: Page): Promise<void> {
  await page.goto('/');
  const canvas = page.locator('canvas#game-canvas');
  await expect(canvas).toBeVisible();
  await page.waitForSelector('.ship-select-grid', { timeout: 15000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    () => typeof (window as unknown as { __hooks?: unknown }).__hooks !== 'undefined',
    { timeout: 15000 },
  );
  await page.waitForTimeout(200);
}

/**
 * Walk the scene graph and return the world-position of the first
 * Mesh whose material.map is a VideoTexture (i.e. a video-textured
 * asteroid). Returns null if none is currently in the scene.
 */
async function findVideoAsteroidPosition(page: Page): Promise<{ x: number; y: number } | null> {
  return page.evaluate(() => {
    const w = window as unknown as { __game?: { scene: { children: unknown[] } } };
    const game = w.__game;
    if (!game) return null;
    // The Game class holds a private `scene` field; we cast to unknown to
    // walk the tree. The scene root is `game.scene`.
    const scene = (game as unknown as { scene: { children: unknown[] } }).scene;
    if (!scene || !Array.isArray(scene.children)) return null;

    const walk = (node: unknown): { x: number; y: number } | null => {
      if (!node || typeof node !== 'object') return null;
      const n = node as {
        type?: string;
        material?: {
          map?: { isVideoTexture?: boolean };
          emissiveMap?: { isVideoTexture?: boolean };
        };
        geometry?: { type?: string };
        children?: unknown[];
        position?: { x: number; y: number };
        parent?: unknown;
      };
      // Phase 7h v11: IcosahedronGeometry (was BoxGeometry in v6,
      // SphereGeometry in v3-v5). Probing 'BoxGeometry' or
      // 'SphereGeometry' would never match under v11.
      // Phase 7h v5: video lives in emissiveMap, not the diffuse `map` slot.
      // Probing `material.map` would never match (it's null under v5).
      if (
        n.material?.emissiveMap?.isVideoTexture === true &&
        n.geometry?.type === 'IcosahedronGeometry' &&
        n.position
      ) {
        return { x: n.position.x, y: n.position.y };
      }
      if (Array.isArray(n.children)) {
        for (const c of n.children) {
          const found = walk(c);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(scene);
  });
}

test.describe('Phase 7h v11 — IcosahedronGeometry + DoubleSide + chroma-key visual verification', () => {
  test('video-textured icosahedron asteroid appears (natural 1-in-4 spawn)', async ({ page }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Poll for the first video-textured asteroid to appear. Spawn cadence
    // ~1 every ~3 seconds; first one should appear within 15 seconds.
    const position = await expect
      .poll(async () => findVideoAsteroidPosition(page), {
        timeout: 20000,
        intervals: [500, 1000, 1500],
        message: 'No video-textured asteroid appeared within 20s',
      })
      .toBeTruthy();

    // Give the asteroid a moment to settle into the camera view and the
    // video to start playing visible frames.
    await page.waitForTimeout(800);
    await page.locator('canvas#game-canvas').screenshot({
      path: '.test-artifacts/phase-7h-v11-targeted-asteroid.png',
    });
    // eslint-disable-next-line no-console
    console.log('v11 visual: targeted asteroid at', position);
  });
});