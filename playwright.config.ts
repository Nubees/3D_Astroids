import { defineConfig, devices } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Playwright Config
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Run browser-based screenshot/verification tests for the game.
// Setup: Starts the Vite dev server automatically before tests.
// Issues: None.
// Fix: Created config with a single Chromium project and dev-server webServer.
// Gotchas: On Windows, ensure no other process holds port 5173.
// ═══════════════════════════════════════════════════════════════════════════

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
