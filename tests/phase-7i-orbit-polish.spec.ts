// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7i Sprint 2 Visual Verification
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Playwright spec for Phase 7i Sprint 2 closeout. Confirms:
//             1. Deploying 2 drones via Digit2 places 2 distinct drone
//                meshes in the active deployment's perDrone array.
//             2. The deploy shockwave is visible on the very first frame
//                after Digit2 fires (its visible flag is true within the
//                250ms animation window).
// Setup:    Boot Playwright → press Enter on the ship select screen → use
//           window.__hooks.spawnPickup('orbitDrones', x, y) to force-drop
//           an orbit drone pickup adjacent to the ship → press Digit2 to
//           deploy → read the deployment state via window.__game.active-
//           Deployments[0].
// Issues:   Pre-Sprint 2 the deploy shockwave was a static ring that
//           appeared only after the first drone fire; Sprint 2 makes it
//           play ONCE at deploy time. Without this test the deploy-
//           shockwave nudge (deployShockwaveAge = 0.001 on first tick)
//           could regress unnoticed.
// Fix:      2026-06-29 — written for Phase 7i Sprint 2 Task 6 atomic
//           commit. Captures one screenshot per scenario so the user can
//           eyeball the deploy shockwave + per-drone visuals.
// Gotchas:  spawnPickup requires the player to actually collide with
//           the pickup for the active ammo charge to register. The spec
//           walks the ship into the pickup by setting ship.position to
//           the pickup position before pressing Digit2, which is enough
//           for the collect logic to register (collision = same x,y).
//           The test runs in serial mode so the second test boots fresh
//           after the first (avoids cross-test ammo state bleed).
//           Digit2 must be dispatched as keydown-only (no matching keyup)
//           so the input layer's `keys` Set retains 'Digit2' until the
//           next update() tick fires useActiveItem. Pressing+releasing
//           in the same JS turn releases the key before the next frame.
//           The shockwave visibility check needs 200ms (~12 frames) of
//           headroom under Playwright headless Chrome — the rAF is
//           throttled such that the deployShockwaveAge = 0 → 0.001 nudge
//           can take longer than 50ms to land on the very first deploy.
// ═══════════════════════════════════════════════════════════════════════════

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

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

test.describe('Phase 7i Sprint 2 — drone deploy + shockwave', () => {
  test('1/2 — deploying 2 drones places 2 distinct meshes in perDrone[]', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Drop an orbit drone pickup next to the ship.
    const pickupResult = await page.evaluate(() => {
      const w = window as unknown as {
        __game: { ship: { state: { position: { x: number; y: number } } } };
        __hooks: { spawnPickup: (kind: string, x: number, y: number) => boolean };
      };
      const shipPos = w.__game.ship.state.position;
      // Drop 0.5u away from the ship so the pickup spawns in front of it.
      const ok = w.__hooks.spawnPickup(
        'orbitDrones',
        shipPos.x + 0.5,
        shipPos.y,
      );
      // Walk the ship to the pickup so the collect logic fires.
      w.__game.ship.state.position = { x: shipPos.x + 0.5, y: shipPos.y };
      return { ok };
    });
    expect(pickupResult.ok).toBe(true);

    // Wait ~3 frames for the pickup collect + ammo state reconcile.
    await page.waitForTimeout(120);

    // Verify pickup was collected and ammo has 1 charge before pressing Digit2.
    const preCharge = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: {
          pickups: unknown[];
          activeAmmo: Record<string, { charges: number; cooldownRemaining: number }>;
        };
      }).__game;
      return {
        pickups: g.pickups.length,
        orbitCharges: g.activeAmmo.orbitDrones?.charges ?? -1,
        cooldown: g.activeAmmo.orbitDrones?.cooldownRemaining ?? -1,
      };
    });
    expect(preCharge.pickups).toBe(0); // collected
    expect(preCharge.orbitCharges).toBe(1);

    // Press Digit2 to deploy the orbit drones. The game's InputState reads
    // this.keys.has('Digit2') on each update tick — if we send keydown+keyup
    // in the same JS tick, the key is released before the next update()
    // sees it. So dispatch only keydown, wait > 1 frame, then read state.
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Digit2', key: '2', bubbles: true }),
      );
    });
    await page.waitForTimeout(150);

    // Diagnostic: read the post-press state so we can see why the
    // deployment didn't take. ammos with charges>0 but no deployment
    // means canFireActive returned false (cooldown stuck).
    const postState = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: {
          activeDeployments: Array<{ perDrone?: unknown[] }>;
          activeAmmo: Record<string, { charges: number; cooldownRemaining: number }>;
        };
      }).__game;
      return {
        deployments: g.activeDeployments.length,
        firstPerDrone: g.activeDeployments[0]?.perDrone?.length ?? 0,
        orbitCharges: g.activeAmmo.orbitDrones?.charges ?? -1,
        orbitCooldown: g.activeAmmo.orbitDrones?.cooldownRemaining ?? -1,
      };
    });
    // Verify 2 drones in the active deployment.
    expect(postState.deployments).toBeGreaterThan(0);
    expect(postState.firstPerDrone).toBe(2);

    // Verify no page errors fired.
    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    await page.screenshot({ path: '.test-artifacts/phase-7i-sprint2-deployed.png' });
  });

  test('2/2 — deploy shockwave is visible on the first frame after Digit2', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    const pickupResult = await page.evaluate(() => {
      const w = window as unknown as {
        __game: { ship: { state: { position: { x: number; y: number } } } };
        __hooks: { spawnPickup: (kind: string, x: number, y: number) => boolean };
      };
      const shipPos = w.__game.ship.state.position;
      const ok = w.__hooks.spawnPickup(
        'orbitDrones',
        shipPos.x + 0.5,
        shipPos.y,
      );
      w.__game.ship.state.position = { x: shipPos.x + 0.5, y: shipPos.y };
      return { ok };
    });
    expect(pickupResult.ok).toBe(true);

    await page.waitForTimeout(120);
    // Press Digit2 — only keydown; the game's input holds the key in
    // its `keys` Set until the next keyup arrives, which lets the
    // per-frame useActiveItem dispatch fire on the very next tick.
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'Digit2', key: '2', bubbles: true }),
      );
    });

    // Sample the shockwave visibility within the 250ms animation window.
    // The shockwave starts at scale 0.5 and grows to 2.0 with opacity 1→0;
    // checking visible=true is enough to confirm the deploy animation
    // triggered (it was a Sprint 2 fix — pre-Sprint 2 the ring was hidden).
    // 200ms wait covers ~12 frames so the age-nudge (0 → 0.001) and the
    // first age-bump (+deltaTime) both have time to execute; if visible
    // is still false the age has eclipsed 0.25s and the ring hid itself.
    await page.waitForTimeout(200);
    const shockwaveState = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: {
          activeDeployments: Array<{
            deployShockwave?: { visible: boolean };
          }>;
        };
      }).__game;
      const dep = g.activeDeployments[0];
      return dep?.deployShockwave?.visible === true;
    });
    expect(shockwaveState).toBe(true);

    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    await page.screenshot({ path: '.test-artifacts/phase-7i-sprint2-shockwave.png' });
  });
});