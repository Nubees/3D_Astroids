import { defineConfig } from 'vitest/config';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Vitest Config
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Configure Vitest for unit tests of pure game utilities.
// Setup: Node environment, global test APIs.
// Issues: Phase 7h needed DOM access (HTMLVideoElement via document.createElement)
//          for video-asteroid tests; node environment doesn't provide `document`.
// Fix: Use `// @vitest-environment jsdom` docblock at the top of
//      tests/video-asteroid.test.ts so only that one file pays the
//      jsdom startup cost; everything else stays on node.
// Gotchas: Game rendering tests belong in Playwright, not Vitest.
//          JSDOM's HTMLMediaElement.pause() throws "Not implemented"
//          — this is logged but does not break tests; vi spies on
//          pause() still record the call.
// ═══════════════════════════════════════════════════════════════════════════

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Phase 7h: video-asteroid tests create an HTMLVideoElement via
    // document.createElement('video'). The jsdom environment is opted-in
    // per-file via a `// @vitest-environment jsdom` docblock at the top of
    // tests/video-asteroid.test.ts. Other pure-logic tests stay on the
    // cheaper node environment.
    include: ['tests/**/*.test.ts'],
  },
});
