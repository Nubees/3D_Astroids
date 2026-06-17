// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Shared Types
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Export shared TypeScript interfaces used across game systems.
// Setup: Imported by src/ modules.
// Issues: None.
// Fix: Created minimal types for Phase 0; expand per phase as systems arrive.
// Gotchas: Keep this file flat; avoid deep barrel exports.
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector2 {
  readonly x: number;
  readonly y: number;
}
