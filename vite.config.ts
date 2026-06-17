import { defineConfig } from 'vite';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Vite Config
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Configure the Vite dev server and build for the 3D Astroids project.
// Setup: Reads source from src/ and outputs to dist/.
// Issues: None.
// Fix: Created minimal config with no public dir and a fixed dev port.
// Gotchas: publicDir is disabled because the project uses procedural assets.
// ═══════════════════════════════════════════════════════════════════════════

export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
