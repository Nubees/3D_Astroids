import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 6b Fracture Burst Cascade Screenshots
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Capture 9 deterministic screenshots of the crystal cascade.
// Setup:   Each test stages a specific game state via window.__hooks, waits
//          for the next render frame, then saves a screenshot to
//          .test-artifacts/phase6b-*.png. The screenshot spec runs after the
//          game canvas appears.
// Issues:  None.
// Fix:     Added per Phase 6b — exercises healthy, fractured, burst 8/16/24,
//          death explosion, ULTRA CLEAN+CLUTCH combo, SURVIVOR, and telegraph.
// Gotchas:
//  - Each test must await page.waitForTimeout(50) AFTER setting hooks and
//    BEFORE the screenshot, so the next requestAnimationFrame has a chance
//    to run and render the new state.
//  - debugSetGameTime takes a time in SECONDS measured from the fracture
//    moment, so the burst pattern is deterministic regardless of wall-clock.
//  - The crystal must be SPAWNED AND FRACTURED in the same test — separate
//    tests cannot share state because the dev server restarts between them.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Navigate to the game, dismiss the ship-select screen by pressing Enter
 * (selects the first/highlighted card), wait for the game canvas and the
 * __hooks bridge to appear, then return the page so each test can stage
 * its own state.
 */
async function bootGame(page: Page): Promise<void> {
  await page.goto('/');
  const canvas = page.locator('canvas#game-canvas');
  await expect(canvas).toBeVisible();
  // Wait for the ship-select overlay to mount, then press Enter to launch
  // the focused (default = first) ship. The card click handler resolves the
  // selection promise in main.ts, which then boots Game and assigns __hooks.
  await page.waitForSelector('.ship-select-grid', { timeout: 15000 });
  await page.keyboard.press('Enter');
  // Wait for the game to bootstrap and the __hooks bridge to appear.
  await page.waitForFunction(
    () => typeof (window as unknown as { __hooks?: unknown }).__hooks !== 'undefined',
    { timeout: 15000 },
  );
  // One extra frame so the bootstrap render completes.
  await page.waitForTimeout(200);
}

const CRYSTAL_X = 0;
const CRYSTAL_Y = 0;

test.describe('Phase 6b — crystal cascade screenshots', () => {
  test('1/9 — crystal healthy at rest', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number } }).__hooks.spawnCrystalAt(x, y),
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-healthy.png' });
  });

  test('2/9 — fractured pre-burst (crack pulse near max)', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        // Time just after fracture (0.05s into 0.1s first-burst delay).
        h.setGameTime(0.05);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-fractured-pre-burst.png' });
  });

  test('3/9 — 8-shard burst (t=6s in cascade)', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        // BURST_SCHEDULE = [1, 2, 4, 8, 16, 24], FIRST_BURST_DELAY = 0.1, INTERVAL = 2.0
        // Bursts fire at 0.1, 2.1, 4.1, 6.1, 8.1, 10.1
        // For 8-shard burst (index 3), set time so the 8-burst is the "current" frame.
        h.setGameTime(6.1);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-burst8.png' });
  });

  test('4/9 — 16-shard burst (t=8s in cascade)', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        h.setGameTime(8.1);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-burst16.png' });
  });

  test('5/9 — 24-shard saturation burst (t=10s in cascade)', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        h.setGameTime(10.1);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-burst24-cap.png' });
  });

  test('6/9 — death explosion mid-tween', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        // Advance past the saturation cap so the crystal is destroyed.
        // Death tween is 0.4s; we want to capture mid-tween at t=0.2s.
        h.setGameTime(10.3);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(200);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-death-explosion.png' });
  });

  test('7/9 — ULTRA CLEAN + CLUTCH text combo', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        // ULTRA CLEAN fires when crystal dies in <4s. CLUTCH fires when killed
        // within 0.5s of next burst. Set time so a burst is imminent.
        h.setGameTime(2.0); // first burst fired at 0.1, next at 2.1 → CLUTCH window
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-ultra-clean.png' });
  });

  test('8/9 — SURVIVOR text after full cascade', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        // Past the saturation cap so SURVIVOR text fires.
        h.setGameTime(12.0);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(200);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-survivor.png' });
  });

  test('9/9 — burst telegraph ghost lines', async ({ page }) => {
    await bootGame(page);
    await page.evaluate(
      ([x, y]) => {
        const h = (window as unknown as { __hooks: { spawnCrystalAt: (x: number, y: number) => number; fractureCrystal: (id: number) => boolean; setGameTime: (s: number) => void } }).__hooks;
        const id = h.spawnCrystalAt(x, y);
        h.fractureCrystal(id);
        // Telegraph is shown for 0.15s BEFORE a burst. For the 24-shard burst
        // at t=10.1, the telegraph would be at t=9.95. For the 16-shard burst
        // at t=8.1, telegraph at t=7.95. Use 7.95 so the 16-burst ghost lines
        // are visible.
        h.setGameTime(7.95);
      },
      [CRYSTAL_X, CRYSTAL_Y],
    );
    await page.waitForTimeout(100);
    await page.locator('canvas#game-canvas').screenshot({ path: '.test-artifacts/phase6b-crystal-telegraph.png' });
  });
});
