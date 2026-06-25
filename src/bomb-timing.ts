// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Bomb Timing Constants (Phase 7c)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Single source of truth for the Bomb Strike 3-phase time sequence
//          timing constants. Pure values, no DOM/Three.js dependency, so the
//          values are unit-testable in vitest's Node env. The DOM/CSS glue
//          (triggerScreenFlash, triggerBombPunchZoom) lives in game.ts
//          because it touches document.body + the canvas wrapper.
// Setup:   Imported by src/game.ts fireBombStrike + updateBombVisuals +
//          tests/bomb-timing.test.ts.
// Issues:  Phase 7b's 6 layers all peak in the same frame — reads as
//          "additive soup" rather than a controlled blast. Phase 7c staggers
//          them across 1.2s and adds DOM white-flash + freeze-frame + CSS
//          punch-zoom for screen-level punctuation.
// Fix:     These 5 constants drive the stagger. Picked from user-pre-decided
//          open questions in the spec (DOM flash 0.8, punch-zoom 1.02, freeze
//          2 ticks). Freeze-frame is in TICKS (not seconds) because the
//          update loop is called per-frame; 2 ticks at 30fps ≈ 60ms.
// Gotchas: SCREEN_FLASH_DURATION_SECONDS / PUNCH_ZOOM_DURATION_SECONDS are
//          decremented in updateBombVisuals (per-frame), so they should
//          match the CSS transition duration in index.html. FREEZE_FRAME_TICKS
//          is decremented in updateBombVisuals but checked FIRST in
//          update(dt) so a frozen frame skips ALL the simulation work.
// ═══════════════════════════════════════════════════════════════════════════

export const SCREEN_FLASH_DURATION_SECONDS = 0.08;
export const SCREEN_FLASH_OPACITY = 0.8;
export const FREEZE_FRAME_TICKS = 2;
export const PUNCH_ZOOM_DURATION_SECONDS = 0.1;
export const PUNCH_ZOOM_SCALE = 1.02;
