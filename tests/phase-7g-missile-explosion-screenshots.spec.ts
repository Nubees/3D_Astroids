import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7g Missile Explosion Visual Verification
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Capture screenshots that prove the Phase 7g missile-destroyed
//           explosion (50 shards + 80 sparks + 80ms flash) reads correctly
//           in a real browser:
//             1. Direct spawn at origin: peak frame (t≈0) shows shards,
//                sparks, and flash mesh all visible at once. This is the
//                headline screenshot — what players see in the moment
//                after a missile detonates.
//             2. Mid-explosion frame (t≈0.18s): shards still flying,
//                sparks still alive, flash already gone. Verifies the
//                staged-fade reads as a believable explosion instead of a
//                single-frame pop.
//             3. End-of-life frame (t≈0.75s): all particles dead. Verifies
//                no stuck slots leak across detonations (hasActiveParticles
//                must return false).
// Setup:    Playwright boots the Vite dev server (playwright.config.ts).
//           Uses window.__game.missileExplosionFactory to spawn detonations
//           directly — same pattern as phase-7f-screenshots.spec.ts mutating
//           magnetBooster. Real-missile impact path is covered by the unit
//           tests (missile-targeting + missileExplosion); the browser spec
//           just proves the rendering pipeline doesn't drop the explosion.
// Issues:   None at creation.
// Fix:      2026-06-26 — Phase 7g verification before atomic commit.
// Gotchas:  missileExplosionFactory is `private` on the Game class — the
//           test mutates via `as any` cast. Safe because the field holds
//           a plain factory object whose spawn/update/dispose are pure
//           renderer mutations on the shared Three.js scene.
//           We capture screenshots IMMEDIATELY after spawn() so the
//           explosion is at its peak (all 50 shards + 80 sparks + flash
//           mesh visible). At t≈0.18s the flash is gone but shards/sparks
//           are still flying. At t≈0.75s all slots are dead.
//           Math.random is NOT mocked in the browser (it can't be); the
//           shard/spray directions will vary but the explosion shape is
//           consistent (radial fan + biased toward origin velocity).
//           Explosion factories emit relative to world origin if we
//           don't pass a position; we pass (0, 0) so the explosion is
//           centered in the camera view regardless of ship position.
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

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7g — missile-destroyed explosion visual', () => {
  test('1/3 — direct spawn at origin: peak frame shows shards + sparks + flash', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Fire a single explosion at world origin. The factory's spawn() calls
    // the apply* helpers at the end so the very next render frame has the
    // full explosion (50 shards + 80 sparks + flash mesh) visible.
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            spawn: (
              position: { x: number; y: number },
              velocityDir: { x: number; y: number },
            ) => void;
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        spawn: (
          position: { x: number; y: number },
          velocityDir: { x: number; y: number },
        ) => void;
      };
      factory.spawn({ x: 0, y: 0 }, { x: 1, y: 0 });
      return { ok: true };
    });

    expect(result.ok).toBe(true);
    // Wait one frame (≈16ms) so the renderer has flushed, but well under
    // the 100ms flash lifetime so the flash mesh is still visible.
    await page.waitForTimeout(40);

    // Verify the explosion is visible: flash mesh visible, factory has
    // active particles, no page errors.
    const visualCheck = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            hasActiveParticles: () => boolean;
            group: { children: { visible: boolean }[] };
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        hasActiveParticles: () => boolean;
        group: { children: { visible: boolean }[] };
      };
      const flashMesh = factory.group.children[2];
      const errs = (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
      return {
        hasActive: factory.hasActiveParticles(),
        flashVisible: flashMesh.visible,
        errs,
      };
    });

    expect(visualCheck.errs).toEqual([]);
    expect(visualCheck.hasActive).toBe(true);
    expect(visualCheck.flashVisible).toBe(true);

    await page.screenshot({ path: '.test-artifacts/phase-7g-explosion-peak.png' });
  });

  test('2/3 — mid-explosion at t≈180ms: shards + sparks still alive, flash gone', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            spawn: (
              position: { x: number; y: number },
              velocityDir: { x: number; y: number },
            ) => void;
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        spawn: (
          position: { x: number; y: number },
          velocityDir: { x: number; y: number },
        ) => void;
      };
      factory.spawn({ x: 0, y: 0 }, { x: 1, y: 0 });
    });

    // FLASH_DURATION_SECONDS = 0.10 → flash mesh is hidden by T+110ms.
    // SHARD_LIFETIME_SECONDS = 0.60 → shards are still alive at T+180ms.
    // SPARK_LIFETIME_SECONDS = 0.45 → sparks are still alive at T+180ms.
    // Wait 180ms after spawn so the flash is gone but shards/sparks
    // remain. This proves the staged fade reads correctly.
    await page.waitForTimeout(180);

    const visualCheck = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            hasActiveParticles: () => boolean;
            group: { children: { visible: boolean }[] };
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        hasActiveParticles: () => boolean;
        group: { children: { visible: boolean }[] };
      };
      const flashMesh = factory.group.children[2];
      const errs = (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
      return {
        hasActive: factory.hasActiveParticles(),
        flashVisible: flashMesh.visible,
        errs,
      };
    });

    expect(visualCheck.errs).toEqual([]);
    expect(visualCheck.hasActive).toBe(true);
    // Flash should be hidden at T+180ms (its lifetime is 100ms).
    expect(visualCheck.flashVisible).toBe(false);

    await page.screenshot({ path: '.test-artifacts/phase-7g-explosion-mid.png' });
  });

  test('3/3 — end-of-life at t≈750ms: all slots dead, no leaks across detonations', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            spawn: (
              position: { x: number; y: number },
              velocityDir: { x: number; y: number },
            ) => void;
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        spawn: (
          position: { x: number; y: number },
          velocityDir: { x: number; y: number },
        ) => void;
      };
      factory.spawn({ x: 0, y: 0 }, { x: 1, y: 0 });
    });

    // Total explosion lifetime = max(SHARD=0.6, SPARK=0.45, FLASH=0.1) = 0.6s.
    // Wait 750ms so every slot has aged out.
    await page.waitForTimeout(750);

    const visualCheck = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            hasActiveParticles: () => boolean;
            group: { children: { visible: boolean }[] };
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        hasActiveParticles: () => boolean;
        group: { children: { visible: boolean }[] };
      };
      const flashMesh = factory.group.children[2];
      const errs = (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
      return {
        hasActive: factory.hasActiveParticles(),
        flashVisible: flashMesh.visible,
        errs,
      };
    });

    expect(visualCheck.errs).toEqual([]);
    // No live particles → factory slot pool is clean for the next detonation.
    expect(visualCheck.hasActive).toBe(false);
    expect(visualCheck.flashVisible).toBe(false);

    // Re-spawn to confirm the pool still functions after a full lifecycle.
    const respawn = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          missileExplosionFactory: {
            spawn: (
              position: { x: number; y: number },
              velocityDir: { x: number; y: number },
            ) => void;
            hasActiveParticles: () => boolean;
          };
        };
      };
      const factory = w.__game.missileExplosionFactory as {
        spawn: (
          position: { x: number; y: number },
          velocityDir: { x: number; y: number },
        ) => void;
        hasActiveParticles: () => boolean;
      };
      factory.spawn({ x: 0, y: 0 }, { x: 1, y: 0 });
      return { hasActive: factory.hasActiveParticles() };
    });

    expect(respawn.hasActive).toBe(true);
  });
});
