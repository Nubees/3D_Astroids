import { Game } from './game';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Entry Point
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Bootstrap the game on the #game-canvas element.
// Setup: index.html loads this module; Vite serves it.
// Issues: None.
// Fix: Added cleanup on page unload so event listeners and the loop stop.
// Gotchas: Throws if the canvas is missing; keeps failure noisy and early.
// ═══════════════════════════════════════════════════════════════════════════

function main(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    throw new Error('Missing #game-canvas element');
  }
  const game = new Game(canvas);
  game.start();

  window.addEventListener('beforeunload', () => {
    game.stop();
  });
}

main();
