import { Game } from './game';
import { ShipSelectScreen } from './ship-select';
import { ORBIT_DRONES_USE_SHADER_BEAM } from './pickups';
import {
  getUseShaderBeam,
  setUseShaderBeam,
} from './orbit-drone-vfx';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Bootstrap the game. First show the ship selection hangar, then
//          start the game with the chosen ship.
// Setup: index.html loads this module; Vite serves it.
// Issues: Previously created Game directly, so only one hard-coded ship was used.
// Fix: Create a ShipSelectScreen, await the player's choice, then pass the
//      selected mesh into Game.create().
// Gotchas: Throws if the canvas is missing; keeps failure noisy and early.
//          Both the selection screen and the game render to the same canvas,
//          one after the other.
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Missing #game-canvas element');
  }

  const selectScreen = new ShipSelectScreen(canvas);
  const selection = await selectScreen.waitForSelection();

  const game = await Game.create(canvas, selection.entry.id, selection.mesh);
  game.start();

  // Expose a screenshot/debug hook on `window` so the Playwright harness can
  // drive deterministic game states (force a crystal fracture, advance the
  // burst clock, etc.). Available in both dev and prod builds — it exposes
  // no sensitive data, only gameplay state.
  (window as unknown as { __game: Game; __hooks: unknown }).__game = game;
  (window as unknown as { __game: Game; __hooks: unknown }).__hooks = {
    spawnCrystalAt: (x: number, y: number) => game.debugSpawnCrystalAt(x, y),
    fractureCrystal: (id: number) => game.debugFractureCrystal(id),
    killCrystal: (id: number) => game.debugKillCrystal(id),
    setGameTime: (s: number) => game.debugSetGameTime(s),
    getCrystal: (id: number) => game.debugGetCrystal(id),
    pauseClock: (paused: boolean) => game.debugPauseClock(paused),
    // Phase 7i Sprint 2 Task 6 — force-spawn a pickup so Playwright can
    // skip the 10% drop roll on Iron LARGE kills. Accepts the PickupKind
    // string value (e.g. 'orbitDrones', 'magnetBooster', 'bombStrike',
    // 'homingMissiles', 'fireRate', 'shield', 'spread'). Returns true
    // on success, false if the kind string is unknown.
    spawnPickup: (kind: string, x: number, y: number) =>
      game.debugSpawnPickup(kind, x, y),
  };

  window.addEventListener('beforeunload', () => {
    game.stop();
  });

  // Phase 7i-2 hotfix #8 — A/B compare plasma beam vs solid cylinder.
  // Press 'B' to toggle ORBIT_DRONES_USE_SHADER_BEAM at runtime. The
  // toggle takes effect on the next drone deployment — existing beams
  // finish their 0.25s lifetime, then new spawns use the new material.
  // Logged to the console for the user to confirm.
  // Exposed via __hooks too so the Playwright harness can flip it
  // without a keyboard event.
  //
  // Phase 7i-2 hotfix #9 — actually wired to the dispatch path. In hotfix
  // #8 the local `useShaderBeam` only fed console.log (createDroneBeam
  // read the const import directly, ignoring the local), so pressing B
  // changed the log but not the visual. setUseShaderBeam now mutates
  // the module-level `_useShaderBeam` that createDroneBeam actually
  // reads. ORBIT_DRONES_USE_SHADER_BEAM is still the default-seed
  // value at module init.
  setUseShaderBeam(ORBIT_DRONES_USE_SHADER_BEAM);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'b' || e.key === 'B') {
      const next = !getUseShaderBeam();
      setUseShaderBeam(next);
      console.log(`[hotfix #8/9] ORBIT_DRONES_USE_SHADER_BEAM = ${next}`);
    }
  });
  (window as unknown as { __hooks: Record<string, unknown> }).__hooks = {
    ...((window as unknown as { __hooks: Record<string, unknown> }).__hooks ?? {}),
    setPlasmaBeam: (enabled: boolean) => {
      setUseShaderBeam(enabled);
      console.log(`[hotfix #8/9] ORBIT_DRONES_USE_SHADER_BEAM = ${enabled} (via hook)`);
    },
    isPlasmaBeam: () => getUseShaderBeam(),
  };
}

main();
