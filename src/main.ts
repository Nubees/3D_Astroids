import { Game } from './game';
import { ShipSelectScreen } from './ship-select';

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

  // ═══════════════════════════════════════════════════════════════════════════
  // My Rules — Test Mode pre-load
  // ═══════════════════════════════════════════════════════════════════════════
  // Purpose: When the player enabled the TEST MODE toggle on the ship-select
  //          screen, seed the 4 active addons with 99 charges each before
  //          the first tick so QA can stress-test weapons + magnet without
  //          grinding pickup drops.
  // Setup:   selection.testMode is the boolean the ship-select toggle
  //          resolves with. Triggers game.preloadTestAmmo() which writes
  //          directly to activeAmmo[kind].charges + magnetBooster.pendingTier.
  // Issues:  Without this hook, the toggle has no game-side effect and the
  //          pre-load intent is silent.
  // Fix:     Conditional call between Game.create() (which builds an empty
  //          ammo map) and game.start() (which begins the tick loop).
  // Gotchas: Per-session only — no localStorage write. Defaults to OFF
  //          every page load. Game.stop() rebuilds the ammo map on
  //          respawn, so the pre-load is one-shot per page life.
  // ═══════════════════════════════════════════════════════════════════════════
  if (selection.testMode) game.preloadTestAmmo();

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
}

main();
