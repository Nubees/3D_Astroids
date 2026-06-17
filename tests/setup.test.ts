import { test, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Smoke Test
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Give Vitest something to run so npm test passes before Playwright.
// Setup: Vitest loads all *.test.ts files.
// Issues: None.
// Fix: Minimal truthy smoke test.
// Gotchas: Real tests belong next to the code they exercise in tests/ or src/.
// ═══════════════════════════════════════════════════════════════════════════

test('project scaffold loads', () => {
  expect(true).toBe(true);
});
