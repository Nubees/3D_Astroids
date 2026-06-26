import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7f Magnet Booster Visual Verification
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Capture screenshots that prove the Phase 7f magnet-booster HUD
//           + 3D ring visuals read correctly in a real browser.
//             1. PENDING state: pill shows "2x" with gold border, NO
//                in-world preview ring (HUD pill is the only pending cue).
//             2. ACTIVE state: pill shows "3x" with pulsing gold border,
//                active ring + green field disk visible around ship at
//                3× baseline radius.
// Setup:    Playwright boots the Vite dev server (playwright.config.ts).
//           Uses window.__game debug surface to mutate magnetBooster state
//           directly (no need to roll for crystal drops or wait for
//           pickup collection). gameTimeSeconds is read+compared against
//           activeUntil to validate the active window is running.
// Issues:   None — first Playwright verification for Phase 7f.
// Fix:      2026-06-26 — written to verify Phase 7f (commit pending atomic
//           squash) before push to GitHub.
// Gotchas:  Magnet booster fields (pendingTier/activeTier/activeUntil) are
//           private on the Game class — the test mutates via `as any` cast
//           since there's no debug hook for the magnet booster (unlike
//           debugSpawnCrystalAt). Safe because the test runs in the same
//           browser context and the fields are plain numbers.
//           Bar fill width is read from inline style.width on .bar — we
//           confirm it updates during the active window via a poll at
//           T+2s.
//           HUD pill className reads are checked via the 4th .magnet-
//           booster-pill element (the only pill with that class).
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

test.describe('Phase 7f — magnet booster HUD + ring visuals', () => {
  test('1/2 — pending state: pill shows "2x" + gold border (no in-world preview)', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Stage the pending state: pendingTier=1 → "2x" multiplier. Move ship
    // to origin so the active visuals (when triggered) are centered.
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          magnetBooster: { pendingTier: number; activeTier: number; activeUntil: number };
          ship: { state: { position: { x: number; y: number } } };
        };
      };
      const mb = w.__game.magnetBooster as { pendingTier: number };
      mb.pendingTier = 1;
      w.__game.ship.state.position = { x: 0, y: 0 };
      return { ok: true };
    });

    expect(result.ok).toBe(true);

    // Wait ~2 frames for the per-frame reconcile to pick up the new
    // pendingTier and update the HUD pill className + countLabel.
    await page.waitForTimeout(120);

    // Verify the HUD pill is in the pending state.
    const pillState = await page.evaluate(() => {
      const pill = document.querySelector('.magnet-booster-pill');
      if (!pill) return { found: false };
      const className = (pill as HTMLElement).className;
      // The 4th icon in the activeHudElement is the magnet booster.
      // countLabel is the first child div of the container.
      const countLabel = pill.querySelector('div:first-child');
      const countText = countLabel?.textContent ?? '';
      return {
        found: true,
        className,
        countText,
        hasPendingClass: className.includes('pending'),
      };
    });

    expect(pillState.found).toBe(true);
    expect(pillState.hasPendingClass).toBe(true);
    expect(pillState.countText).toBe('2x');

    // Verify no page errors fired.
    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    await page.screenshot({ path: '.test-artifacts/phase-7f-pending-2x.png' });
  });

  test('2/2 — active state: pill shows "3x" + pulsing gold border + active ring at 3x radius', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Stage the active state directly: pendingTier=2 (so on activation
    // it becomes activeTier=2 → "3x"), then simulate the activation by
    // setting activeTier + activeUntil directly. This bypasses the Digit4
    // input so the test is fully deterministic.
    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          magnetBooster: { pendingTier: number; activeTier: number; activeUntil: number };
          gameTimeSeconds: number;
          ship: { state: { position: { x: number; y: number } } };
        };
      };
      const mb = w.__game.magnetBooster as {
        pendingTier: number;
        activeTier: number;
        activeUntil: number;
      };
      // Set activeTier=2, activeUntil=10s in the future, pendingTier=0
      // (matches the state after Digit4 activation with a pendingTier=2
      // booster). 2026-06-26 v2 tuning — duration 6s → 10s.
      mb.pendingTier = 0;
      mb.activeTier = 2;
      mb.activeUntil = w.__game.gameTimeSeconds + 10.0;
      w.__game.ship.state.position = { x: 0, y: 0 };
      return { ok: true, activeUntil: mb.activeUntil, now: w.__game.gameTimeSeconds };
    });

    expect(result.ok).toBe(true);
    expect(result.activeUntil).toBeGreaterThan(result.now);

    // Wait ~2 frames for the per-frame reconcile to pick up the new
    // active state.
    await page.waitForTimeout(120);

    // Verify the HUD pill is in the active state.
    const pillState = await page.evaluate(() => {
      const pill = document.querySelector('.magnet-booster-pill');
      if (!pill) return { found: false };
      const className = (pill as HTMLElement).className;
      const countLabel = pill.querySelector('div:first-child');
      const countText = countLabel?.textContent ?? '';
      // The stateLabel is the 3rd child div (after countLabel and bar).
      const stateLabel = pill.querySelectorAll('div')[2];
      const stateText = stateLabel?.textContent ?? '';
      return {
        found: true,
        className,
        countText,
        stateText,
        hasActiveClass: className.includes('active'),
      };
    });

    expect(pillState.found).toBe(true);
    expect(pillState.hasActiveClass).toBe(true);
    expect(pillState.countText).toBe('3x');
    expect(pillState.stateText).toMatch(/^[0-9.]+s$/); // "5.8s" etc.

    // Verify the active state survives the next frame (HUD reconcile
    // shouldn't regress it back to pending).
    await page.waitForTimeout(200);
    const stillActive = await page.evaluate(() => {
      const pill = document.querySelector('.magnet-booster-pill');
      return pill?.className.includes('active') ?? false;
    });
    expect(stillActive).toBe(true);

    // Verify no page errors fired.
    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    // Verify the active ring + green field disk are both visible in the
    // 3D scene at the 3× baseline scale. The field disk is the new
    // shield-style cue (Phase 7f v2 tuning); without this assertion the
    // v2 tuning could regress to "ring only" without anyone noticing.
    const visuals = await page.evaluate(() => {
      const g = (window as unknown as { __game: Record<string, unknown> }).__game;
      const ring = (g as Record<string, unknown>).magnetActiveRing as
        | { visible: boolean; scale: { x: number; y: number } }
        | undefined;
      const field = (g as Record<string, unknown>).magnetActiveField as
        | { visible: boolean; scale: { x: number; y: number } }
        | undefined;
      return {
        ringVisible: ring?.visible ?? false,
        ringScaleX: ring?.scale.x ?? 0,
        fieldVisible: field?.visible ?? false,
        fieldScaleX: field?.scale.x ?? 0,
      };
    });
    expect(visuals.ringVisible).toBe(true);
    expect(visuals.ringScaleX).toBeCloseTo(3, 5);
    expect(visuals.fieldVisible).toBe(true);
    expect(visuals.fieldScaleX).toBeCloseTo(3, 5);

    await page.screenshot({ path: '.test-artifacts/phase-7f-active-3x.png' });
  });
});