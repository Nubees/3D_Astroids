import { defineConfig } from 'vite';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Vite Config
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Configure the Vite dev server and build for the 3D Astroids project.
// Setup: Reads source from src/ and outputs to dist/.
// Issues: The Ship Hangar page (ships-inspector.html) was only reachable in dev
//         because Vite bundles index.html by default, leaving it out of dist/.
// Fix: Added ships-inspector.html as a second Rollup input so the hangar is
//      served in both dev and production builds.
// Gotchas: publicDir is disabled because the project uses procedural assets.
//          The two entry points produce dist/index.html and dist/ships-inspector.html.
// ═══════════════════════════════════════════════════════════════════════════

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        hangar: 'ships-inspector.html',
      },
    },
  },
  assetsInclude: ['**/*.glb'],
});
