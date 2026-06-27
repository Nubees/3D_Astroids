import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7h v4 Emissive Self-Illumination Screenshots
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Verify the v4 fix for "video only covers one side of the
//           asteroid" — the material now has emissive=0xffffff + emissiveIntensity=1
//           so the video-textured sphere self-illuminates. The lit and unlit
//           hemispheres should both show the video color, with PBR shading
//           still adding depth/contour.
//
// Setup:    Boot the game, wait for a natural targeted-asteroid spawn
//           (every 4th spawn is targeted — see game.ts:2424), screenshot
//           the canvas when one is on screen.
//
// Issues:   v3 shipped with emissive=0x000000 and the back hemisphere
//           appeared dark even though every face WAS sampling the texture.
//           User reported "It only covers one side of the asteroid".
//           v4 boosts emissive to fix.
//
// Fix:      2026-06-27 — capture v4 visual confirmation before push.
//
// Gotchas:  The targeted spawn rate is 1 in 4. On a fresh game the
//           spawn cadence takes ~2-4 seconds before the first targeted
//           asteroid appears. We poll up to 20 seconds. We probe the scene
//           for a Group whose first child is a Mesh with a SphereGeometry
//           AND a material whose map is a VideoTexture — this is the
//           exact signature of the v4 createVideoAsteroidMesh output.
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
        material?: { map?: { isVideoTexture?: boolean } };
        geometry?: { type?: string };
        children?: unknown[];
        position?: { x: number; y: number };
        parent?: unknown;
      };
      if (
        n.material?.map?.isVideoTexture === true &&
        n.geometry?.type === 'SphereGeometry' &&
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

test.describe('Phase 7h v4 — emissive boost visual verification', () => {
  test('video-textured asteroid appears (natural 1-in-4 spawn)', async ({ page }) => {
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
      path: '.test-artifacts/phase-7h-v4-targeted-asteroid.png',
    });
    // eslint-disable-next-line no-console
    console.log('v4 visual: targeted asteroid at', position);
  });
});