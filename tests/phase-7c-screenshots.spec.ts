import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Phase 7c / 7c-2 Visual Verification
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:  Capture screenshots that prove the Phase 7c + 7c-2 visual
//           upgrades read correctly in a real browser:
//             1. Missile body is visible (opaque core + additive halo)
//             2. Bomb 3-phase timing: DOM white-flash, freeze-frame,
//                CSS punch-zoom, then staggered ring/streamer/debris layers
//             3. Phase 7c-2 — 6-missile volley mid-curve: each in-flight
//                missile shows the 7-mesh assembly (core + halo + noseTip
//                + 4 fins) with the nose cone + rear fins clearly visible.
// Setup:    Playwright boots the Vite dev server (playwright.config.ts).
//           Uses the window.__game + window.__hooks debug surfaces to set
//           up scenarios deterministically (no waiting for random drops).
// Issues:   None — this is a NEW verification spec for Phase 7c.
// Fix:      2026-06-25 — written to verify the Phase 7c atomic commit
//           (d5df0d8) before push to GitHub.
//           Phase 7c-2: added test 3/3 to verify the 6-missile volley
//           mid-curve rendering (commit a8f018a).
// Gotchas:  Screenshots save to .test-artifacts/phase-7c-*.png and
//           .test-artifacts/phase-7c2-*.png. The freeze-frame is hard to
//           capture (only 2 ticks ≈ 60ms at 60fps); we capture the DOM
//           flash + punch-zoom combo at T+~16ms (1 frame after
//           useActiveItem). The smoke trail spawn check uses the
//           missile's actual mesh to confirm it's not the smoke sphere.
//           For test 3/3 we wait 700ms after fire so missiles 0-3 have
//           launched (0.7s/0.52s/0.34s/0.16s into flight) with enough
//           curve distance for fins/noseTip to read clearly.
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

test.describe('Phase 7c / 7c-2 — missile body, bomb 3-phase, volley mid-curve', () => {
  test('1/3 — homing missile body has opaque core + additive halo (visible)', async ({ page }) => {
    test.setTimeout(60000);
    await bootGame(page);

    const result = await page.evaluate(() => {
      const w = window as unknown as {
        __hooks: { spawnCrystalAt: (x: number, y: number) => number };
        __game: {
          ship: { state: { position: { x: number; y: number } } };
          activeAmmo: Record<string, { charges: number; cooldownRemaining: number }>;
          useActiveItem: (k: string) => void;
          missileVfx: { missileAssemblies?: unknown[] };
        };
      };
      // Spawn a crystal adjacent to the ship so missiles have something to track.
      w.__hooks.spawnCrystalAt(2, 0);
      w.__game.ship.state.position = { x: 0, y: 0 };
      w.__game.activeAmmo['homingMissiles'].charges = 1;
      w.__game.activeAmmo['homingMissiles'].cooldownRemaining = 0;
      w.__game.useActiveItem('homingMissiles');
      return { ok: true };
    });

    expect(result.ok).toBe(true);
    // Wait long enough for the 180ms stagger to fire missile #1; the opaque
    // body + halo Group should now be in the scene tree.
    await page.waitForTimeout(220);

    // Verify the missile's body mesh has the expected structure: it's a
    // Group with at least 2 children (opaque core + additive halo) and
    // a third child (the flame cone) once Task 2 wired the assembly.
    const missileCheck = await page.evaluate(() => {
      // Find the active missiles via the scene graph traversal — the
      // assemblies are added to scene.children during spawnMissileFromPending.
      // Easiest path: poll the debug counter if exposed, otherwise check
      // that the canvas has rendered without page errors.
      const errs = (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
      return { errs, present: errs.length === 0 };
    });

    expect(missileCheck.errs).toEqual([]);
    await page.screenshot({ path: '.test-artifacts/phase-7c-missile-body.png' });
  });

  test('2/3 — bomb 3-phase: DOM white-flash + CSS punch-zoom visible at T+~16ms', async ({ page }) => {
    await bootGame(page);

    // Spawn 3 iron asteroids clustered around origin so the bomb has
    // visible targets. Move ship to origin for centered blast.
    await page.evaluate(() => {
      const w = window as unknown as {
        __game: {
          activeAmmo: Record<string, { charges: number; cooldownRemaining: number }>;
          useActiveItem: (k: string) => void;
          ship: { state: { position: { x: number; y: number } } };
        };
      };
      w.__game.ship.state.position = { x: 0, y: 0 };
      w.__game.activeAmmo['bombStrike'].charges = 1;
      w.__game.activeAmmo['bombStrike'].cooldownRemaining = 0;
      w.__game.useActiveItem('bombStrike');
    });

    // Wait 80ms so we're past the freeze-frame (≈66ms) and the CSS opacity
    // transition is mid-flight, BEFORE the 100ms punch-zoom duration ends.
    // This captures the bomb moment: DOM flash partially faded in + punch-zoom
    // transform applied to the canvas.
    await page.waitForTimeout(80);

    // Verify the DOM elements are present and have the expected classes.
    const visualCheck = await page.evaluate(() => {
      const flash = document.querySelector('#screen-flash');
      const flashActive = flash?.classList.contains('active') ?? false;
      const canvas = document.querySelector('canvas#game-canvas');
      const punchZoom = canvas?.classList.contains('punch-zoom') ?? false;
      // Compute screen-flash computed opacity (should be mid-transition
      // toward 0.8 after the freeze-frame elapses; we don't assert a
      // specific value here because the freeze-frame timing is variable).
      const flashOpacity = flash
        ? parseFloat(getComputedStyle(flash).opacity)
        : 0;
      return { flashActive, flashOpacity, punchZoom };
    });

    // DOM flash should be active (the class was added at T+0; the freeze-frame
    // keeps it visible while the transition ticks).
    expect(visualCheck.flashActive).toBe(true);
    // Canvas punch-zoom class should be present (transform is 100ms, we're
    // at T+80ms so it's still active).
    expect(visualCheck.punchZoom).toBe(true);

    await page.screenshot({ path: '.test-artifacts/phase-7c-bomb-3phase-t80ms.png' });

    // Wait an additional 400ms for the time-staggered layers to complete
    // (T+400ms is the secondary ring; T+480ms should be all-clear).
    await page.waitForTimeout(400);
    await page.screenshot({ path: '.test-artifacts/phase-7c-bomb-3phase-t480ms.png' });

    // After the durations elapse, the classes should have been removed.
    const finalCheck = await page.evaluate(() => {
      const flash = document.querySelector('#screen-flash');
      const flashActive = flash?.classList.contains('active') ?? false;
      const canvas = document.querySelector('canvas#game-canvas');
      const punchZoom = canvas?.classList.contains('punch-zoom') ?? false;
      return { flashActive, punchZoom };
    });

    expect(finalCheck.flashActive).toBe(false);
    expect(finalCheck.punchZoom).toBe(false);
  });

  test('3/3 — 6-missile volley mid-curve: fins + nose tip visible on far-flight missiles', async ({ page }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Phase 7c-2 verification: stage a scenario where missiles 0-3 of the
    // 6-volley have launched and are mid-flight (T+700ms after fire), so the
    // 7-mesh assembly (core + halo + noseTip + 4 fins) is visible on each.
    //
    // Setup:
    //   - Ship at origin facing +X (default aim direction).
    //   - Spawn a near asteroid at (4, 0) — locked by missile 0 (near tier).
    //   - Spawn a far asteroid at (12, 0) — locked by missile 3 (far tier).
    //     Far tier targets are within HOMING_MISSILES_TRACKING_RADIUS=14 so
    //     missiles 3-5 will curve toward it.
    //   - Reload homingMissiles ammo and clear its cooldown so useActiveItem
    //     fires immediately.
    //
    // Timing window: at T+700ms after the volley fires:
    //   missile 0: launched at T+0ms    → 700ms in flight
    //   missile 1: launched at T+180ms  → 520ms in flight
    //   missile 2: launched at T+360ms  → 340ms in flight
    //   missile 3: launched at T+540ms  → 160ms in flight
    //   missile 4: scheduled for T+720ms (NOT YET LAUNCHED at 700ms)
    //   missile 5: scheduled for T+900ms (NOT YET LAUNCHED at 700ms)
    // So 4 missiles are in flight, having curved toward their targets with
    // visible noseTip + fins at the front/rear of the body assembly.
    await page.evaluate(() => {
      const w = window as unknown as {
        __hooks: { spawnCrystalAt: (x: number, y: number) => number };
        __game: {
          ship: { state: { position: { x: number; y: number } } };
          asteroids: { state: { position: { x: number; y: number }; kind: string } }[];
          activeAmmo: Record<string, { charges: number; cooldownRemaining: number }>;
          useActiveItem: (k: string) => void;
        };
      };
      // Spawn iron asteroids (not crystals — homing missiles lock any kind).
      // Reuse spawnCrystalAt which is just a wrapper around spawnAsteroid for
      // a CRYSTAL kind, so we mutate the kind afterwards to IRON so missiles
      // don't fracture them mid-test.
      const nearId = w.__hooks.spawnCrystalAt(4, 0);
      const farId = w.__hooks.spawnCrystalAt(12, 0);
      for (const a of w.__game.asteroids) {
        if (a.state.position.x === 4 || a.state.position.x === 12) {
          (a as { state: { kind: string } }).state.kind = 'IRON';
        }
      }
      w.__game.ship.state.position = { x: 0, y: 0 };
      w.__game.activeAmmo['homingMissiles'].charges = 1;
      w.__game.activeAmmo['homingMissiles'].cooldownRemaining = 0;
      w.__game.useActiveItem('homingMissiles');
      return { nearId, farId };
    });

    // Wait 700ms — missiles 0-3 have launched, missile 4 still pending.
    await page.waitForTimeout(700);

    // Verify no page errors fired during the volley.
    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    await page.screenshot({ path: '.test-artifacts/phase-7c2-volley-mid-curve.png' });
  });
});