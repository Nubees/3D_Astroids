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
  };

  window.addEventListener('beforeunload', () => {
    game.stop();
  });
}

main();
