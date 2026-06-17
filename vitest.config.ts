import { defineConfig } from 'vitest/config';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Vitest Config
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Configure Vitest for unit tests of pure game utilities.
// Setup: Node environment, global test APIs.
// Issues: None.
// Fix: Created minimal config so npm test can run alongside Playwright.
// Gotchas: Game rendering tests belong in Playwright, not Vitest.
// ═══════════════════════════════════════════════════════════════════════════

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
