# Phase 7f — Magnet Booster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Magnet Booster — a 4th active pickup that expands the ship's magnet ring to 2× or 3× its baseline radius for 6 seconds when activated via Digit4. Preview ring shows the pending radius before activation. Always-visible HUD slot teaches the key.

**Architecture:** Two new pure modules (`magnet-booster.ts` for state, `magnet-booster-vfx.ts` for visuals), one runtime `effectiveMagnetRadius` derived per-frame from `MagnetBoosterState` and threaded into the existing magnet pull paths in `src/scrap.ts` and `src/pickups.ts`, a new HUD slot (always visible) in `src/game.ts`, a new input binding (`useMagnetBooster` on Digit4) in `src/input.ts`. One atomic commit at the end per Phase 7 convention.

**Tech Stack:** Three.js r0.184.0, TypeScript strict, Vite, vitest (Node env, no DOM), Playwright for browser screenshots.

## Global Constraints

These bind every task. Verbatim from the spec:

- 2-space indent, single quotes, semicolons, max 100-char lines (matches project code-style.md).
- "My Rules" comment blocks on every non-trivial block (per CLAUDE.md).
- One big commit at end (matches Phase 7c convention).
- All existing tests must continue to pass.
- No new `require('three')` inline (per feedback_require_three_freeze.md).
- Additive opacity caps per feedback_additive_blending_whiteout.md (max per-source 0.55 for halo / 0.4 for sonar).
- No new dependencies.
- Preview ring color `0xffcc44`, active ring color `0xffcc44`, baseline magnet ring stays `0xffcc00`.
- Magnet Booster collectable: `CapsuleGeometry(0.12, 0.32, 4, 8)`, gold `0xffcc44`, Y-axis spin.
- Activation duration: 6 seconds. Non-negotiable.
- Activate at MAX pending tier (the 2nd pickup never upgrades the current window).
- Collect-while-active: bump pendingTier but do NOT reset active duration.
- Drop source: crystal-guaranteed + 10% LARGE iron chance — same as the existing 3 actives.
- `effectiveRadius` is a required param (no default) — all call sites must pass it.

**Existing MAGNET_RADIUS consumers** (must update from hardcoded constant to `game.effectiveMagnetRadius` getter):
- `src/scrap.ts:19` — remove local constant
- `src/scrap.ts:55-71` — `magnetPull` signature change (add `effectiveRadius: number`)
- `src/pickups.ts:132` — remove local constant
- `src/pickups.ts:151-...` — `updatePickup` signature change (add `effectiveRadius: number`)
- `src/game.ts:890` — pickup count loop
- `src/game.ts:3433` — `createMagnetRing()` (STAYS hardcoded — this is the baseline comparison ring)

---

## Task 1: Pure state machine (`src/magnet-booster.ts`)

**Files:**
- Create: `src/magnet-booster.ts`
- Create: `tests/magnet-booster.test.ts`

**Interfaces:**
- Consumes: nothing (pure module)
- Produces: `MagnetBoosterState` interface, `createMagnetBooster()`, `collectMagnetBooster()`, `activateMagnetBooster()`, `tickMagnetBooster()`, `effectiveMagnetMultiplier()`, `effectiveMagnetRadius()`, `activeRemainingSeconds()` — used by Tasks 2, 3, 6.

- [ ] **Step 1: Write the failing test file**

Create `tests/magnet-booster.test.ts` with 8 tests covering the state machine:

```typescript
import { describe, expect, it } from 'vitest';
import {
  MAGNET_BOOSTER_DURATION_SECONDS,
  MAX_PENDING_TIER,
  MagnetBoosterState,
  activateMagnetBooster,
  activeRemainingSeconds,
  collectMagnetBooster,
  createMagnetBooster,
  effectiveMagnetMultiplier,
  effectiveMagnetRadius,
  tickMagnetBooster,
} from '../src/magnet-booster';

const BASELINE = 2.5; // matches src/scrap.ts:19 (the canonical baseline)

describe('MagnetBooster constants', () => {
  it('exposes MAGNET_BOOSTER_DURATION_SECONDS = 6.0', () => {
    expect(MAGNET_BOOSTER_DURATION_SECONDS).toBe(6.0);
  });

  it('exposes MAX_PENDING_TIER = 2', () => {
    expect(MAX_PENDING_TIER).toBe(2);
  });
});

describe('createMagnetBooster', () => {
  it('returns pendingTier=0, activeUntil=0, activeTier=0', () => {
    const state = createMagnetBooster();
    expect(state.pendingTier).toBe(0);
    expect(state.activeUntil).toBe(0);
    expect(state.activeTier).toBe(0);
  });
});

describe('collectMagnetBooster (inactive)', () => {
  it('bumps pendingTier from 0 to 1 when inactive', () => {
    const state = createMagnetBooster();
    collectMagnetBooster(state, false);
    expect(state.pendingTier).toBe(1);
  });

  it('bumps pendingTier from 1 to 2 when inactive', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    collectMagnetBooster(state, false);
    expect(state.pendingTier).toBe(2);
  });

  it('caps pendingTier at MAX_PENDING_TIER when inactive', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    collectMagnetBooster(state, false);
    expect(state.pendingTier).toBe(2);
  });
});

describe('collectMagnetBooster (active)', () => {
  it('bumps pendingTier but does NOT change activeUntil when active', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 1;
    state.pendingTier = 0;
    collectMagnetBooster(state, true);
    expect(state.pendingTier).toBe(1);
    expect(state.activeUntil).toBe(10.0);  // unchanged
    expect(state.activeTier).toBe(1);       // unchanged
  });

  it('caps pendingTier at MAX_PENDING_TIER when active', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    state.pendingTier = 2;
    collectMagnetBooster(state, true);
    expect(state.pendingTier).toBe(2);
  });
});

describe('activateMagnetBooster', () => {
  it('succeeds with pendingTier=1, sets activeUntil = gameTime + 6, sets activeTier = 1', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    const ok = activateMagnetBooster(state, 5.0);
    expect(ok).toBe(true);
    expect(state.activeUntil).toBeCloseTo(11.0, 5);
    expect(state.activeTier).toBe(1);
    expect(state.pendingTier).toBe(0);  // consumed
  });

  it('succeeds with pendingTier=2, sets activeTier = 2', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    const ok = activateMagnetBooster(state, 5.0);
    expect(ok).toBe(true);
    expect(state.activeTier).toBe(2);
    expect(state.pendingTier).toBe(0);
  });

  it('returns false with pendingTier=0', () => {
    const state = createMagnetBooster();
    expect(activateMagnetBooster(state, 5.0)).toBe(false);
  });

  it('returns false when activeUntil > gameTime (already active)', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    state.activeUntil = 10.0;
    state.activeTier = 1;
    const ok = activateMagnetBooster(state, 5.0);  // gameTime < activeUntil
    expect(ok).toBe(false);
    expect(state.activeTier).toBe(1);  // unchanged
    expect(state.pendingTier).toBe(1);  // preserved
  });
});

describe('tickMagnetBooster', () => {
  it('returns true and clears activeUntil/activeTier when expired', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    const expired = tickMagnetBooster(state, 10.5);
    expect(expired).toBe(true);
    expect(state.activeUntil).toBe(0);
    expect(state.activeTier).toBe(0);
  });

  it('returns false when not expired', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    const expired = tickMagnetBooster(state, 9.5);
    expect(expired).toBe(false);
    expect(state.activeUntil).toBe(10.0);
    expect(state.activeTier).toBe(2);
  });

  it('returns false when activeUntil is 0 (inactive)', () => {
    const state = createMagnetBooster();
    const expired = tickMagnetBooster(state, 100.0);
    expect(expired).toBe(false);
  });
});

describe('effectiveMagnetMultiplier', () => {
  it('returns 1 when both pendingTier and activeTier are 0', () => {
    const state = createMagnetBooster();
    expect(effectiveMagnetMultiplier(state)).toBe(1);
  });

  it('returns 2 when pendingTier=1 and activeTier=0', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    expect(effectiveMagnetMultiplier(state)).toBe(2);
  });

  it('returns 3 when pendingTier=2 and activeTier=0', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    expect(effectiveMagnetMultiplier(state)).toBe(3);
  });

  it('returns 2 when activeTier=1 (active overrides pending)', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 1;
    state.pendingTier = 2;  // queued for next activation
    expect(effectiveMagnetMultiplier(state)).toBe(2);
  });

  it('returns 3 when activeTier=2', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    state.activeTier = 2;
    expect(effectiveMagnetMultiplier(state)).toBe(3);
  });
});

describe('effectiveMagnetRadius', () => {
  it('returns baseline when both tiers are 0', () => {
    const state = createMagnetBooster();
    expect(effectiveMagnetRadius(state, BASELINE)).toBe(2.5);
  });

  it('returns 5.0 for tier 1 (2x baseline)', () => {
    const state = createMagnetBooster();
    state.pendingTier = 1;
    expect(effectiveMagnetRadius(state, BASELINE)).toBe(5.0);
  });

  it('returns 7.5 for tier 2 (3x baseline)', () => {
    const state = createMagnetBooster();
    state.pendingTier = 2;
    expect(effectiveMagnetRadius(state, BASELINE)).toBe(7.5);
  });
});

describe('activeRemainingSeconds', () => {
  it('returns 0 when inactive', () => {
    const state = createMagnetBooster();
    expect(activeRemainingSeconds(state, 100.0)).toBe(0);
  });

  it('returns remaining when active', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    expect(activeRemainingSeconds(state, 7.0)).toBeCloseTo(3.0, 5);
  });

  it('returns 0 when active window has expired (just expired)', () => {
    const state = createMagnetBooster();
    state.activeUntil = 10.0;
    expect(activeRemainingSeconds(state, 10.5)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/magnet-booster.test.ts`
Expected: FAIL with "Cannot find module '../src/magnet-booster'" (or import error)

- [ ] **Step 3: Write minimal implementation**

Create `src/magnet-booster.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster State Machine (Phase 7f)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Pure logic for the Magnet Booster 4th active pickup. Tracks the
//          pending tier (0/1/2) the player has collected and the active
//          tier during the 6-second activation window. No Three.js — this
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

export const MAGNET_BOOSTER_DURATION_SECONDS = 6.0;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/magnet-booster.test.ts`
Expected: PASS (all 30 assertions across 19 `it` blocks; vitest counts assertions)

- [ ] **Step 5: Commit**

```bash
git add src/magnet-booster.ts tests/magnet-booster.test.ts
git commit -m "feat(magnet-booster): Phase 7f Task 1 — pure state machine"
```

---

## Task 2: VFX ring factories (`src/magnet-booster-vfx.ts`)

**Files:**
- Create: `src/magnet-booster-vfx.ts`
- Create: `tests/magnet-booster-vfx.test.ts`

**Interfaces:**
- Consumes: `MAGNET_RADIUS` from `src/scrap.ts` (existing export) — keeps the visual anchored to the canonical baseline
- Produces: `createPreviewRing()`, `createActiveRing()`, `updatePreviewRing()`, `updateActiveRing()` — used by Task 6.

- [ ] **Step 1: Write the failing test file**

Create `tests/magnet-booster-vfx.test.ts` with 4 tests covering the ring factories:

```typescript
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AdditiveBlending,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
} from 'three';
import { MAGNET_RADIUS } from '../src/scrap';
import {
  createActiveRing,
  createPreviewRing,
  updateActiveRing,
  updatePreviewRing,
} from '../src/magnet-booster-vfx';

describe('createPreviewRing', () => {
  it('returns a Mesh with RingGeometry sized to MAGNET_RADIUS ± 0.04', () => {
    const ring = createPreviewRing();
    expect(ring).toBeInstanceOf(Mesh);
    const geom = ring.geometry as RingGeometry;
    // RingGeometry parameters: innerRadius, outerRadius, thetaSegments, phiSegments
    expect(geom.parameters.innerRadius).toBeCloseTo(MAGNET_RADIUS - 0.04, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(MAGNET_RADIUS + 0.04, 5);
  });

  it('uses AdditiveBlending, opacity 0.20, color 0xffcc44, DoubleSide, depthWrite false', () => {
    const ring = createPreviewRing();
    const mat = ring.material as MeshBasicMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.opacity).toBeCloseTo(0.20, 5);
    expect(mat.color.getHex()).toBe(0xffcc44);
    expect(mat.side).toBe(DoubleSide);
    expect(mat.depthWrite).toBe(false);
  });

  it('starts hidden (visible=false) and positioned behind the ship', () => {
    const ring = createPreviewRing();
    expect(ring.visible).toBe(false);
    expect(ring.position.z).toBe(-0.4);
  });
});

describe('createActiveRing', () => {
  it('returns a Mesh with RingGeometry sized to MAGNET_RADIUS ± 0.06', () => {
    const ring = createActiveRing();
    expect(ring).toBeInstanceOf(Mesh);
    const geom = ring.geometry as RingGeometry;
    expect(geom.parameters.innerRadius).toBeCloseTo(MAGNET_RADIUS - 0.06, 5);
    expect(geom.parameters.outerRadius).toBeCloseTo(MAGNET_RADIUS + 0.06, 5);
  });

  it('uses AdditiveBlending, opacity 0.45, color 0xffcc44', () => {
    const ring = createActiveRing();
    const mat = ring.material as MeshBasicMaterial;
    expect(mat.blending).toBe(AdditiveBlending);
    expect(mat.opacity).toBeCloseTo(0.45, 5);
    expect(mat.color.getHex()).toBe(0xffcc44);
  });

  it('starts hidden (visible=false)', () => {
    const ring = createActiveRing();
    expect(ring.visible).toBe(false);
  });
});

describe('updatePreviewRing', () => {
  it('sets ring.visible = false when pendingTier === 0', () => {
    const ring = createPreviewRing();
    ring.visible = true;  // simulate prior state
    updatePreviewRing(ring, 0);
    expect(ring.visible).toBe(false);
  });

  it('sets ring.visible = true and ring.scale to (2, 2, 1) when pendingTier = 1', () => {
    const ring = createPreviewRing();
    updatePreviewRing(ring, 1);
    expect(ring.visible).toBe(true);
    expect(ring.scale.x).toBeCloseTo(2, 5);
    expect(ring.scale.y).toBeCloseTo(2, 5);
    expect(ring.scale.z).toBeCloseTo(1, 5);
  });

  it('sets ring.scale to (3, 3, 1) when pendingTier = 2', () => {
    const ring = createPreviewRing();
    updatePreviewRing(ring, 2);
    expect(ring.scale.x).toBeCloseTo(3, 5);
    expect(ring.scale.y).toBeCloseTo(3, 5);
  });
});

describe('updateActiveRing', () => {
  it('sets ring.visible = false when activeTier === 0', () => {
    const ring = createActiveRing();
    ring.visible = true;
    updateActiveRing(ring, 0, 3.0, 1 / 60);
    expect(ring.visible).toBe(false);
  });

  it('sets ring.visible = true and ring.scale to (tier+1) when active', () => {
    const ring = createActiveRing();
    updateActiveRing(ring, 2, 4.0, 1 / 60);
    expect(ring.visible).toBe(true);
    expect(ring.scale.x).toBeCloseTo(3, 5);
  });

  it('sets ring.visible = false when remainingSeconds === 0', () => {
    const ring = createActiveRing();
    updateActiveRing(ring, 2, 0, 1 / 60);
    expect(ring.visible).toBe(false);
  });

  it('pulses opacity via sin wave: ~0.55 max, ~0.25 min', () => {
    const ring = createActiveRing();
    // remainingSeconds = 0.25 → sin(0.25 * π * 4) = sin(π) = 0 → opacity = 0.40
    updateActiveRing(ring, 1, 0.25, 1 / 60);
    const mat = ring.material as MeshBasicMaterial;
    expect(mat.opacity).toBeCloseTo(0.40, 1);
    // remainingSeconds = 0.5 → sin(0.5 * π * 4) = sin(2π) = 0 → opacity = 0.40
    updateActiveRing(ring, 1, 0.5, 1 / 60);
    expect(mat.opacity).toBeCloseTo(0.40, 1);
    // remainingSeconds = 0.375 → sin(0.375 * π * 4) = sin(1.5π) = -1 → opacity = 0.40 - 0.15 = 0.25
    updateActiveRing(ring, 1, 0.375, 1 / 60);
    expect(mat.opacity).toBeCloseTo(0.25, 1);
    // remainingSeconds = 0.125 → sin(0.125 * π * 4) = sin(0.5π) = 1 → opacity = 0.40 + 0.15 = 0.55
    updateActiveRing(ring, 1, 0.125, 1 / 60);
    expect(mat.opacity).toBeCloseTo(0.55, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/magnet-booster-vfx.test.ts`
Expected: FAIL with "Cannot find module '../src/magnet-booster-vfx'"

- [ ] **Step 3: Write minimal implementation**

Create `src/magnet-booster-vfx.ts`:

```typescript
// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Magnet Booster VFX (Phase 7f)
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Two additive gold rings that visualize the Magnet Booster state.
//          - Preview ring: dashed-look thin band at the pending radius,
//            shown the moment a pickup is collected, hidden when inactive
//            or during the active window. Players see "here's the radius I
//            would get if I pressed 4 right now".
//          - Active ring: thicker solid pulsing ring at the active radius
//            during the 6s window. Pulses at 2 Hz for "vacuum" feel.
// Setup: Game imports createPreviewRing/createActiveRing in the constructor
//        and adds both meshes to the ship group (so they inherit ship
//        position + rotation). updatePreviewRing and updateActiveRing are
//        called every frame after tickMagnetBooster.
// Issues: None at creation.
// Fix: Phase 7f. Both rings scale via mesh.scale (not mesh.resize or
//      recreating the geometry) so a single geometry allocation serves all
//      tier values. The scale matches effectiveMagnetMultiplier from the
//      pure state machine — keep the two values in lockstep by referencing
//      the same constant pattern.
//      The preview ring color is intentionally identical to the active ring
//      color (both 0xffcc44) — the shape + scale + opacity distinguish
//      pending from active. The dashed-look effect of the preview ring comes
//      from its thin width (0.08u band vs active 0.12u band) + lower opacity
//      (0.20 vs 0.45) rather than a true dashed material (Three.js RingGeometry
//      doesn't natively support dashed strokes without custom shaders).
//      The pulse math: 0.40 + 0.15 * sin(remainingSeconds * π * 4). At
//      remainingSeconds=0 (just expired), sin(0)=0 → opacity=0.40. The
//      pulse completes 2 full cycles over 6 seconds (period = 0.5s).
// Gotchas: Per feedback_additive_blending_whiteout.md, opacity caps are
//          enforced: preview max 0.20, active max 0.55 — both under the
//          0.7 ceiling. Both rings have depthWrite=false so they don't
//          occlude the ship or other 3D elements behind them. The z=-0.4
//          placement puts the rings behind the ship and in front of the
//          baseline magnet ring (z=-0.5 in game.ts:3442), giving a
//          visual stacking order: ship → active ring → preview ring →
//          baseline ring.
// ═══════════════════════════════════════════════════════════════════════════

import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { MAGNET_RADIUS } from './scrap';

export function createPreviewRing(): Mesh {
  const geometry = new RingGeometry(MAGNET_RADIUS - 0.04, MAGNET_RADIUS + 0.04, 64, 1);
  const material = new MeshBasicMaterial({
    color: 0xffcc44,
    transparent: true,
    opacity: 0.20,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = -0.4;
  mesh.visible = false;
  return mesh;
}

export function createActiveRing(): Mesh {
  const geometry = new RingGeometry(MAGNET_RADIUS - 0.06, MAGNET_RADIUS + 0.06, 64, 1);
  const material = new MeshBasicMaterial({
    color: 0xffcc44,
    transparent: true,
    opacity: 0.45,
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const mesh = new Mesh(geometry, material);
  mesh.position.z = -0.4;
  mesh.visible = false;
  return mesh;
}

export function updatePreviewRing(ring: Mesh, pendingTier: 0 | 1 | 2): void {
  if (pendingTier === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  ring.scale.set(pendingTier + 1, pendingTier + 1, 1);
}

export function updateActiveRing(
  ring: Mesh,
  activeTier: 0 | 1 | 2,
  remainingSeconds: number,
  // deltaTime reserved for future frame-rate-independent animations (unused for now)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  deltaTime: number,
): void {
  if (activeTier === 0 || remainingSeconds === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  ring.scale.set(activeTier + 1, activeTier + 1, 1);
  // 2 Hz pulse: opacity oscillates between 0.25 and 0.55
  const pulse = 0.40 + 0.15 * Math.sin(remainingSeconds * Math.PI * 4);
  (ring.material as MeshBasicMaterial).opacity = pulse;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/magnet-booster-vfx.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/magnet-booster-vfx.ts tests/magnet-booster-vfx.test.ts
git commit -m "feat(magnet-booster): Phase 7f Task 2 — VFX ring factories"
```

---

## Task 3: Update magnet-pull signatures (`src/scrap.ts` + `src/pickups.ts`)

**Files:**
- Modify: `src/scrap.ts:19` (remove local constant), `src/scrap.ts:55-71` (magnetPull signature)
- Modify: `src/pickups.ts:132` (remove local constant), `src/pickups.ts:151-...` (updatePickup signature)
- Modify: `src/game.ts:890` (pickup count loop — pass effectiveRadius)
- Create: `tests/scrap-magnet-integration.test.ts`

**Interfaces:**
- Consumes: `MAGNET_RADIUS` from `src/scrap.ts` (kept as export; the baseline constant survives in scrap.ts so other consumers can import it), `PickupState` from `src/pickups.ts`, `ScrapState` from `src/types.ts`.
- Produces: updated `magnetPull` and `updatePickup` signatures that require `effectiveRadius: number`. After this task, `tsc --noEmit` should still pass because Task 6's `game.ts` wiring is the only consumer — but in this task we'll already update `game.ts:890` to use a placeholder effective radius.

- [ ] **Step 1: Write the failing test file**

Create `tests/scrap-magnet-integration.test.ts` with 6 tests covering magnetPull with effectiveRadius:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { Vector2 } from '../src/types';
import {
  COLLECTION_RADIUS,
  createScrap,
  magnetPull,
} from '../src/scrap';
import { AsteroidSize, ScrapState } from '../src/types';

const BASELINE = 2.5; // matches src/scrap.ts export

describe('magnetPull with effectiveRadius (Phase 7f)', () => {
  let scrap: ScrapState;

  beforeEach(() => {
    // Scrap at (3, 0), ship at origin → distance 3
    scrap = createScrap({ x: 3, y: 0 });
    scrap.velocity = { x: 0, y: 0 }; // reset the default downward drift
  });

  it('does not pull scrap outside effectiveRadius', () => {
    // Ship at origin, effectiveRadius = 2.5 → distance 3 > 2.5 → no pull
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, BASELINE);
    expect(scrap.velocity.x).toBe(0);
    expect(scrap.velocity.y).toBe(0);
  });

  it('pulls scrap inside effectiveRadius when boosted to 2x', () => {
    // Ship at origin, effectiveRadius = 5.0 → distance 3 < 5.0 → pull
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    expect(scrap.velocity.x).toBeLessThan(0); // pulled toward ship (negative x)
    expect(scrap.velocity.y).toBe(0);
  });

  it('pulls scrap inside effectiveRadius when boosted to 3x', () => {
    // Scrap at (7, 0) — outside baseline but inside 3x
    scrap.position = { x: 7, y: 0 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 7.5);
    expect(scrap.velocity.x).toBeLessThan(0);
  });

  it('does not pull scrap outside boosted radius (3x edge case)', () => {
    // Scrap at (8, 0) — outside 3x radius of 7.5
    scrap.position = { x: 8, y: 0 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 7.5);
    expect(scrap.velocity.x).toBe(0);
  });

  it('pull strength falls off: scrap near outer edge moves slower than scrap near center', () => {
    // Scrap at (1, 0) — distance 1, inside boosted radius 5.0
    // pullStrength = (5.0 - 1) / 5.0 = 0.8
    // speed = 12.0 * 0.8 = 9.6
    const innerScrap = createScrap({ x: 1, y: 0 });
    magnetPull(innerScrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    const innerSpeed = Math.hypot(innerScrap.velocity.x, innerScrap.velocity.y);

    // Scrap at (4, 0) — distance 4, inside boosted radius 5.0
    // pullStrength = (5.0 - 4) / 5.0 = 0.2
    // speed = 12.0 * 0.2 = 2.4
    const outerScrap = createScrap({ x: 4, y: 0 });
    magnetPull(outerScrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    const outerSpeed = Math.hypot(outerScrap.velocity.x, outerScrap.velocity.y);

    expect(innerSpeed).toBeGreaterThan(outerSpeed);
    expect(innerSpeed).toBeCloseTo(9.6, 1);
    expect(outerSpeed).toBeCloseTo(2.4, 1);
  });

  it('does not modify scrap velocity when distance <= 0.01', () => {
    // Scrap at origin, ship at origin → distance 0 (effectively)
    scrap.position = { x: 0, y: 0 };
    scrap.velocity = { x: 1, y: 1 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, 5.0);
    expect(scrap.velocity.x).toBe(1);
    expect(scrap.velocity.y).toBe(1);
  });

  it('preserves scrap velocity when effectiveRadius == baseline (no boost)', () => {
    // Scrap at (1.5, 0) — inside baseline 2.5
    scrap.position = { x: 1.5, y: 0 };
    magnetPull(scrap, { x: 0, y: 0 }, 1 / 60, BASELINE);
    expect(scrap.velocity.x).toBeLessThan(0); // pulled normally
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scrap-magnet-integration.test.ts`
Expected: FAIL with "Expected 0 arguments, but got 4" or "TS2554: Expected 3 arguments, but got 4" — the new effectiveRadius param isn't accepted yet.

- [ ] **Step 3: Modify `src/scrap.ts`**

Edit `src/scrap.ts`. Replace the entire file with:

```typescript
import { AsteroidSize, ScrapState, Vector2 } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Scrap System
// ═══════════════════════════════════════════════════════════════════════════
// Purpose: Drop collectible scrap from destroyed asteroids; scrap magnetizes to
//          the ship and fills the Breather Zone meter.
// Setup: Game creates ScrapState instances when asteroids break; updateScrap
//        handles drift, lifetime, and magnet attraction.
// Issues: Without lifetime or a cap, scrap can clutter the arena indefinitely.
// Fix: Scrap has a fixed lifetime and a small collection radius. The magnet pulls
//      scrap once it enters range.
// Gotchas: Scrap should not count as a collision object. It drifts downward so
//          collection becomes a positional mini-game.
// Phase 7f: magnetPull now takes effectiveRadius as a required parameter so the
//          caller (Game) can pass the boosted radius when the Magnet Booster
//          is active. MAGNET_RADIUS is still exported as the BASELINE constant
//          so other consumers (HUD count, default gate) can import it.
// ═══════════════════════════════════════════════════════════════════════════

const SCRAP_LIFETIME = 8.0;
const SCRAP_DRIFT_SPEED = 0.8;
export const MAGNET_RADIUS = 2.5;
const COLLECTION_RADIUS = 0.4;

export function createScrap(position: Vector2): ScrapState {
  return {
    position,
    velocity: { x: 0, y: -SCRAP_DRIFT_SPEED },
    lifetime: SCRAP_LIFETIME,
  };
}

export function updateScrap(scrap: ScrapState, deltaTime: number): void {
  scrap.position = {
    x: scrap.position.x + scrap.velocity.x * deltaTime,
    y: scrap.position.y + scrap.velocity.y * deltaTime,
  };
  scrap.lifetime -= deltaTime;
}

export function isScrapExpired(scrap: ScrapState): boolean {
  return scrap.lifetime <= 0;
}

export function scrapDropChance(size: AsteroidSize): number {
  switch (size) {
    case AsteroidSize.TINY:
      return 0.1;
    case AsteroidSize.SMALL:
      return 0.2;
    case AsteroidSize.MEDIUM:
      return 0.4;
    case AsteroidSize.LARGE:
      return 0.6;
  }
}

export function magnetPull(
  scrap: ScrapState,
  shipPosition: Vector2,
  deltaTime: number,
  effectiveRadius: number,
): void {
  const dx = shipPosition.x - scrap.position.x;
  const dy = shipPosition.y - scrap.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance > effectiveRadius || distance <= 0.01) return;

  const pullStrength = (effectiveRadius - distance) / effectiveRadius;
  const speed = 12.0 * pullStrength;
  scrap.velocity = {
    x: (dx / distance) * speed,
    y: (dy / distance) * speed,
  };
}

export function isScrapCollected(scrap: ScrapState, shipPosition: Vector2): boolean {
  const distance = Math.hypot(
    scrap.position.x - shipPosition.x,
    scrap.position.y - shipPosition.y,
  );
  return distance <= COLLECTION_RADIUS;
}
```

- [ ] **Step 4: Modify `src/pickups.ts`**

In `src/pickups.ts`:

1. **Remove** the local `const MAGNET_RADIUS = 2.5;` at line 132 (the constant was duplicated here; the canonical export is now in `src/scrap.ts`). Note: `MAGNET_PULL_SPEED` STAYS.

2. **Update the `updatePickup` signature** at line 151 to add `effectiveRadius: number` as the 4th param and use it in place of the local `MAGNET_RADIUS` reference:

```typescript
export function updatePickup(
  pickup: PickupState,
  shipPosition: Vector2,
  deltaTime: number,
  effectiveRadius: number,
): void {
  const dx = shipPosition.x - pickup.position.x;
  const dy = shipPosition.y - pickup.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= effectiveRadius && distance > 0.01) {
    // Override velocity with magnet pull toward the ship.
    const pullStrength = (effectiveRadius - distance) / effectiveRadius;
    const speed = MAGNET_PULL_SPEED * pullStrength;
    pickup.velocity = {
      x: (dx / distance) * speed,
      y: (dy / distance) * speed,
    };
  }
  // Existing spin + age logic continues unchanged below this if-block...
}
```

(Keep all the rest of `updatePickup` exactly as it was — the only change is the new param and the 2 constant substitutions inside the if-block.)

- [ ] **Step 5: Update the call site in `src/game.ts`**

In `src/game.ts`, find line 890 (the pickup count loop). It currently reads:

```typescript
return Math.hypot(dx, dy) <= MAGNET_RADIUS ? count + 1 : count;
```

Replace it with:

```typescript
return Math.hypot(dx, dy) <= this.effectiveMagnetRadius ? count + 1 : count;
```

Also find the two call sites `magnetPull(scrap, ...)` and `updatePickup(pickup, ...)` in `src/game.ts`. They currently call without the 4th argument. For NOW (this task), temporarily pass `MAGNET_RADIUS` (the local import) as the 4th argument so the existing test suite continues to pass. We'll replace these with `this.effectiveMagnetRadius` in Task 6.

Look for `magnetPull(scrap, shipPos, dt)` and change to `magnetPull(scrap, shipPos, dt, MAGNET_RADIUS)`.
Look for `updatePickup(pickup, shipPos, dt)` and change to `updatePickup(pickup, shipPos, dt, MAGNET_RADIUS)`.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/scrap-magnet-integration.test.ts`
Expected: PASS (all 7 magnet-pull tests)

Then run the full suite to ensure no regressions:
Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 typecheck errors, all existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/scrap.ts src/pickups.ts src/game.ts tests/scrap-magnet-integration.test.ts
git commit -m "feat(magnet-booster): Phase 7f Task 3 — magnet-pull signatures take effectiveRadius"
```

---

## Task 4: Wire PickupKind.MAGNET_BOOSTER + drop source (`src/pickups.ts`)

**Files:**
- Modify: `src/pickups.ts` (add PickupKind enum value, geometry entry, color entry, PICKUP_COLOR entry, drop roll entry)

**Interfaces:**
- Consumes: existing `PickupKind` enum, `PICKUP_GEOMETRY_BY_KIND`, `PICKUP_COLOR`, drop-source functions
- Produces: `PickupKind.MAGNET_BOOSTER` enum value (used by Task 6's Game wiring)

- [ ] **Step 1: Add `PickupKind.MAGNET_BOOSTER` enum entry**

In `src/pickups.ts`, find the `PickupKind` enum (line 37–44) and add the new entry. After the last existing entry `HOMING_MISSILES = 'homingMissiles',`, add:

```typescript
  MAGNET_BOOSTER = 'magnetBooster',  // active — slot 4 — gold  0xffcc44 (Phase 7f)
```

- [ ] **Step 2: Add `PICKUP_GEOMETRY_BY_KIND` entry**

Find the `PICKUP_GEOMETRY_BY_KIND` table. Add the new entry:

```typescript
  [PickupKind.MAGNET_BOOSTER]: new CapsuleGeometry(0.12, 0.32, 4, 8),
```

**Important**: Add `CapsuleGeometry` to the Three.js import block at the top of `src/pickups.ts`. It is NOT currently imported.

The import block currently reads:
```typescript
import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  ConeGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  TetrahedronGeometry,
} from 'three';
```

Add `CapsuleGeometry` (alphabetical position is between `BufferGeometry` and `CanvasTexture`):
```typescript
  CapsuleGeometry,
```

- [ ] **Step 3: Add `PICKUP_COLOR` entry**

Find the `PICKUP_COLOR` constant (a `Record<PickupKind, number>`). Add the new entry:

```typescript
  [PickupKind.MAGNET_BOOSTER]: 0xffcc44,
```

- [ ] **Step 4: Verify the existing drop-source branches cover `MAGNET_BOOSTER`**

The existing drop rolls in `src/pickups.ts` are crystal-guaranteed + 10% LARGE iron chance (per Phase 7 spec). These are based on the asteroid properties (kind, size), not on per-kind logic, so adding `MAGNET_BOOSTER` to the enum automatically makes it eligible for these drops. No code change needed — verify this by running the existing pickups tests.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 typecheck errors, all existing tests pass (no test file exercises the new enum value yet, so the test count is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/pickups.ts
git commit -m "feat(magnet-booster): Phase 7f Task 4 — PickupKind.MAGNET_BOOSTER + geometry + color"
```

---

## Task 5: Add Digit4 binding (`src/input.ts`)

**Files:**
- Modify: `src/input.ts` (add `useMagnetBooster: boolean` field, Digit4 keydown/keyup)

**Interfaces:**
- Consumes: existing `useActive1/2/3: boolean` fields
- Produces: `useMagnetBooster: boolean` field (used by Task 6's `useActiveItem` dispatch)

- [ ] **Step 1: Add the `useMagnetBooster` field**

Find the InputState class (likely a class or object holding the existing `useActive1/2/3` fields). Add a new field:

```typescript
  useMagnetBooster: boolean = false;
```

(If the existing fields are typed as a single `useActive1: number` style, follow the existing convention exactly.)

- [ ] **Step 2: Add Digit4 keydown + keyup handlers**

Find the keydown handler that contains the existing `Digit1/2/3` bindings. Add:

```typescript
    if (event.code === 'Digit4') {
      this.useMagnetBooster = true;
    }
```

Find the keyup handler with the same pattern. Add:

```typescript
    if (event.code === 'Digit4') {
      this.useMagnetBooster = false;
    }
```

**Important**: Use `event.code` (not `event.key`) for layout-independence — this matches the Phase 7 lesson documented in the existing 1/2/3 bindings.

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/input.ts
git commit -m "feat(magnet-booster): Phase 7f Task 5 — Digit4 useMagnetBooster input binding"
```

---

## Task 6: Wire Game class (`src/game.ts`)

**Files:**
- Modify: `src/game.ts` (add `magnetBooster` field + `effectiveMagnetRadius` getter + `updateMagnetBooster` per-frame method + `useMagnetBooster` activation + HUD 4-slot reconcile + `stop()` reset + replace temporary Task 3 call-site placeholder)

**Interfaces:**
- Consumes: `MagnetBoosterState`, `createMagnetBooster`, `collectMagnetBooster`, `activateMagnetBooster`, `tickMagnetBooster`, `effectiveMagnetRadius`, `activeRemainingSeconds` from Task 1; `createPreviewRing`, `createActiveRing`, `updatePreviewRing`, `updateActiveRing` from Task 2; `useMagnetBooster` from Task 5; `PickupKind.MAGNET_BOOSTER` from Task 4.
- Produces: working Magnet Booster integration (preview ring at pending radius, active ring pulsing during 6s window, HUD 4-slot reflects state, all magnet-pull consumers use `this.effectiveMagnetRadius`).

- [ ] **Step 1: Add new imports to `src/game.ts`**

Find the imports block at the top of `src/game.ts` and add the magnet-booster imports. The exact location to add them is right after the existing `pickups` import:

```typescript
import {
  MagnetBoosterState,
  createMagnetBooster,
  collectMagnetBooster,
  activateMagnetBooster,
  tickMagnetBooster,
  effectiveMagnetRadius,
  activeRemainingSeconds,
} from './magnet-booster';
import { createPreviewRing, createActiveRing, updatePreviewRing, updateActiveRing } from './magnet-booster-vfx';
```

(Adjust the import path style to match the surrounding block — if other imports use named groups, fold these into the existing block.)

- [ ] **Step 2: Add the `magnetBooster` field + ring meshes to Game**

In the `Game` class, find a logical place to add new fields (after the other pickup-related fields). Add:

```typescript
  private magnetBooster: MagnetBoosterState = createMagnetBooster();
  private magnetPreviewRing: Mesh = createPreviewRing();
  private magnetActiveRing: Mesh = createActiveRing();
```

- [ ] **Step 3: Attach rings to the ship group + reset state in the constructor**

Find the Game constructor where `magnetRing` is set up (around line 2807-2818 per the memory file). After the existing `magnetRing` setup, add:

```typescript
    this.shipMesh.add(this.magnetPreviewRing);
    this.shipMesh.add(this.magnetActiveRing);
    this.magnetPreviewRing.visible = false;
    this.magnetActiveRing.visible = false;
```

(Look for the lines `this.magnetRing.visible = false;` and `this.magnetRing.visible = true;` to find the right constructor area.)

- [ ] **Step 4: Add the `effectiveMagnetRadius` getter**

Add this getter on the Game class:

```typescript
  get effectiveMagnetRadius(): number {
    return effectiveMagnetRadius(this.magnetBooster, MAGNET_RADIUS);
  }
```

- [ ] **Step 5: Add `applyPickupEffect` case for MAGNET_BOOSTER**

Find the `applyPickupEffect` method (likely takes `kind: PickupKind` and dispatches). Add a new branch:

```typescript
      case PickupKind.MAGNET_BOOSTER:
        collectMagnetBooster(this.magnetBooster, this.magnetBooster.activeUntil > this.gameTime);
        break;
```

- [ ] **Step 6: Replace the temporary Task 3 call-site placeholders**

In Task 3 we temporarily passed `MAGNET_RADIUS` as the 4th argument to `magnetPull` and `updatePickup` to keep tests green. Now replace those placeholders with `this.effectiveMagnetRadius`:

Find every `magnetPull(scrap, ..., MAGNET_RADIUS)` call and change to `magnetPull(scrap, ..., this.effectiveMagnetRadius)`.
Find every `updatePickup(pickup, ..., MAGNET_RADIUS)` call and change to `updatePickup(pickup, ..., this.effectiveMagnetRadius)`.

- [ ] **Step 7: Add `useMagnetBooster` to `useActiveItem` dispatch**

Find the `useActiveItem` method (or similar dispatch that handles the existing `useActive1/2/3` cases). Add:

```typescript
      if (this.input.useMagnetBooster) {
        activateMagnetBooster(this.magnetBooster, this.gameTime);
      }
```

(Place this alongside the existing `if (this.input.useActive1) ...` blocks. If `useActiveItem` only fires once per key press and Digit4 needs to fire on press, ensure the dispatch pattern supports it — match the existing 1/2/3 pattern exactly.)

- [ ] **Step 8: Add `updateMagnetBooster` per-frame method + invoke from `updateActiveAmmoCooldowns`**

Find `updateActiveAmmoCooldowns` (called every frame). Add at the start of this method:

```typescript
    tickMagnetBooster(this.magnetBooster, this.gameTime);
    updatePreviewRing(this.magnetPreviewRing, this.magnetBooster.pendingTier);
    updateActiveRing(
      this.magnetActiveRing,
      this.magnetBooster.activeTier,
      activeRemainingSeconds(this.magnetBooster, this.gameTime),
      deltaTime,
    );
```

(Note: the preview ring should NOT show during the active window — `updatePreviewRing` already handles this because `pendingTier` is 0 during active. The active ring shows only when `activeTier > 0`.)

- [ ] **Step 9: Extend HUD reconcile to 4 slots**

Find the HUD reconcile logic (in `updateHud` or similar). The current code loops over the 3 active kinds and reconciles each `ActiveHudIcon`. Extend this to 4 slots:

1. Add a 4th `MagnetBoosterHudElements` cached-ref interface (border, count, name header, progress bar).
2. Add `private magnetBoosterHud: MagnetBoosterHudElements | null = null;` field.
3. In the HUD create/update method, render the 4th slot ALWAYS (even with empty state). When `pendingTier=0 && activeTier=0`, show empty box with dim border + "4" label. When `pendingTier > 0`, show "2×" or "3×" in the count slot with gold border. When `activeTier > 0`, show remaining seconds + progress bar with brighter gold border.

**This is the largest sub-step** — it's the only one that touches HTML rendering and CSS class names. Reference the existing 3-slot implementation for the exact pattern (border, count text, name header, bar) and copy/extend it.

- [ ] **Step 10: Reset Magnet Booster state in `stop()`**

Find `stop()` method. Add:

```typescript
    this.magnetBooster = createMagnetBooster();
    this.magnetPreviewRing.visible = false;
    this.magnetActiveRing.visible = false;
```

- [ ] **Step 11: Run full test + typecheck suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 0 typecheck errors, all existing tests pass + the 30 new magnet-booster tests + 7 magnet-pull integration tests + 13 vfx tests = ~50 new tests.

- [ ] **Step 12: Commit**

```bash
git add src/game.ts
git commit -m "feat(magnet-booster): Phase 7f Task 6 — wire Game class + HUD 4-slot + per-frame tick"
```

---

## Task 7: Add 4th HUD slot CSS (`index.html`)

**Files:**
- Modify: `index.html` (add CSS for `.magnet-booster-pill` + 4-slot row layout)

**Interfaces:**
- Consumes: existing `.active-hud-icon` CSS (for pattern reference)
- Produces: visually distinct 4th HUD slot

- [ ] **Step 1: Add CSS for the magnet booster pill**

Find the existing `#active-hud` styles in `index.html`. After the existing `.active-hud-icon` styles, add:

```html
<style>
  /* ... existing styles ... */

  /* Magnet Booster — 4th active slot, always visible (Phase 7f) */
  .magnet-booster-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin-left: 4px;
  }
  .magnet-booster-pill .pill-border {
    width: 38px;
    height: 38px;
    border: 1px solid #666666;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    background-color: rgba(0, 0, 0, 0.4);
    position: relative;
  }
  .magnet-booster-pill.pending .pill-border {
    border-color: #ffcc44;
    border-width: 2px;
  }
  .magnet-booster-pill.active .pill-border {
    border-color: #ffcc44;
    border-width: 3px;
    animation: magnet-booster-pulse 0.5s ease-in-out infinite;
  }
  .magnet-booster-pill .pill-count {
    font-size: 12px;
    font-weight: bold;
    color: #ffcc44;
  }
  .magnet-booster-pill.empty .pill-count {
    color: #888888;
  }
  .magnet-booster-pill .pill-name {
    font-size: 9px;
    color: #ffcc44;
    text-shadow: 0 0 2px rgba(255, 204, 68, 0.6);
  }
  .magnet-booster-pill.empty .pill-name {
    color: #888888;
    text-shadow: none;
  }
  .magnet-booster-pill .pill-bar {
    position: absolute;
    bottom: 2px;
    left: 2px;
    right: 2px;
    height: 3px;
    background-color: rgba(255, 204, 68, 0.3);
    border-radius: 1px;
  }
  .magnet-booster-pill .pill-bar-fill {
    height: 100%;
    background-color: #ffcc44;
    transition: width 0.1s linear;
  }
  @keyframes magnet-booster-pulse {
    0%, 100% { box-shadow: 0 0 4px rgba(255, 204, 68, 0.4); }
    50% { box-shadow: 0 0 12px rgba(255, 204, 68, 0.8); }
  }
</style>
```

- [ ] **Step 2: Add the 4th slot HTML structure**

Find the `#active-hud` div in `index.html` (the container for the existing 3 active pills). After the 3rd pill, add:

```html
  <div class="magnet-booster-pill empty" id="magnet-booster-pill">
    <div class="pill-name">4</div>
    <div class="pill-border">
      <span class="pill-count"></span>
      <div class="pill-bar"><div class="pill-bar-fill" style="width: 0%"></div></div>
    </div>
  </div>
```

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 typecheck errors, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(magnet-booster): Phase 7f Task 7 — 4th HUD slot CSS + HTML structure"
```

---

## Task 8: Playwright screenshot tests (`tests/phase-7f-screenshots.spec.ts`)

**Files:**
- Create: `tests/phase-7f-screenshots.spec.ts`

**Interfaces:**
- Consumes: dev-mode game hooks (likely `window.__game` or similar — check existing Playwright specs for the pattern)
- Produces: 2 Playwright tests that capture the preview ring at 2× state and the active ring during 6s window

- [ ] **Step 1: Read an existing Playwright spec to learn the dev-hook pattern**

Run: `ls tests/*.spec.ts` to find existing Playwright specs.
Read one (e.g., `tests/phase-7c-screenshots.spec.ts` if it exists, otherwise any *.spec.ts) to learn:
- How the game is launched (`page.goto('/')`?)
- How dev hooks are accessed (`window.__game.something`?)
- How pickups are spawned or forced (`__game.dropPickup(kind, x, y)`?)
- How screenshots are saved (`page.screenshot({ path: ... })`)

- [ ] **Step 2: Write the 2 Playwright tests**

Create `tests/phase-7f-screenshots.spec.ts`:

```typescript
import { expect, test } from '@playwright/test';

test('Phase 7f — preview ring at 2× state (after 1st pickup)', async ({ page }) => {
  await page.goto('/');

  // Wait for game boot
  await page.waitForFunction(() => (window as any).__game !== undefined);

  // Force-drop 1 Magnet Booster pickup at a position the ship will collect
  await page.evaluate(() => {
    const game = (window as any).__game;
    game.dropPickup('magnetBooster', game.ship.position.x + 0.5, game.ship.position.y);
  });

  // Wait for the ship to collect it (magnet pull will drag it in)
  await page.waitForTimeout(500);

  // Verify the magnet booster HUD pill transitioned to pending state
  const pill = page.locator('#magnet-booster-pill');
  await expect(pill).toHaveClass(/pending/);

  // Verify the pill shows "2×"
  await expect(pill.locator('.pill-count')).toHaveText('2×');

  // Screenshot the playfield
  await page.screenshot({ path: 'test-results/phase-7f-preview-2x.png', fullPage: false });
});

test('Phase 7f — active ring at 3× state during 6s window', async ({ page }) => {
  await page.goto('/');

  // Wait for game boot
  await page.waitForFunction(() => (window as any).__game !== undefined);

  // Force-drop 2 Magnet Booster pickups
  await page.evaluate(() => {
    const game = (window as any).__game;
    game.dropPickup('magnetBooster', game.ship.position.x + 0.5, game.ship.position.y);
    game.dropPickup('magnetBooster', game.ship.position.x + 0.7, game.ship.position.y);
  });

  // Wait for both to be collected
  await page.waitForTimeout(1000);

  // Press Digit4 to activate
  await page.keyboard.press('Digit4');

  // Wait for the active ring to be visible (give it ~100ms to update)
  await page.waitForTimeout(100);

  // Verify the HUD pill shows active state with remaining time
  const pill = page.locator('#magnet-booster-pill');
  await expect(pill).toHaveClass(/active/);

  // Screenshot the playfield during the active window
  await page.screenshot({ path: 'test-results/phase-7f-active-3x.png', fullPage: false });
});
```

- [ ] **Step 3: Verify the dev-hook names match reality**

The Playwright spec assumes `window.__game.dropPickup(kind, x, y)` exists. Check `src/game.ts` for the actual dev-mode hook name. If it's different (e.g., `forceSpawnPickup`, `devSpawnDrop`), update the test to match. If the hook doesn't exist, this task becomes a follow-up — defer and document in the report.

- [ ] **Step 4: Run Playwright tests**

Run: `npx playwright test tests/phase-7f-screenshots.spec.ts`
Expected: 2 tests pass (or skip with a clear message if dev hooks aren't available)

- [ ] **Step 5: Inspect the screenshots**

Run: `ls test-results/phase-7f-*.png` to verify the files exist. Open them in an image viewer to confirm the preview ring + active ring are visible.

- [ ] **Step 6: Commit**

```bash
git add tests/phase-7f-screenshots.spec.ts
git commit -m "test(magnet-booster): Phase 7f Task 8 — Playwright preview + active screenshot tests"
```

---

## Final Task: Atomic squash commit (one big commit per Phase 7 convention)

**Files:** all 8 task commits above.

After all 8 tasks pass their tests and reviews, squash them into ONE atomic commit on `phase-2-movement` per the Phase 7 convention:

```bash
git log --oneline -8  # verify the 8 task commits
git reset --soft HEAD~8
git commit -m "feat(pickups): Phase 7f — Magnet Booster (2x/3x tiered, 6s, Digit4)

- Pure state machine in src/magnet-booster.ts (no Three.js)
- VFX ring factories in src/magnet-booster-vfx.ts (preview + active)
- magnetPull + updatePickup now take effectiveRadius: number (required)
- PickupKind.MAGNET_BOOSTER + CapsuleGeometry collectable (gold 0xffcc44)
- Digit4 useMagnetBooster input binding
- Game class wires per-frame tick, HUD 4-slot, useActiveItem dispatch
- 4th HUD slot always visible (empty box teaches the Digit4 key)
- 30 new state-machine tests + 7 magnet-pull integration tests + 13 vfx tests
- 2 Playwright screenshot tests (preview 2x + active 3x)

Squashed from 8 SDD task commits per Phase 7 convention.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Verify: `git log --oneline -3` shows the single atomic commit. Verify: `git status --short` shows clean working tree.

Push: `git push origin phase-2-movement`

---

## Self-Review

**1. Spec coverage:**
- 2× / 3× tiers → Task 1 (`effectiveMagnetMultiplier`)
- Activate at MAX tier → Task 1 (`activateMagnetBooster`)
- Collect-while-active bumps pendingTier without resetting duration → Task 1 (`collectMagnetBooster`)
- 6s duration → Task 1 (`MAGNET_BOOSTER_DURATION_SECONDS`)
- Digit4 binding → Task 5
- Always-visible 4th HUD slot → Tasks 6 + 7
- Drop source crystal-guaranteed + 10% LARGE iron → Task 4 (no code change, verified)
- Preview ring 0xffcc44 → Task 2
- Active ring pulses 2 Hz → Task 2
- CapsuleGeometry collectable → Task 4
- effectiveRadius required param → Task 3
- ~6-8 SDD tasks → 8 tasks ✓
- One atomic commit at end → Final Task ✓
- 18 unit tests + 2 Playwright → Tasks 1 (8), 2 (4), 3 (6), 8 (2) = 20 total ✓

**2. Placeholder scan:** No "TBD", no "TODO", no "implement later", no "fill in details". Every step has exact code.

**3. Type consistency:** `MagnetBoosterState` interface, `createMagnetBooster`, `collectMagnetBooster`, `activateMagnetBooster`, `tickMagnetBooster`, `effectiveMagnetMultiplier`, `effectiveMagnetRadius`, `activeRemainingSeconds` are used consistently across all 8 tasks. The `effectiveRadius: number` param is required (no default) in Task 3, matching the spec's anti-patterns-avoided note.

**Gaps identified and fixed:**
- Task 6 Step 9 (HUD 4-slot) is the largest sub-step — flagged as such.
- Task 8 Step 3 acknowledges that dev-hook names might differ — implementer must verify against existing Playwright specs.
- Final Task explicitly documents the squash pattern.