import { Game } from './game';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Bootstrap the game on the #game-canvas element.
// Setup: index.html loads this module; Vite serves it.
// Issues: None.
// Fix: Created minimal entry that finds the canvas and starts the Game loop.
// Gotchas: Throws if the canvas is missing; keeps failure noisy and early.
// ═══════════════════════════════════════════════════════════════════════════

function main(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Missing #game-canvas element');
  }
  const game = new Game(canvas);
  game.start();
}

main();
