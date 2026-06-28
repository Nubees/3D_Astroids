import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7h v6 BoxGeometry + Cube-Cross UV Screenshots
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Verify the v6 visual change — the RED targeted asteroid is now
//           a BoxGeometry with cube-cross UV remap (6 faces, each unique
//           1/4 × 1/3 portion of the video). Material channel routing from
//           v5 is unchanged (`emissiveMap` only, `color: 0x000000`).
//
// Setup:    Boot the game, wait for a natural targeted-asteroid spawn
//           (every 4th spawn is targeted — see game.ts:2424), screenshot
//           the canvas when one is on screen.
//
// Issues:   v3 SphereGeometry had equirectangular UVs but the user
//           reported "not completly wraping the astroid .. maybe we can
//           make it like square shape . and the video is on each flat
//           side". v6 fixes the visual contract: BoxGeometry replaces
//           SphereGeometry and UVs are remapped to a cube-cross layout
//           so every flat face shows a DIFFERENT portion of the video.
//
// Fix:      2026-06-27 — capture v6 visual confirmation. Scene-walker now
//           probes for `geometry.type === 'BoxGeometry'` (was
//           'SphereGeometry' in v3-v5) AND `material.emissiveMap.isVideoTexture
//           === true` (v5 channel routing — kept unchanged).
//
// Gotchas:  The targeted spawn rate is 1 in 4. On a fresh game the
//           spawn cadence takes ~2-4 seconds before the first targeted
//           asteroid appears. We poll up to 20 seconds. We probe the scene
//           for a Group whose first child is a Mesh with a BoxGeometry
//           AND a material whose emissiveMap is a VideoTexture — this is
//           the exact signature of the v6 createVideoAsteroidMesh output.
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
      // Phase 7h v6: BoxGeometry (was SphereGeometry in v3-v5). Probing
      // 'SphereGeometry' would never match under v6.
      // Phase 7h v5: video lives in emissiveMap, not the diffuse `map` slot.
      // Probing `material.map` would never match (it's null under v5).
      if (
        n.material?.emissiveMap?.isVideoTexture === true &&
        n.geometry?.type === 'BoxGeometry' &&
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

test.describe('Phase 7h v6 — BoxGeometry + cube-cross UV visual verification', () => {
  test('video-textured box asteroid appears (natural 1-in-4 spawn)', async ({ page }) => {
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
      path: '.test-artifacts/phase-7h-v6-targeted-asteroid.png',
    });
    // eslint-disable-next-line no-console
    console.log('v6 visual: targeted asteroid at', position);
  });
});