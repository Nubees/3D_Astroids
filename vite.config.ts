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
// Gotchas: publicDir is set to 'public' so procedural assets (models,
//          textures, video) are copied as-is to dist/. The lab pages in
//          public/test-lab/ are also copied as-is (mirrors the existing
//          asteroid-lab.html at dist/test-lab/asteroid-lab.html). The
//          weapon lab at public/test-lab/weapon-lab.html is added in
//          Phase 7i-3 — same dev-only publicDir pattern.
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
