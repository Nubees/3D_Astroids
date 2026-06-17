import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Screenshot Harness
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify Phase 0 by capturing a frame of the running game.
// Setup: Playwright starts the Vite dev server via playwright.config.ts.
// Issues: None.
// Fix: Navigates to /, waits for the canvas, and saves a screenshot.
// Gotchas: Screenshot path uses .test-artifacts/; ensure directory exists.
// ═══════════════════════════════════════════════════════════════════════════

test('Phase 0 screenshot captures the game canvas', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas#game-canvas');
  await expect(canvas).toBeVisible();
  await canvas.screenshot({ path: '.test-artifacts/phase0-screenshot.png' });
});
