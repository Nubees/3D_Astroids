// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster State Machine (Phase 7f)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure logic for the Magnet Booster 4th active pickup. Tracks the
//          pending tier (0/1/2) the player has collected and the active
//          tier during the 10-second activation window. No Three.js — this
//          module is pure state + math, fully testable in Node.
// Setup: Imported by src/game.ts (lifecycle + per-frame tick + HUD), tests/.
// Issues: None at creation.
// Fix: Phase 7f. The state machine has two independent slots — pendingTier
//      and activeTier — that interact only at activation. Collect-while-active
//      bumps pendingTier but never touches activeUntil (so the active window
//      does not reset duration). Activation consumes the pending tier.
//      effectiveMagnetMultiplier returns activeTier > 0 ? activeTier+1 :
//      pendingTier > 0 ? pendingTier+1 : 1 — active overrides pending so
//      the per-frame magnet pull always uses the strongest current radius.
// Gotchas: The activateMagnetBooster returns false if activeUntil > gameTime
//          (already active) — the player cannot spam Digit4 to extend. The
//          pendingTier is PRESERVED in that no-op case so the queued tier
//          remains available after expiry. tickMagnetBooster returns true on
//          the frame the window expires (a useful signal for HUD transition
//          animations). activeRemainingSeconds is a pure getter — call sites
//          pass gameTime themselves to avoid coupling the state module to
//          the game's clock.
// ═══════════════════════════════════════════════════════════════════════════

// 2026-06-26 tuning pass v2 — duration extended 6.0s → 10.0s. The 6s
// window felt too short for the player to actually capitalize on the
// wider pull ring (especially with the +40% v2 pull speed, scrap now
// travels much farther per second and can clear the ring before the
// timer expires). 10s gives a comfortable loop where the player can
// pause to position, sweep, then reposition before the timer ends.
// Phase 7f design spec still anchors the concept; only this runtime
// constant changed.
export const MAGNET_BOOSTER_DURATION_SECONDS = 10.0;
export const MAX_PENDING_TIER = 2;

export interface MagnetBoosterState {
  /** 0 = none collected, 1 = 2x ready, 2 = 3x ready. Clamped at MAX_PENDING_TIER. */
  pendingTier: 0 | 1 | 2;
  /** Game-time seconds at which the active window expires; 0 = inactive. */
  activeUntil: number;
  /** Tier during the active window; 0 = no active window. */
  activeTier: 0 | 1 | 2;
}

export function createMagnetBooster(): MagnetBoosterState {
  return { pendingTier: 0, activeUntil: 0, activeTier: 0 };
}

/**
 * Apply a Magnet Booster pickup collection.
 *
 * - When inactive: bumps pendingTier toward MAX_PENDING_TIER.
 * - When active: bumps pendingTier toward MAX_PENDING_TIER BUT does NOT
 *   reset activeUntil or change activeTier (collect-while-active rule:
 *   the queued tier applies to the NEXT activation).
 */
export function collectMagnetBooster(
  state: MagnetBoosterState,
  isActive: boolean,
): void {
  if (isActive) {
    if (state.pendingTier < MAX_PENDING_TIER) {
      state.pendingTier = (state.pendingTier + 1) as 1 | 2;
    }
    return;
  }
  state.pendingTier = Math.min(state.pendingTier + 1, MAX_PENDING_TIER) as 0 | 1 | 2;
}

/**
 * Try to activate the Magnet Booster. Returns true on success, false if:
 * - pendingTier is 0 (nothing to activate), OR
 * - activeUntil > gameTime (a window is already running; the queued tier
 *   is preserved for the next activation).
 *
 * On success: copies pendingTier into activeTier, resets pendingTier to 0,
 * and sets activeUntil = gameTime + MAGNET_BOOSTER_DURATION_SECONDS.
 */
export function activateMagnetBooster(
  state: MagnetBoosterState,
  gameTime: number,
): boolean {
  if (state.pendingTier === 0) return false;
  if (state.activeUntil > gameTime) return false;
  state.activeUntil = gameTime + MAGNET_BOOSTER_DURATION_SECONDS;
  state.activeTier = state.pendingTier;
  state.pendingTier = 0;
  return true;
}

/**
 * Per-frame decay. Returns true on the frame the active window expires
 * (useful for HUD transition animations); false otherwise.
 */
export function tickMagnetBooster(
  state: MagnetBoosterState,
  gameTime: number,
): boolean {
  if (state.activeUntil > 0 && gameTime >= state.activeUntil) {
    state.activeUntil = 0;
    state.activeTier = 0;
    return true;
  }
  return false;
}

/**
 * Current magnet-radius multiplier. Active overrides pending so the player
 * always sees the strongest current radius (the queued tier is invisible
 * during the active window — see the "Hide preview during active" note in
 * the VFX module).
 */
export function effectiveMagnetMultiplier(state: MagnetBoosterState): number {
  if (state.activeTier > 0) return state.activeTier + 1;
  if (state.pendingTier > 0) return state.pendingTier + 1;
  return 1;
}

/** Convenience wrapper: returns the absolute magnet radius for this frame. */
export function effectiveMagnetRadius(
  state: MagnetBoosterState,
  baselineRadius: number,
): number {
  return baselineRadius * effectiveMagnetMultiplier(state);
}

/** Pure getter for the HUD countdown. Returns 0 when inactive. */
export function activeRemainingSeconds(
  state: MagnetBoosterState,
  gameTime: number,
): number {
  if (state.activeUntil === 0) return 0;
  return Math.max(0, state.activeUntil - gameTime);
}
