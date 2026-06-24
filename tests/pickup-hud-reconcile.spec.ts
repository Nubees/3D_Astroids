import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7 Passive Pickup HUD Reconcile Regression Test
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Catch a class of bugs where the passive-pill HUD reconcile throws
//           a TypeError that freezes the game loop. Pre-fix, the inner
//           reconcile loop set `pill.dataset.labelId` on the pill itself but
//           then queried for it as a CHILD selector — the children were never
//           tagged, so querySelector returned null and the next
//           `timeLabel.textContent = ...` threw, freezing the rAF loop on
//           the first passive pickup collection.
// Setup:    Each test boots the game, collects 3 different passive kinds
//           (FIRE_RATE / SHIELD / SPREAD), then calls updateHud — the exact
//           code path the game loop runs every frame. The first test
//           asserts no throw; the second asserts the 3 pills are correctly
//           reconciled; the third stresses same-kind duplicate collection.
// Issues:   None.
// Fix:      2026-06-24 — added after a user-reported freeze on the 3rd
//           passive pickup. See src/game.ts PassivePill interface for the
//           structural fix.
// Gotchas:  The Phase 6b screenshot spec lives next to this one in
//           .playwright-mcp/ — this test follows the same bootGame shape.
//           Use `private method via bracket-access` only inside
//           page.evaluate; do NOT expose the Game class to the test
//           surface — that would couple spec to private internals.
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

test.describe('Phase 7 — passive pickup HUD reconcile', () => {
  test('1/3 — collecting 3 passive pickups does not throw', async ({ page }) => {
    await bootGame(page);

    // The bug repro: collect 3 different passive kinds, simulate the per-frame
    // HUD reconcile that runs every frame, assert no exception escaped.
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(String(err)));

    const result = await page.evaluate(() => {
      const g = (
        window as unknown as {
          __game: {
            applyPickupToShip: (kind: string) => void;
            updateHud: (dt: number) => void;
          };
        }
      ).__game;
      try {
        g.applyPickupToShip('fireRate');
        g.updateHud(0.016);
        g.applyPickupToShip('shield');
        g.updateHud(0.016);
        g.applyPickupToShip('spread');
        g.updateHud(0.016);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e), stack: (e as Error)?.stack };
      }
    });

    expect(result.ok).toBe(true);
    expect(errors).toEqual([]);
  });

  test('2/3 — HUD shows 3 pills with correct labels after collection', async ({ page }) => {
    await bootGame(page);

    const pills = await page.evaluate(() => {
      const g = (
        window as unknown as {
          __game: {
            applyPickupToShip: (kind: string) => void;
            updateHud: (dt: number) => void;
            pickupHudPills: Map<
              string,
              { label: HTMLDivElement; timeLabel: HTMLDivElement; bar: HTMLDivElement }
            >;
          };
        }
      ).__game;
      g.applyPickupToShip('fireRate');
      g.applyPickupToShip('shield');
      g.applyPickupToShip('spread');
      g.updateHud(0.016);
      const entries: Array<{
        kind: string;
        label: string;
        time: string;
        barWidth: string;
      }> = [];
      g.pickupHudPills.forEach((entry, kind) => {
        entries.push({
          kind,
          label: entry.label.textContent ?? '',
          time: entry.timeLabel.textContent ?? '',
          barWidth: entry.bar.style.width,
        });
      });
      return entries;
    });

    expect(pills).toHaveLength(3);
    const byKind = Object.fromEntries(pills.map((p) => [p.kind, p]));
    expect(byKind.fireRate.label).toBe('FIRE');
    expect(byKind.shield.label).toBe('SHIELD');
    expect(byKind.spread.label).toBe('SPREAD');
    // Each pill should show a positive time and a positive bar width.
    for (const pill of pills) {
      const seconds = parseFloat(pill.time);
      expect(seconds).toBeGreaterThan(0);
      const widthPct = parseFloat(pill.barWidth);
      expect(widthPct).toBeGreaterThan(0);
      expect(widthPct).toBeLessThanOrEqual(100);
    }
  });

  test('3/3 — same-kind duplicate collection does not throw or corrupt HUD', async ({ page }) => {
    await bootGame(page);

    const result = await page.evaluate(() => {
      const g = (
        window as unknown as {
          __game: {
            applyPickupToShip: (kind: string) => void;
            updateHud: (dt: number) => void;
            activeEffects: Array<{ kind: string; remaining: number; total: number }>;
          };
        }
      ).__game;
      try {
        // Collect the same kind multiple times — pre-fix this was harmless
        // (push duplicates), but the bug ALSO surfaced if any single collection
        // hit the querySelector null path. Stress-test it here.
        for (let i = 0; i < 3; i++) {
          g.applyPickupToShip('fireRate');
          g.applyPickupToShip('shield');
          g.applyPickupToShip('spread');
          g.updateHud(0.016);
        }
        // Simulate expiration filter (the per-frame tick removes expired
        // effects): keep only spread.
        g.activeEffects = g.activeEffects.filter((e) => e.kind === 'spread');
        g.updateHud(0.016);
        return { ok: true, remainingEffects: g.activeEffects.length };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });

    expect(result.ok).toBe(true);
    expect(result.remainingEffects).toBeGreaterThan(0);
  });
});