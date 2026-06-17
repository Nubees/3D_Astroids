import { test, expect } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Screenshot Harness
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Verify the game renders by capturing a frame of the running game.
// Setup: Playwright starts the Vite dev server via playwright.config.ts.
// Issues: Phase 0 canvas-only screenshot still works; Phase 2 adds a HUD overlay.
// Fix: Captures both the canvas and the full viewport so the mode label is
//      included in verification.
// Gotchas: Screenshot path uses .test-artifacts/; ensure directory exists.
//          Full-page screenshot includes the HUD div that lives outside canvas.
// ═══════════════════════════════════════════════════════════════════════════

test('Phase 2 screenshot captures the game canvas and HUD', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas#game-canvas');
  await expect(canvas).toBeVisible();
  await expect(page.locator('text=Mode: ARENA')).toBeVisible();
  await canvas.screenshot({ path: '.test-artifacts/phase2-canvas.png' });
  await page.screenshot({ path: '.test-artifacts/phase2-full.png' });
});
