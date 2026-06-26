---
name: phase-7f-magnet-booster-design
description: Phase 7f — Magnet Booster, a 4th active pickup (Digit4) that expands the ship's magnet ring for 6s; 2x then 3x tiers stack via repeat collection; preview ring shows pending radius before activation.
type: spec
---

# Phase 7f — Magnet Booster

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this spec task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th active pickup, Magnet Booster, that expands the ship's magnet ring for 6 seconds when activated via Digit4. Collecting 1 booster prepares the 2× tier; collecting a second prepares the 3× tier. A preview ring shows the pending radius even before activation so the player can decide when to commit.

**Architecture:** Two new modules (`src/magnet-booster.ts` pure logic, `src/magnet-booster-vfx.ts` visuals), one runtime radius (`effectiveMagnetRadius`) threaded into the existing magnet pull paths in `src/scrap.ts` and `src/pickups.ts`, one new HUD slot (always visible) in `src/game.ts`, one new input binding (`useMagnetBooster` on Digit4) in `src/input.ts`.

**Tech Stack:** Three.js r0.184.0, TypeScript strict, Vite, vitest (Node env, no DOM), Playwright for browser screenshots.

---

## Global Constraints

These bind every task in this spec. Verbatim from the user's brainstorm answers:

- **2 tiers**: 2× and 3× the baseline MAGNET_RADIUS (2.5u). The 2nd tier only reaches 3× if the 2nd pickup is collected.
- **Activation timing**: "Activate at MAX tier you've collected (3× if you stacked, 2× if you only have one)." A 2nd pickup NEVER upgrades the CURRENT active window — it queues for the next activation.
- **Collect-while-active**: "Extend — current 6s window continues at current tier, but if a new tier was collected, NEXT activation uses it." The active window's duration does NOT reset; the pending tier simply bumps.
- **Activation key**: Digit4. Extends the 1/2/3 active-key pattern.
- **HUD**: Always-visible 4th slot in the bottom-right active row. Empty when 0 pending (just shows "4" label + dim border) so the player learns the key exists.
- **Drop source**: Crystal-guaranteed + 10% LARGE iron chance — same as the existing 3 actives.
- **Activation duration**: 6 seconds. Non-negotiable.

Additional locked decisions:

- 2-space indent, single quotes, semicolons, max 100-char lines (matches project code-style.md).
- "My Rules" comment blocks on every non-trivial block (per CLAUDE.md).
- One big commit at end (matches Phase 7c convention).
- All existing tests must continue to pass.
- No new `require('three')` inline (per feedback_require_three_freeze.md).
- Additive opacity caps per feedback_additive_blending_whiteout.md (max per-source 0.55 for halo / 0.4 for sonar).
- No new dependencies.
- Preview ring color `0xffcc44` (gold) — extends the existing 0xffcc00 magnet ring identity.
- Active ring color `0xffcc44` (same gold) — pulses at 2 Hz for "active vacuum" feel.
- Magnet Booster collectable body: CapsuleGeometry (radius 0.12, length 0.32), gold color, vertical Y-axis spin. Distinct silhouette from the 6 existing pickups (only capsule shape in the family).

---

## Architecture

### File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `src/magnet-booster.ts` | NEW (~120 lines) | `MagnetBoosterState`, lifecycle helpers, effective radius math |
| `src/magnet-booster-vfx.ts` | NEW (~80 lines) | Preview ring factory, active ring factory, per-frame pulse |
| `src/pickups.ts` | MODIFY | Add `PickupKind.MAGNET_BOOSTER`, geometry entry, drop source entry, `applyPickupEffect` branch, drop source from `maybeDropPickup` |
| `src/scrap.ts` | MODIFY | Remove local `MAGNET_RADIUS` const, `magnetPull` takes `effectiveRadius: number` param |
| `src/pickups.ts` | MODIFY | `updatePickup` takes `effectiveRadius: number` param |
| `src/game.ts` | MODIFY | New `magnetBooster` field, `updateMagnetBooster` method, `updateMagnetHud` method, `effectiveMagnetRadius` getter, `useActiveItem` extended, 4-slot HUD reconcile, `useMagnetBooster` wiring |
| `src/input.ts` | MODIFY | Add `useMagnetBooster: boolean` field, Digit4 binding (event.code, not event.key) |
| `index.html` | MODIFY | CSS for `.magnet-booster-pill` + 4th active row slot |
| `tests/magnet-booster.test.ts` | NEW | 8 tests for state machine + lifecycle + effective radius |
| `tests/scrap-magnet-integration.test.ts` | NEW | 6 tests for `magnetPull` with effective radius |
| `tests/magnet-booster-vfx.test.ts` | NEW | 4 tests for ring factories (geometry sizes, material props) |
| `tests/phase-7f-screenshots.spec.ts` | NEW (Playwright) | 2 tests: preview ring at 2× state + active ring during 6s window |

### Data Flow

```
onPickupCollected(kind=MAGNET_BOOSTER, state):
  state.magnetBooster.pendingTier = min(pendingTier + 1, 2)
  if state.magnetBooster.activeUntil > gameTime:
    // already active — extend-while-active rule
    // active window keeps running at activeTier; do not reset duration
    return
  // preview ring will be drawn at next frame at the new pendingTier radius

onDigit4Pressed (and useMagnetBooster is true):
  if pendingTier === 0: return                  // nothing to activate
  if activeUntil > gameTime: return             // already active, don't waste
  activeUntil = gameTime + MAGNET_BOOSTER_DURATION_SECONDS
  activeTier = pendingTier
  pendingTier = 0
  // active ring appears at activeTier radius

perFrame:
  gameTime += dt
  if activeUntil > 0 and gameTime >= activeUntil:
    activeUntil = 0
    activeTier = 0
    // active ring disappears; if pendingTier > 0, preview ring returns

  // Compute effective radius once, share with all magnet consumers
  effectiveMagnetRadius = MAGNET_RADIUS * multiplier()

  // Scrap magnet pull
  for each scrap: magnetPull(scrap, ship.position, dt, effectiveMagnetRadius)

  // Pickup magnet pull
  for each pickup: updatePickup(pickup, ship.position, dt, effectiveMagnetRadius)

  // Pull all dropped scrap within count (HUD count of in-range scrap)
  // Uses effectiveMagnetRadius

  // VFX
  updatePreviewRing(pendingTier)   // show at pending radius if pendingTier > 0 and !active
  updateActiveRing(activeTier, remaining)
```

### State Machine

```
States (MagnetBoosterState):
  - pendingTier: 0 | 1 | 2 (default 0)
  - activeUntil: number (seconds, gameTime; default 0)
  - activeTier: 0 | 1 | 2 (default 0)

Transitions:
  COLLECT (no active):
    pendingTier <- min(pendingTier + 1, 2)
    // activeUntil unchanged
    // activeTier unchanged

  COLLECT (active):
    // active window keeps running; do not reset duration
    if pendingTier < 2: pendingTier += 1
    // activeTier unchanged

  ACTIVATE (Digit4 pressed):
    if pendingTier === 0: no-op
    if activeUntil > gameTime: no-op
    activeUntil <- gameTime + 6.0
    activeTier <- pendingTier
    pendingTier <- 0

  TICK (per frame):
    if activeUntil > 0 and gameTime >= activeUntil:
      activeUntil <- 0
      activeTier <- 0
      // pendingTier is unchanged (revert to preview if non-zero)
```

### Effective Radius Math

```typescript
function effectiveMagnetMultiplier(state: MagnetBoosterState): number {
  if (state.activeTier > 0) return state.activeTier + 1;  // 1 -> 2x, 2 -> 3x
  if (state.pendingTier > 0) return state.pendingTier + 1;
  return 1;
}

const effectiveMagnetRadius = MAGNET_RADIUS * effectiveMagnetMultiplier(state);
```

Used by:
- `scrap.magnetPull(scrap, shipPos, dt, effectiveMagnetRadius)` — replaces hardcoded `MAGNET_RADIUS` constant
- `pickups.updatePickup(pickup, shipPos, dt, effectiveMagnetRadius)` — replaces hardcoded `MAGNET_RADIUS` constant
- HUD count of in-range scrap (in `game.ts`) — replaces hardcoded `MAGNET_RADIUS` constant
- `createMagnetRing()` in `game.ts:3432` — STAYS hardcoded to baseline `MAGNET_RADIUS` (this is the comparison ring that shows "look how much bigger the active is")

### Module Boundaries

**`src/magnet-booster.ts`** (pure logic, no Three.js):
- `MAGNET_BOOSTER_DURATION_SECONDS = 6.0` constant
- `MAX_PENDING_TIER = 2` constant
- `MagnetBoosterState` interface
- `createMagnetBooster()` returns initial state
- `collectMagnetBooster(state, isActive: boolean)` mutates pendingTier per rules above
- `activateMagnetBooster(state, gameTime)` mutates per Digit4 rules; returns boolean (success/no-op)
- `tickMagnetBooster(state, gameTime)` decays activeUntil; returns boolean (was active, now expired)
- `effectiveMagnetMultiplier(state)` pure function
- `effectiveMagnetRadius(state, baselineRadius)` pure function

**`src/magnet-booster-vfx.ts`** (Three.js visuals):
- `createPreviewRing()` returns Mesh (dashed-looking RingGeometry, 0xffcc44)
- `createActiveRing()` returns Mesh (solid RingGeometry, 0xffcc44, additive)
- `updatePreviewRing(ring, tier)` sets ring.visible and ring.scale based on tier (1=2x, 2=3x)
- `updateActiveRing(ring, tier, remaining)` sets ring.visible, scale, opacity pulse

**`src/scrap.ts`** (modify):
- Remove `export const MAGNET_RADIUS = 2.5;` — replaced by passed-in param
- Keep `COLLECTION_RADIUS = 0.4` constant
- `magnetPull(scrap, shipPos, dt, effectiveRadius)` uses `effectiveRadius` for both the `distance > effectiveRadius` gate and the `(effectiveRadius - distance) / effectiveRadius` falloff

**`src/pickups.ts`** (modify):
- Remove `const MAGNET_RADIUS = 2.5;` — replaced by passed-in param
- Keep `MAGNET_PULL_SPEED = 12.0` constant
- `updatePickup(pickup, shipPos, dt, effectiveRadius)` uses `effectiveRadius` for both gate and falloff
- Add `PickupKind.MAGNET_BOOSTER = 'magnetBooster'` enum value (gold `0xffcc44`)
- Add `PICKUP_GEOMETRY_BY_KIND[MAGNET_BOOSTER] = new CapsuleGeometry(0.12, 0.32, 4, 8)` (only capsule in the family — silhouette distinct)
- Add `PICKUP_COLOR[MAGNET_BOOSTER] = 0xffcc44`
- Add `PICKUP_MUZZLE_SPEED` spin-axis entry for the MAGNET_BOOSTER kind (Y axis)

**`src/game.ts`** (modify):
- Add `private magnetBooster: MagnetBoosterState = createMagnetBooster();` field
- Add `private magnetPreviewRing: Mesh = createPreviewRing();` and `magnetPreviewRing.visible = false;` in constructor
- Add `private magnetActiveRing: Mesh = createActiveRing();` and `magnetActiveRing.visible = false;` in constructor
- Add `private magnetBoosterHud: MagnetBoosterHudElements | null = null;` cached HUD refs
- `get effectiveMagnetRadius()` returns `effectiveMagnetRadius(this.magnetBooster, MAGNET_RADIUS)`
- In `applyPickupEffect` for MAGNET_BOOSTER: call `collectMagnetBooster(this.magnetBooster, this.magnetBooster.activeUntil > this.gameTime)`
- New `useMagnetBooster()` method bound to Digit4 via `useActiveItem` dispatch
- In `updateActiveAmmoCooldowns` per-frame: call `tickMagnetBooster(this.magnetBooster, this.gameTime)` and `updatePreviewRing` + `updateActiveRing`
- In `magnetPull`/`updatePickup`/`pickupCount` call sites: replace `MAGNET_RADIUS` with `this.effectiveMagnetRadius`
- HUD reconcile: extend the active-slot row to 4 slots; the 4th slot is always rendered (empty box with dim border + "4" label when 0 pending)

**`src/input.ts`** (modify):
- Add `useMagnetBooster: boolean = false` field
- In keydown handler: `if (event.code === 'Digit4') this.useMagnetBooster = true;`
- In keyup handler: same → false
- Note: use event.code (not event.key) for layout-independence — same pattern as 1/2/3 (Phase 7 lesson)

**`index.html`** (modify):
- Add `.magnet-booster-pill` styles mirroring the existing `.active-hud-icon` but with `0xffcc44` accent
- Add `.magnet-booster-pill.empty` for the empty state (dim border + "4" label)
- Add `.magnet-booster-pill.active` for the active state (bright border + pulse animation)

---

## Components

### 1. State + Lifecycle (`src/magnet-booster.ts`)

Pure logic module. No Three.js imports. All functions are deterministic given input.

```typescript
export const MAGNET_BOOSTER_DURATION_SECONDS = 6.0;
export const MAX_PENDING_TIER = 2;

export interface MagnetBoosterState {
  pendingTier: 0 | 1 | 2;
  activeUntil: number;  // gameTime seconds; 0 = inactive
  activeTier: 0 | 1 | 2;
}

export function createMagnetBooster(): MagnetBoosterState {
  return { pendingTier: 0, activeUntil: 0, activeTier: 0 };
}

export function collectMagnetBooster(state: MagnetBoosterState, isActive: boolean): void {
  if (isActive) {
    // extend-while-active: do NOT reset duration; bump pendingTier for next activation
    if (state.pendingTier < MAX_PENDING_TIER) {
      state.pendingTier = (state.pendingTier + 1) as 1 | 2;
    }
  } else {
    state.pendingTier = Math.min(state.pendingTier + 1, MAX_PENDING_TIER) as 0 | 1 | 2;
  }
}

export function activateMagnetBooster(state: MagnetBoosterState, gameTime: number): boolean {
  if (state.pendingTier === 0) return false;
  if (state.activeUntil > gameTime) return false;
  state.activeUntil = gameTime + MAGNET_BOOSTER_DURATION_SECONDS;
  state.activeTier = state.pendingTier;
  state.pendingTier = 0;
  return true;
}

export function tickMagnetBooster(state: MagnetBoosterState, gameTime: number): boolean {
  if (state.activeUntil > 0 && gameTime >= state.activeUntil) {
    state.activeUntil = 0;
    state.activeTier = 0;
    return true;  // expired
  }
  return false;
}

export function effectiveMagnetMultiplier(state: MagnetBoosterState): number {
  if (state.activeTier > 0) return state.activeTier + 1;
  if (state.pendingTier > 0) return state.pendingTier + 1;
  return 1;
}

export function effectiveMagnetRadius(state: MagnetBoosterState, baselineRadius: number): number {
  return baselineRadius * effectiveMagnetMultiplier(state);
}

export function activeRemainingSeconds(state: MagnetBoosterState, gameTime: number): number {
  if (state.activeUntil === 0) return 0;
  return Math.max(0, state.activeUntil - gameTime);
}
```

### 2. Visuals (`src/magnet-booster-vfx.ts`)

```typescript
import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { MAGNET_RADIUS } from './scrap';

export function createPreviewRing(): Mesh {
  // Thin dashed-looking ring at the pending tier radius (scale to set radius).
  // Inner edge: radius - 0.04u; outer edge: radius + 0.04u — thin band.
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
  mesh.position.z = -0.4;  // behind ship
  mesh.visible = false;
  return mesh;
}

export function createActiveRing(): Mesh {
  // Solid bright ring with baseline-magnet-radius inner-edge "shadow"
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
  // tier 1 = 2x radius, tier 2 = 3x radius
  ring.scale.set(pendingTier + 1, pendingTier + 1, 1);
  // Slow rotation (5s/rev) for "potential" feel — set by animation, not in this helper
}

export function updateActiveRing(
  ring: Mesh,
  activeTier: 0 | 1 | 2,
  remainingSeconds: number,
  deltaTime: number,
): void {
  if (activeTier === 0 || remainingSeconds === 0) {
    ring.visible = false;
    return;
  }
  ring.visible = true;
  ring.scale.set(activeTier + 1, activeTier + 1, 1);
  // 2 Hz pulse: opacity 0.30 to 0.55
  const pulse = 0.40 + 0.15 * Math.sin(remainingSeconds * Math.PI * 4);
  (ring.material as MeshBasicMaterial).opacity = pulse;
}
```

### 3. PickupKind entry (`src/pickups.ts` additions)

```typescript
// In the PickupKind enum (add new entry):
MAGNET_BOOSTER = 'magnetBooster',  // active — slot 4 — gold 0xffcc44

// In PICKUP_GEOMETRY_BY_KIND (add entry):
[PickupKind.MAGNET_BOOSTER]: new CapsuleGeometry(0.12, 0.32, 4, 8),

// In PICKUP_COLOR (add entry):
[PickupKind.MAGNET_BOOSTER]: 0xffcc44,

// In the drop-source branch (maybeDropPickup or equivalent):
case PickupKind.MAGNET_BOOSTER: // already covered by existing crystal-guaranteed + 10% LARGE iron
```

### 4. Scrap + Pickup pull signatures (`src/scrap.ts`, `src/pickups.ts` modifications)

```typescript
// src/scrap.ts: remove MAGNET_RADIUS export; signature change
export function magnetPull(
  scrap: ScrapState,
  shipPosition: Vector2,
  deltaTime: number,
  effectiveRadius: number,  // NEW — caller passes game.effectiveMagnetRadius
): void {
  const dx = shipPosition.x - scrap.position.x;
  const dy = shipPosition.y - scrap.position.y;
  const distance = Math.hypot(dx, dy);
  if (distance > effectiveRadius || distance <= 0.01) return;
  const pullStrength = (effectiveRadius - distance) / effectiveRadius;
  const speed = MAGNET_PULL_SPEED * pullStrength;
  scrap.velocity = { x: (dx / distance) * speed, y: (dy / distance) * speed };
}

// src/pickups.ts: same pattern for updatePickup
export function updatePickup(
  pickup: PickupState,
  shipPosition: Vector2,
  deltaTime: number,
  effectiveRadius: number,  // NEW
): void {
  // ... same shape as scrap.magnetPull, uses effectiveRadius
}
```

### 5. Game wiring (`src/game.ts` additions)

```typescript
// At the top of file, in the imports:
import { MagnetBoosterState, createMagnetBooster, collectMagnetBooster, activateMagnetBooster, tickMagnetBooster, effectiveMagnetRadius, activeRemainingSeconds } from './magnet-booster';
import { createPreviewRing, createActiveRing, updatePreviewRing, updateActiveRing } from './magnet-booster-vfx';

// As a private field on Game:
private magnetBooster: MagnetBoosterState = createMagnetBooster();
private magnetPreviewRing: Mesh = createPreviewRing();
private magnetActiveRing: Mesh = createActiveRing();

// In the constructor, attach the rings to the ship mesh:
this.shipMesh.add(this.magnetPreviewRing);
this.shipMesh.add(this.magnetActiveRing);

// Add the useMagnetBooster case to useActiveItem dispatch:
case 'magnetBooster':
  activateMagnetBooster(this.magnetBooster, this.gameTime);
  break;

// New method:
get effectiveMagnetRadius(): number {
  return effectiveMagnetRadius(this.magnetBooster, MAGNET_RADIUS);
}

// In updateActiveAmmoCooldowns (per-frame call):
const justExpired = tickMagnetBooster(this.magnetBooster, this.gameTime);
updatePreviewRing(this.magnetPreviewRing, this.magnetBooster.pendingTier);
// Active ring hides if activeUntil > 0; the helper handles that
updateActiveRing(
  this.magnetActiveRing,
  this.magnetBooster.activeTier,
  activeRemainingSeconds(this.magnetBooster, this.gameTime),
  deltaTime,
);

// In applyPickupEffect (add a case for MAGNET_BOOSTER):
case PickupKind.MAGNET_BOOSTER:
  collectMagnetBooster(this.magnetBooster, this.magnetBooster.activeUntil > this.gameTime);
  break;

// In magnetPull call site: replace MAGNET_RADIUS with this.effectiveMagnetRadius
magnetPull(scrap, this.ship.position, deltaTime, this.effectiveMagnetRadius);

// In updatePickup call site: same swap
updatePickup(pickup, this.ship.position, deltaTime, this.effectiveMagnetRadius);

// In pickupCount loop: same swap
const r = this.effectiveMagnetRadius;
// ... Math.hypot(dx, dy) <= r ? count + 1 : count

// In stop(): reset magnet booster state
this.magnetBooster = createMagnetBooster();
this.magnetPreviewRing.visible = false;
this.magnetActiveRing.visible = false;

// HUD reconcile: extend the active-slot row to 4 slots
// The 4th slot is always rendered; empty box with dim border + "4" label when pendingTier=0 AND activeTier=0
// Otherwise shows count = tier, label = "MAGNET"
```

### 6. Input binding (`src/input.ts` additions)

```typescript
// Add field:
useMagnetBooster: boolean = false;

// In keydown handler (alongside Digit1/2/3):
if (event.code === 'Digit4') {
  this.useMagnetBooster = true;
}

// In keyup handler:
if (event.code === 'Digit4') {
  this.useMagnetBooster = false;
}

// In useActiveItem dispatch (game.ts):
if (input.useMagnetBooster) {
  // dispatch to magnet booster activation
}
```

---

## Visual Design

### Magnet Booster Collectable

- **Geometry**: `CapsuleGeometry(0.12, 0.32, 4, 8)` — radius 0.12, length 0.32 (capsule including hemispheres)
- **Color**: `0xffcc44` (gold/yellow) — extends the existing `0xffcc00` magnet ring identity
- **Material**: `MeshBasicMaterial`, transparent: false, additive: false (it's a SOLID object, not a glow)
- **Spin**: Y-axis (vertical), 1.0 rad/sec — different from the other 5 pickups (X or Z spin)
- **Bob**: vertical sin-wave bob (matches the other 5 pickups)
- **Emissive pulse**: 0.5 Hz, brightness 0.6 to 1.0 — subtle, distinguishes from the SHIELD boost

### Preview Ring (pending, not active)

- **Geometry**: `RingGeometry(MAGNET_RADIUS - 0.04, MAGNET_RADIUS + 0.04, 64, 1)` — thin band
- **Color**: `0xffcc44` (gold)
- **Material**: `MeshBasicMaterial`, `transparent: true`, `opacity: 0.20`, `blending: AdditiveBlending`, `depthWrite: false`, `side: DoubleSide`
- **Scale**: `pendingTier + 1` (so tier 1 = 2× radius, tier 2 = 3× radius)
- **Animation**: slow rotation 5s/rev (using existing per-frame ring.rotation.z += deltaTime * (2 * Math.PI / 5))
- **Z position**: -0.4 (behind ship, in front of magnet ring at -0.5)
- **Visibility**: hidden when pendingTier === 0; visible when pendingTier > 0 AND activeTier === 0

### Active Ring (active window)

- **Geometry**: same as preview
- **Color**: `0xffcc44`
- **Material**: `MeshBasicMaterial`, `transparent: true`, `opacity: 0.30-0.55 pulsing`, `blending: AdditiveBlending`, `depthWrite: false`, `side: DoubleSide`
- **Scale**: `activeTier + 1`
- **Animation**: 2 Hz opacity pulse via sin wave
- **Visibility**: hidden when activeTier === 0

### Baseline Magnet Ring (unchanged)

- The existing `createMagnetRing()` in `game.ts:3432` STAYS as a 2.5u reference ring
- When the Magnet Booster is active at 3×, the baseline ring (2.5u) + active ring (7.5u) are BOTH visible side by side — visual proof "look how much bigger"

### HUD Pill (bottom-right, 4th slot, always visible)

- **Position**: 4th in the active-row flex container, after the existing 3 slots
- **Always rendered** (empty box with "4" label + dim border when 0 pending AND 0 active)
- **Pending state**:
  - Border: 2px solid `0xffcc44`
  - Count text: `"2×"` or `"3×"` in 12px gold
  - Name header: `"MAGNET"` in 9px gold (matches Phase 7b font hierarchy)
- **Active state**:
  - Border: 3px solid `0xffcc44` (brighter, thicker)
  - Count text: remaining seconds `"5.2s"` in 12px gold
  - Progress bar: horizontal fill at bottom of slot, `0xffcc44` to `0xffaa00`, width = (remaining / 6) × 100%
- **Empty state**:
  - Border: 1px solid `0x666666` (dim)
  - Count text: empty
  - Name header: `"4"` in 9px gray
- **State transitions**:
  - 0/0 → pending: crossfade in (200ms opacity 0→1)
  - pending → active: swap display from tier countdown to remaining seconds + progress bar (instant)
  - active → 0/0: instant hide

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Player dies with pending tier | State resets to 0/0 on death (matches the existing respawn-clear behavior) |
| Player dies with active ring | Active ring also resets to 0/0 (matches respawn-clear) |
| Player picks up while at MAX_PENDING_TIER (2) | No-op (the 2 is the cap; can't go higher) |
| Player presses Digit4 with no pending AND no active | No-op |
| Player presses Digit4 while active AND with pending tier (rare — would require pickup during active AND pending > 0) | No-op (the active stays; the pending is preserved for NEXT activation) |
| Two pickups collected back-to-back while active (one frame apart) | Both bump pendingTier (from 1 to 2); active window's duration unchanged |
| Pickup collected at 0.1s remaining | Duration extends via the "do not reset" rule; remaining becomes ~5.9s (unchanged) + pendingTier now 2 |
| 3rd pickup collected while pendingTier=2 | No-op |
| Existing MAGNET_RADIUS consumers updated | `magnetPull`, `updatePickup`, HUD count loop all use `this.effectiveMagnetRadius` |
| `stop()` called while active | Resets magnetBooster state to 0/0 (consistent with other active state resets) |

---

## Testing Strategy

### Unit tests (`tests/magnet-booster.test.ts`, 8 tests)

```typescript
describe('MagnetBooster state machine', () => {
  it('createMagnetBooster returns pendingTier=0, activeUntil=0, activeTier=0', () => { ... });
  it('collectMagnetBooster (inactive) bumps pendingTier from 0 to 1', () => { ... });
  it('collectMagnetBooster (inactive) bumps pendingTier from 1 to 2', () => { ... });
  it('collectMagnetBooster (inactive) caps pendingTier at MAX_PENDING_TIER=2', () => { ... });
  it('collectMagnetBooster (active) bumps pendingTier but does NOT change activeUntil', () => { ... });
  it('activateMagnetBooster succeeds with pendingTier=1, sets activeUntil = gameTime + 6', () => { ... });
  it('activateMagnetBooster returns false with pendingTier=0', () => { ... });
  it('activateMagnetBooster returns false when activeUntil > gameTime (already active)', () => { ... });
  it('tickMagnetBooster returns true and clears activeUntil/activeTier when expired', () => { ... });
  it('tickMagnetBooster returns false when not expired', () => { ... });
  it('effectiveMagnetMultiplier: 1 for 0/0, 2 for pending=1 or active=1, 3 for pending=2 or active=2', () => { ... });
  it('effectiveMagnetRadius: 2.5u for 0/0, 5.0u for tier 1, 7.5u for tier 2', () => { ... });
  it('activeRemainingSeconds returns 0 when inactive, remaining when active', () => { ... });
});
```

### Integration tests (`tests/scrap-magnet-integration.test.ts`, 6 tests)

```typescript
describe('magnetPull with effectiveRadius', () => {
  it('does not pull scrap outside effectiveRadius', () => { ... });
  it('pulls scrap inside effectiveRadius but outside baseline MAGNET_RADIUS (when boosted)', () => { ... });
  it('pull strength falls off correctly outside baseline', () => { ... });
  it('does not modify scrap velocity when distance <= 0.01', () => { ... });
  it('preserves scrap velocity when no boost (effectiveRadius == MAGNET_RADIUS)', () => { ... });
  it('returns to baseline behavior when boost expires', () => { ... });
});
```

### VFX tests (`tests/magnet-booster-vfx.test.ts`, 4 tests)

```typescript
describe('createPreviewRing / createActiveRing', () => {
  it('preview ring uses RingGeometry with MAGNET_RADIUS as the base', () => { ... });
  it('preview ring has AdditiveBlending + opacity 0.20 + color 0xffcc44', () => { ... });
  it('active ring has AdditiveBlending + opacity starts at 0.45 + color 0xffcc44', () => { ... });
  it('updatePreviewRing sets ring.scale to (tier+1, tier+1, 1) when visible', () => { ... });
  it('updatePreviewRing sets ring.visible = false when pendingTier === 0', () => { ... });
  it('updateActiveRing sets ring.scale to (activeTier+1, activeTier+1, 1)', () => { ... });
  it('updateActiveRing sets opacity via sin-wave pulse', () => { ... });
});
```

### Playwright screenshot tests (`tests/phase-7f-screenshots.spec.ts`, 2 tests)

```typescript
describe('Phase 7f — Magnet Booster visual', () => {
  it('captures the preview ring at 2× state (after 1st pickup)', async () => {
    // Boot game, force-drop 1 Magnet Booster pickup via dev hooks, wait for collection
    // Screenshot the playfield; expect gold dashed ring at 5.0u radius
  });

  it('captures the active ring at 3× state during the 6s window', async () => {
    // Boot game, force-drop 2 Magnet Booster pickups, collect both, press Digit4
    // Wait 100ms; screenshot the playfield; expect gold solid ring at 7.5u with pulse
  });
});
```

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Adding a 4th HUD slot breaks the existing 3-slot row visual balance | Always-visible empty box maintains symmetry; the new slot is dim until active so it doesn't compete for attention |
| Preview ring at 2× or 3× overlaps with asteroid bodies (which are often within 5–7.5u of the ship) | Ring is thin + low-opacity additive; asteroids occlude the ring naturally behind them; the ring is more readable than the existing baseline 2.5u ring, not less |
| Effective radius multiplier might pull pickups from across the arena in 1 frame (chaos) | Pull speed is unchanged (12 u/s); only the gate radius changes. Pickups outside 2.5u don't move instantly, they start a slow pull |
| Active ring + baseline ring + preview ring stacked when transitioning from pending to active might briefly flash | Test the transition; if visible, hide preview ring the instant active begins (not via opacity fade) |
| 6-second window may feel too short for clearing a debris cloud | Match the 6s of ORBIT_DRONES (closest analog); user can extend via gameplay tuning later if needed |
| Magnet Booster is too common (10% LARGE + crystal-guaranteed) | Drop source matches the other 3 actives; if it dominates play, scope a future tuning task |

---

## Anti-Patterns Avoided

- **No halo-leak repeat** — disposal handled in `stop()` (rings are added to shipMesh, get cleaned up with the ship)
- **No new `require('three')` inline** — all new Three.js classes imported at the top of their modules
- **No additive cap breach** — preview opacity 0.20, active opacity 0.30–0.55 (well under 0.7 cap)
- **No new dependencies** — `CapsuleGeometry`, `RingGeometry` are built into Three.js
- **No chargeCap for this kind** — the booster is a tiered single-use, not a stack; no `BOMB_STRIKE_CHARGE_CAP` analog
- **No breaking change to other pickups** — `OrbitDrone`, `BombStrike`, `HomingMissile` paths untouched; `MAGNET_RADIUS` consumers (3 in scrap.ts, 3 in pickups.ts, 1 in game.ts HUD ring) all updated in one sweep
- **No silent change to existing `magnetPull`/`updatePickup` signatures** — the new `effectiveRadius` param is required (no default value) so call sites are forced to pass it; missing call sites will fail typecheck

---

## Open Questions / Future Tuning

- **Magnet Booster spawn animation**: should the collectable have a unique arrival VFX (e.g., a particle aura)? Deferred — uses the existing pickup spawn particles for now.
- **HUD pill tier visualization**: should the pill show the SCALE of the ring (a tiny preview-ring graphic inside the pill) so the player understands "this expands the magnet"? Deferred — the on-ship preview ring is the canonical visual; HUD pill text is sufficient.
- **Tier upgrade mid-window visual feedback**: should the player see/hear anything when they collect a 2nd pickup while the booster is already active? Currently the HUD pill's tier text would change from "2×" to "3×" silently. A small audio cue ("tier up" sound) would help; deferred.
- **Pickup auto-collect when ship is inside the boosted ring**: pickups outside the baseline 2.5u are NOT auto-collected; they're just pulled in at 12 u/s. This matches the existing behavior; deferred (no change needed).

---

## Commit Message

`feat(pickups): Phase 7f — Magnet Booster (2x/3x tiered, 6s, Digit4)`

One atomic commit per Phase 7 convention. `git reset --soft <sha-before-task-1> && git commit` at the end of the SDD workflow.

---

## Self-Review

- **Spec coverage**: All user brainstorm answers locked into Global Constraints verbatim ✓
- **No placeholders**: every constant, color, geometry size, threshold, and key binding is concrete ✓
- **Internal consistency**: state machine + effective radius math + visual design + edge cases all match ✓
- **Scope**: single phase, ~6-8 SDD tasks, ~1 atomic commit at end ✓
- **Type safety**: `effectiveRadius` is required (no default), call sites will fail typecheck if missed ✓
- **Test coverage**: 18 unit + 2 Playwright + every state transition + every edge case ✓