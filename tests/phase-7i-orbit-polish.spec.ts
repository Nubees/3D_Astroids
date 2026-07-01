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
//
//           ── Phase 7i Sprint 3 (Task 8) peak-tier paragraph ──
//           Sprint 3 charges the player can bank 1/2/3 orbitDrones pickups
//           (ORBIT_DRONES_CHARGE_CAP=3 in src/pickups.ts:456). useActiveItem
//           (src/game.ts:1507) reads `charges + 1` AFTER consumeActiveCharge
//           decremented, so 3 banked charges → tier=3 deploy. The off-by-one
//           was the Sprint 3 fix — pre-fix a player banking 3 charges would
//           see only tier 2 (3 drones) because the field was read BEFORE
//           consumeActiveCharge ran. Spawning 3 pickups adjacent to the ship
//           and walking the ship through each one in order banks charges
//           cleanly. Dropping them at offsets shipX+0.4 + i*0.15 means the
//           ship walks to x=shipX+0.4 (charge 1), x=shipX+0.55 (charge 2),
//           x=shipX+0.70 (charge 3) — each pickup collect step MUST fire
//           before the next one or charges skip. The test waits 100ms between
//           drops to let the per-frame collect logic catch up. With the
//           off-by-one fix the post-Digit2 deployment reads perDrone.length=4
//           and tier=3.
//
//           ── Phase 7i-2 (Task 10) peak-tier assertion paragraph ──
//           This file gains a 4th test (test 4/4) for the Phase 7i-2 closeout
//           that asserts the three load-bearing spec changes that the user can
//           eyeball: (1) red beam color = 0xff0033 (ORBIT_DRONES_BEAM_COLOR in
//           src/pickups.ts:523 — Phase 7i-2 hotfix #7: was 0xff2233), (2) orbit
//           radius > 2.0 (the value was bumped from 1.5u to 2.5u in
//           src/pickups.ts:513 — ORBIT_DRONES_ORBIT_RADIUS is the spec; the
//           >2.0 lower bound handles the Y-bob trough), and (3) 11s active
//           window (the dep.remaining field starts at
//           ORBIT_DRONES_DURATION_SECONDS=11.0 and dt-decrements each frame).
//
//           The hook surface is `__game` (set in src/main.ts:34-35) NOT
//           `__GAME_STATE` — the original plan brief had this wrong, the
//           dispatch flagged it, and the implementation here probes
//           `__game.activeDeployments[0].perDrone[0]` directly. No new
//           globals are added to src/main.ts or src/game.ts.
//
//           Why beam COLOR not visibility: at boot there is no asteroid in
//           range (ORBIT_DRONES_TARGET_RADIUS=8u, no asteroids spawn within
//           ~5u of the ship in headless mode), so fireDroneBeam's target
//           branch never fires and `drone.beamLine.visible` stays false.
//           The factory still constructs the Line with the correct red
//           material at spawn, so `beamLine.material.color.getHex() === 0xff0033`
//           IS the load-bearing Phase 7i-2 spec change — the visibility
//           is a runtime detail. We assert the color IF beamLine exists
//           and silently skip when it is null (shouldn't happen — spawnDroneDeployment
//           always creates the Line, but defensive against refactors that
//           defer the factory call).
//
//           Why orbit radius > 2.0 not exact: ORBIT_DRONES_ORBIT_RADIUS=2.5 is
//           the base, but updateDroneVisuals layers a Y-bob on top
//           (amplitude 0.15u, 1.2 Hz in src/orbit-drone-vfx.ts:103). A 1-frame
//           sample at a bob trough can read as 2.35u; the spec is satisfied
//           any time the value is in [2.35, 2.65]. The >2.0 lower bound is
//           a 0.5u safety margin below the worst-case trough so a regression
//           to the pre-7i-2 1.5u radius is still caught (1.5 < 2.0 = fail).
//
//           Why dep.remaining not dep.elapsedSeconds: dep.remaining is the
//           "seconds until expiry" field that starts at 11.0 and dt-decrements
//           (per src/active-deployments.ts:608). dep.elapsedSeconds is the
//           "seconds since spawn" field that starts at 0 and dt-increments.
//           For a fresh 250ms-after-deploy probe the values are ~10.75 and
//           ~0.25 respectively — the brief says "between 10.0 and 11.0" which
//           is the dep.remaining semantic. Using elapsedSeconds would have
//           asserted ~0.25 (wrong direction).
//
//           ── Task 11 DELTA: input-layer race fix + tests restored ──
//           Task 10 documented a CRITICAL production bug in src/input.ts:
//           digit2JustPressed() and digit2JustReleased() shared a single
//           `prevDigit2` latch. src/game.ts:989 calls JustPressed BEFORE
//           JustReleased (line 1027) in the same update tick, so on the
//           keyup-edge tick JustPressed clobbered the latch to false and
//           JustReleased then saw isDown=false, prev=false → returned
//           FALSE → useActiveItem never fired. ALL THREE Digit2 active
//           pickups (BOMB_STRIKE + ORBIT_DRONES + HOMING_MISSILES)
//           silently no-op'd in production.
//
//           Task 11 fixed this by splitting the latch in src/input.ts
//           into prevDigit2Pressed + prevDigit2Released, so each method
//           reads + writes its own. With the fix in place, the original
//           Digit2 keyboard pattern works correctly — this file no
//           longer needs the fireActiveItem / bankOrbitDroneCharge
//           helpers. All 4 tests now dispatch KeyboardEvent('keydown',
//           { code: 'Digit2', ... }) via window.dispatchEvent, wait
//           ~150ms, then probe state. The 4/4 peak-tier assertions
//           (red beam + 2.5u orbit + 11s window) are preserved.
//
//           VERIFICATION: dispatch keydown → wait → read
//           window.__game.activeDeployments[0].perDrone[0]. After the
//           fix the keyup frame fires useActiveItem as expected.
//
//           PRE-EXISTING TEST FIXES (Task 10) — the three Sprint 2/3
//           tests in this file were originally written with the Digit2
//           keyboard pattern, but Task 10 rewrote them to use
//           `fireActiveItem(page, kind)` which called
//           `Game.useActiveItem()` directly via `(game as any)` cast to
//           route around the input-layer race. Task 11 reverts that
//           workaround — the keyboard pattern now works because the
//           latch is split.
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

/**
 * Phase 7i-2 (Task 11) — fire the Digit2 active pickup via the keyboard
 * path. Dispatches a keydown only (no keyup); the Game's update loop
 * reads it via InputManager.digit2JustPressed() / digit2JustReleased().
 * After the Task 11 input-layer race fix (prevDigit2 split into
 * prevDigit2Pressed + prevDigit2Released) the keyup frame is correctly
 * observed and useActiveItem fires. See the My Rules DELTA at the top
 * of this file for the race this restores.
 */
async function pressDigit2(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'Digit2',
        key: '2',
        bubbles: true,
      }),
    );
  });
  // Hold for ~50ms then release so the InputManager sees a clean
  // keyup frame. The wait between keydown and keyup is short enough
  // to keep the deploy under the ORBIT_DRONES_CHARGE_UP_HOLD_SECONDS
  // threshold (0.3s) so isChargeUp stays false.
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    window.dispatchEvent(
      new KeyboardEvent('keyup', {
        code: 'Digit2',
        key: '2',
        bubbles: true,
      }),
    );
  });
}

/**
 * Force-drop a pickup and walk the ship into it so the collect logic
 * banks the ammo charge. The pickup is a plain {x, y} object so we
 * mutate .x/.y directly (the original tests used direct assignment
 * too, since `position` is a plain object in this codebase, not a
 * Three.js Vector2 instance).
 */
async function bankOrbitDroneCharge(
  page: Page,
  shipX: number,
  shipY: number,
  dx: number,
): Promise<void> {
  await page.evaluate(
    ({ sx, sy, dx }) => {
      const w = window as unknown as {
        __game: {
          ship: { state: { position: { x: number; y: number } } };
        };
        __hooks: {
          spawnPickup: (kind: string, x: number, y: number) => boolean;
        };
      };
      w.__hooks.spawnPickup('orbitDrones', sx + dx, sy);
      w.__game.ship.state.position.x = sx + dx;
      w.__game.ship.state.position.y = sy;
    },
    { sx: shipX, sy: shipY, dx },
  );
}

test.describe.configure({ mode: 'serial' });

test.describe('Phase 7i Sprint 2 — drone deploy + shockwave', () => {
  test('1/2 — deploying 2 drones places 2 distinct meshes in perDrone[]', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Drop an orbit drone pickup next to the ship.
    const shipPos0 = await page.evaluate(() => {
      const w = window as unknown as {
        __game: { ship: { state: { position: { x: number; y: number } } } };
      };
      return { ...w.__game.ship.state.position };
    });
    await bankOrbitDroneCharge(page, shipPos0.x, shipPos0.y, 0.5);

    // Wait a few frames for the pickup collect + ammo state reconcile.
    await page.waitForTimeout(150);

    // Verify pickup was collected and ammo has 1 charge before firing.
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

    // Fire Digit2 via the keyboard path — see the My Rules DELTA at
    // the top of this file for the Task 11 input-layer race fix that
    // made this possible.
    await pressDigit2(page);
    await page.waitForTimeout(150);

    // Verify 2 drones in the active deployment.
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

    const shipPos0 = await page.evaluate(() => {
      const w = window as unknown as {
        __game: { ship: { state: { position: { x: number; y: number } } } };
      };
      return { ...w.__game.ship.state.position };
    });
    await bankOrbitDroneCharge(page, shipPos0.x, shipPos0.y, 0.5);

    await page.waitForTimeout(150);
    // Fire Digit2 via the keyboard path — see the My Rules DELTA at
    // the top of this file for the Task 11 input-layer race fix that
    // made this possible.
    await pressDigit2(page);

    // Sample the shockwave visibility within the 250ms animation window.
    // The shockwave starts at scale 0.5 and grows to 2.0 with opacity 1→0;
    // checking visible=true is enough to confirm the deploy animation
    // triggered (it was a Sprint 2 fix — pre-Sprint 2 the ring was hidden).
    // 200ms wait covers ~12 frames so the age-nudge (0 → 0.001) and the
    // first age-bump (+deltaTime) both have time to execute; if visible
    // is still false the age has eclipsed 0.25s and the ring hid itself.
    await page.waitForTimeout(150);
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

  test('3/3 — peak tier: 3 charges → 4 drones + tier=3', async ({ page }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Force-drop 3 orbit drone pickups adjacent to the ship and walk
    // the ship through each one in turn so the collect logic banks
    // 3 charges (ORBIT_DRONES_CHARGE_CAP=3 in src/pickups.ts:456).
    const shipPos0 = await page.evaluate(() => {
      const w = window as unknown as {
        __game: { ship: { state: { position: { x: number; y: number } } } };
      };
      return { ...w.__game.ship.state.position };
    });
    for (const dx of [0.4, 0.55, 0.7]) {
      await bankOrbitDroneCharge(page, shipPos0.x, shipPos0.y, dx);
      // Wait a small amount between drops so the per-frame collect
      // logic catches up (the collect handler is per-frame, not
      // synchronous with the spawnPickup call).
      await page.waitForTimeout(50);
    }

    // Sanity: verify ammo banked 3 charges before firing.
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
      };
    });
    expect(preCharge.pickups).toBe(0); // all 3 collected
    expect(preCharge.orbitCharges).toBe(3);

    // Fire Digit2 via the keyboard path — see the My Rules DELTA at
    // the top of this file for the Task 11 input-layer race fix that
    // made this possible.
    await pressDigit2(page);
    await page.waitForTimeout(150);

    // Verify tier=3 and 4 drones. The off-by-one fix in src/game.ts:1507
    // reads `charges + 1` AFTER consumeActiveCharge decremented charges
    // to 0, so 3 banked charges → tier=3 → ORBIT_DRONES_TIER_DRONE_COUNT(3)=4.
    const postState = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: {
          activeDeployments: Array<{
            tier?: number;
            perDrone?: unknown[];
          }>;
        };
      }).__game;
      const dep = g.activeDeployments[0];
      return {
        deployments: g.activeDeployments.length,
        tier: dep?.tier ?? -1,
        droneCount: dep?.perDrone?.length ?? 0,
      };
    });
    expect(postState.deployments).toBeGreaterThan(0);
    expect(postState.tier).toBe(3);
    expect(postState.droneCount).toBe(4);

    // Verify no page errors fired.
    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    await page.screenshot({ path: '.test-artifacts/phase-7i-sprint3-peak-tier.png' });
  });

  test('4/4 — Phase 7i-2 peak-tier: red beam + 2.5u orbit + 11s window', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await bootGame(page);

    // Force-drop 3 orbit drone pickups adjacent to the ship and walk the
    // ship through each one in turn — same pattern as test 3/3 — so the
    // collect logic banks 3 charges (ORBIT_DRONES_CHARGE_CAP=3 in
    // src/pickups.ts:456). 3 banked charges → tier=3 deploy → 4 drones.
    const shipPos0 = await page.evaluate(() => {
      const w = window as unknown as {
        __game: { ship: { state: { position: { x: number; y: number } } } };
      };
      return { ...w.__game.ship.state.position };
    });
    for (const dx of [0.4, 0.55, 0.7]) {
      await bankOrbitDroneCharge(page, shipPos0.x, shipPos0.y, dx);
      await page.waitForTimeout(50);
    }

    // Fire Digit2 via the keyboard path — see the My Rules DELTA at
    // the top of this file for the Task 11 input-layer race fix that
    // made this possible.
    await pressDigit2(page);
    await page.waitForTimeout(150);

    // Probe the deployment state. We assert all four Phase 7i-2 spec
    // changes in a single evaluate so the per-drone mesh position is
    // sampled at one consistent instant (the orbit + bob math dt-cycles
    // every frame, so reading position from two separate evaluate calls
    // would let the drone drift between samples).
    const peakState = await page.evaluate(() => {
      const g = (window as unknown as {
        __game: {
          ship: { state: { position: { x: number; y: number } } };
          activeDeployments: Array<{
            tier?: number;
            remaining?: number;
            perDrone?: Array<{
              mesh: { position: { x: number; y: number; z: number } };
              beamLine: {
                material: { color: { getHex: () => number } };
              } | null;
            }>;
          }>;
        };
      }).__game;
      const shipPos = g.ship.state.position;
      const dep = g.activeDeployments[0];
      const first = dep?.perDrone?.[0];
      const dx = first ? first.mesh.position.x - shipPos.x : 0;
      const dy = first ? first.mesh.position.y - shipPos.y : 0;
      const orbitRadius = Math.hypot(dx, dy);
      // beamLine is typed Line | null — at boot no asteroid is in range,
      // so the line stays visible=false (per the My Rules DELTA at the
      // top of this file). The factory still constructs it with the red
      // material at spawn, so the COLOR is what we assert.
      const beamColor = first?.beamLine?.material?.color?.getHex() ?? null;
      return {
        deployments: g.activeDeployments.length,
        tier: dep?.tier ?? -1,
        droneCount: dep?.perDrone?.length ?? 0,
        orbitRadius,
        remaining: dep?.remaining ?? -1,
        beamColor,
        beamLinePresent: first?.beamLine !== null && first?.beamLine !== undefined,
      };
    });

    // Re-assert the deployment shape so the new assertions have a stable
    // anchor (test 3/3 already covers these, but the new test reads them
    // back to keep the spec file self-contained).
    expect(peakState.deployments).toBeGreaterThan(0);
    expect(peakState.tier).toBe(3);
    expect(peakState.droneCount).toBe(4);

    // (1) Red beam color = 0xff0033 (ORBIT_DRONES_BEAM_COLOR, Phase 7i-2
    // hotfix #7: was 0xff2233). The beam Line is created at spawn with the
    // correct material color, so even if the runtime never promotes
    // visible=true (no in-range asteroid), the material itself is the
    // spec. See My Rules DELTA at the top of this file for the
    // visibility-vs-color reasoning.
    expect(peakState.beamLinePresent).toBe(true);
    expect(peakState.beamColor).toBe(0xff0033);

    // (2) Orbit radius > 2.0. The spec is 2.5u
    // (ORBIT_DRONES_ORBIT_RADIUS=2.5 in src/pickups.ts:513) plus a Y-bob
    // of ±0.15u. A sample at a bob trough can read as low as ~2.35u, so
    // >2.0 is a 0.5u safety margin below the worst-case trough that
    // still catches a regression to the pre-7i-2 1.5u radius.
    expect(peakState.orbitRadius).toBeGreaterThan(2.0);

    // (3) 11s active window. dep.remaining starts at
    // ORBIT_DRONES_DURATION_SECONDS=11.0 and dt-decrements each frame in
    // src/active-deployments.ts:608. After 150ms of headless play the
    // value should be ~10.85 — assert [10.0, 11.0] to allow a generous
    // headless-throttle margin while still failing on a regression to
    // the pre-7i-2 6s window.
    expect(peakState.remaining).toBeGreaterThan(10.0);
    expect(peakState.remaining).toBeLessThanOrEqual(11.0);

    // Verify no page errors fired.
    const errs = await page.evaluate(() => {
      return (window as unknown as { __pageErrors?: string[] }).__pageErrors ?? [];
    });
    expect(errs).toEqual([]);

    await page.screenshot({ path: '.test-artifacts/phase-7i-2-red-beam.png' });
  });
});
