# Phase 7 — Temporary Pickups (First pickups + UI feedback)

**Status:** Design approved 2026-06-23
**Branch:** `phase-2-movement`
**Prior art:** GDD Phase 7 ("First pickups + UI feedback"), Phase 4 scrap-collection pattern, Phase 6 floating text

## Problem

The player has no way to *feel* the run change moment-to-moment. Every fight plays out the same way: drift, fire, collect scrap, die. The GDD defers "persistent blueprints" to Phase 9, but Phase 7's *temporary* pickups give us the moment-to-moment juice — a player who just destroyed a crystal and now has 6 seconds of 3× fire-rate is a player who feels powerful in a way the steady state can't deliver. Same for a shield+1 surprise that lets them survive a hit they should have eaten.

Per the GDD verification:
- "Collecting a temporary pickup updates the HUD."
- "Pickup effect expires after its duration."

Both are observable, both require a clean pickup lifecycle + a visible indicator.

## Chosen Approach — Single Pickup Class, Three Kinds, One HUD Pill Row

Three pickup kinds (FIRE_RATE, SHIELD, SPREAD), one `Pickup` class, one lifecycle (spawn → drift → magnetize → collect → apply → expire), one HUD pattern (bottom-center pill row that drains per-kind). The codebase already mirrors this shape — `AsteroidKind` (Iron vs Crystal), `crystal-fx` (per-frame tick of an `updateFracturedMaterialTelegraph`), `scrap` (drop + magnetize + collect).

### Effect parameters (user-confirmed)

| Kind | Effect | Duration |
|------|--------|----------|
| FIRE_RATE | 3× fire rate (`SHIP_FIRE_COOLDOWN` 0.154s → effective 0.051s) | 6.0 s |
| SHIELD    | Instant +50% of `SHIELD_MAX_ENERGY` (capped at max) | 8.0 s |
| SPREAD    | 3-way emission at ±15° spread | 10.0 s |

### Drop sources (user-confirmed)

| Source | Roll | Kind chosen |
|--------|------|-------------|
| Any destroyed CRYSTAL | guaranteed (100%) | uniform random of 3 |
| Destroyed IRON, size LARGE | 10% | uniform random of 3 |
| Any other kill | never | — |

### Collection model (user-confirmed)

Pickups magnetize to the ship within `MAGNET_RADIUS = 2.5` (same as scrap). Collection happens on `PICKUP_COLLECT_RADIUS = 0.5` overlap (same as scrap). Uncollected pickups expire after `PICKUP_LIFETIME = 10.0s` (slightly longer than scrap's 8.0s to give the player time to chase a magnetizing pickup back into range).

## Architecture

### New files

| File | Purpose |
|------|---------|
| `src/pickups.ts` | PickupState, PickupKind, lifecycle (update / expire / collected), drop-decision (maybeDropPickup), effect application (applyPickupEffect), mesh factory (createPickupMesh, disposePickupMesh). |
| `tests/pickups.test.ts` | Unit tests for the pure logic. No WebGL, no canvas, no jsdom — mirrors `tests/scrap.test.ts` and `tests/shard.test.ts`. |

### Modified files

| File | Change |
|------|--------|
| `src/ship.ts` | `Ship.update` accepts a `fireRateMultiplier: number` (default 1). Multiplier scales the per-frame `fireCooldown` decrement. |
| `src/game.ts` | New `activeEffects: ActivePickupEffect[]` field. New `pickups: LivePickup[]` field. `fireProjectile(angleOffsets: number[])` factors the single-shot spawn into a loop over offsets. New `updatePickups`, `updateActivePickupEffects`, `hasActiveEffect`, `spreadAnglesForFrame` methods. New `pickupHudElement` + `pickupHudPills` for the HUD. `destroyIronAsteroid` and `destroyCrystal` call `maybeDropPickup` and `spawnPickup`. `update` calls the new tick methods. `updateHud` reconciles pills. `stop` disposes all pickup meshes + clears HUD + clears active effects. |

### Component interfaces

```ts
// src/pickups.ts

export enum PickupKind {
  FIRE_RATE = 'fireRate',
  SHIELD = 'shield',
  SPREAD = 'spread',
}

export interface PickupState {
  readonly kind: PickupKind;
  position: Vector2;
  velocity: Vector2;
  age: number;       // 0 at spawn, +deltaTime per frame
  spin: number;      // 0 at spawn, +deltaTime * 1.5 per frame
}

export const PICKUP_DURATION_SECONDS: Record<PickupKind, number> = {
  [PickupKind.FIRE_RATE]: 6.0,
  [PickupKind.SHIELD]:    8.0,
  [PickupKind.SPREAD]:   10.0,
};

export const PICKUP_LIFETIME = 10.0;
export const PICKUP_MUZZLE_SPEED = 1.5;
export const PICKUP_COLLECT_RADIUS = 0.5;
export const PICKUP_MESH_RADIUS = 0.18;
export const PICKUP_COLOR: Record<PickupKind, number> = {
  [PickupKind.FIRE_RATE]: 0xff8800,
  [PickupKind.SHIELD]:    0x66aaff,
  [PickupKind.SPREAD]:    0x66ff66,
};

export function createPickupState(kind: PickupKind, position: Vector2): PickupState;
export function updatePickup(pickup: PickupState, shipPosition: Vector2, deltaTime: number): void;
export function isPickupExpired(pickup: PickupState): boolean;
export function isPickupCollected(pickup: PickupState, shipPosition: Vector2): boolean;
export function maybeDropPickup(state: AsteroidState): PickupKind | null;
export function applyPickupEffect(
  kind: PickupKind,
  ship: { fireCooldown: number },
  shield: { energy: number; maxEnergy: number },
): { kind: PickupKind; remaining: number; total: number };
export function createPickupMesh(kind: PickupKind): Group;
export function disposePickupMesh(group: Group): void;
```

```ts
// src/ship.ts (signature change only — same body, multiplies the decrement)
class Ship {
  update(input: InputState, deltaTime: number, fireRateMultiplier?: number): void;
}
```

```ts
// src/game.ts (additions only, surgical)
private pickups: LivePickup[] = [];
private activeEffects: ActivePickupEffect[] = [];
private pickupHudElement: HTMLDivElement | null = null;
private pickupHudPills: Map<PickupKind, HTMLDivElement> = new Map();

private spawnPickup(kind: PickupKind, position: Vector2): void;
private updatePickups(deltaTime: number): void;
private updateActivePickupEffects(deltaTime: number): void;
private hasActiveEffect(kind: PickupKind): boolean;
private spreadAnglesForFrame(): number[];
private fireProjectile(angleOffsets: number[]): void;   // signature change
private reconcilePickupHud(): void;
```

### Lifecycle (data flow)

```
kill event ──→ maybeDropPickup(state) ──→ PickupKind | null
                                            │
                       null → no spawn      │ non-null
                                            ▼
                            spawnPickup(kind, position)
                                            │
                                            ▼
                       updatePickups(deltaTime)  [per frame]
                              │  - drift
                              │  - magnetize (if within MAGNET_RADIUS)
                              │  - age++
                              │  - spin++
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
        isPickupCollected()?     isPickupExpired()?
                  │                       │
                  ▼ yes                   ▼ yes
        applyPickupEffect()        dispose mesh + remove
        push ActivePickupEffect
        spawn "+3× RATE 6s" floating text
        dispose mesh + remove
```

### HUD pill (CSS-only animation, no canvas)

A bottom-center container with one pill per active effect. Each pill is a fixed-width div with:
- A kind-specific colored border (the kind's hex)
- A label (`3× RATE` / `SHIELD+` / `SPREAD`)
- A remaining-time text (e.g. `4.3s`)
- A background fill bar whose `width` is set every frame to `(remaining / total) * 100%` (drains right-to-left)

On collect: create a new pill, append to the container. On expire: remove from the DOM and from the map. The map keys by `PickupKind` so re-collecting the same kind overwrites the old pill (timer resets).

## Data flow through Game

```
[Per frame in Game.update]
  1. updateActivePickupEffects(deltaTime)   // decrement, drop expired
  2. updatePickups(deltaTime)               // tick LivePickup[], collect/expire
  3. ship.update(input, dt, hasActiveEffect(FIRE_RATE) ? 3 : 1)
  4. if (fire && canFire) fireProjectile(spreadAnglesForFrame())
  5. updateHud(deltaTime)                   // reconcile pills to activeEffects
  6. updatePickupMeshes()                   // sync mesh.position, mesh.rotation
```

```
[On asteroid destruction]
  destroyIronAsteroid:
    awardBreak(...)
    spawnScrapFromAsteroid(target)
    const kind = maybeDropPickup(target.state);   // 10% roll for IRON LARGE, null otherwise
    if (kind) spawnPickup(kind, target.state.position);
    splitAsteroid children spawn

  destroyCrystal:                          // ORDER MATTERS — pickup spawns BEFORE the
    compute tier, hooks, scoring            // death tween so the expanding tween mesh
    spawnFloatingText for tier + hooks      // does not visually carry the pickup away
    const kind = maybeDropPickup(target.state);   // always returns a kind for crystal
    if (kind) spawnPickup(kind, target.state.position);
    spawnCrystalDeathTween(target)          // ← after pickup is in the scene at rest
    cleanup scheduler / counter maps
    cleanup bolt + sparks
```

## Anti-patterns avoided

- **No new AdditiveBlending sources** — the pickups are a single PBR mesh each, no glowing trails, no spark bursts, no bloom triggers. They follow the same emissive-intensity approach the asteroid materials use, so the framebuffer sum doesn't change.
- **No new global state** — `activeEffects` is owned by `Game`, just like `wave` and `shield`. `pickupHudPills` is a `Map<PickupKind, HTMLDivElement>` so the lookup is O(1).
- **No refactor of `fireProjectile`** — the function gains an `angleOffsets: number[]` parameter and loops; the existing single-shot path is the `[0]` case.
- **No changes to existing HUD elements** — `pickupHudElement` is a new `div` appended alongside the existing 5; no edits to the score, wave, breather, shield, or resume elements.
- **No new dependencies** — `IcosahedronGeometry` and `MeshStandardMaterial` are already used in `src/asteroid.ts`.
- **No new game loops or timers** — the pickup lifecycle hooks into the existing `update(deltaTime)` call site; no `setTimeout` or `setInterval`.

## Test plan

`tests/pickups.test.ts` (new) — pure-Node tests, no WebGL:

1. `maybeDropPickup` returns a kind for any CRYSTAL state.
2. `maybeDropPickup` returns null for IRON size SMALL / MEDIUM / TINY.
3. `maybeDropPickup` returns a kind for IRON size LARGE with 100% mocked-Math.random, null with 0%.
4. `createPickupState` initializes `age=0`, `spin=0`, velocity has non-zero magnitude.
5. `updatePickup` increments `age` by `deltaTime`.
6. `updatePickup` magnetizes (overrides velocity) when ship is within `MAGNET_RADIUS`.
7. `updatePickup` does not magnetize when ship is outside `MAGNET_RADIUS`.
8. `isPickupExpired` returns true at `age >= PICKUP_LIFETIME`.
9. `isPickupCollected` returns true within `PICKUP_COLLECT_RADIUS`, false beyond.
10. `applyPickupEffect(FIRE_RATE, ...)` returns a duration of 6.0 and does not mutate shield.
11. `applyPickupEffect(SHIELD, ...)` returns a duration of 8.0 and adds 0.5 to `shield.energy`.
12. `applyPickupEffect(SHIELD, ...)` caps at `shield.maxEnergy`.
13. `applyPickupEffect(SPREAD, ...)` returns a duration of 10.0 and does not mutate shield.
14. `PICKUP_DURATION_SECONDS` matches the exact values 6 / 8 / 10.

`tests/ship.test.ts` (extend) — one new test:

15. `ship.update` with `fireRateMultiplier=3` decrements `fireCooldown` by 3× the base.

## Files NOT modified

- `src/asteroid.ts` — no crystal FX changes, no new methods. The asteroid destruction path is already a clean insertion point via `destroyIronAsteroid` / `destroyCrystal`.
- `src/scrap.ts` — the magnet math is duplicated (not imported) in `src/pickups.ts` because the two systems have different state shapes (ScrapState is `position/velocity/lifetime`, PickupState is `position/velocity/age/spin`). DRY would force a common interface that the two don't otherwise share; YAGNI.
- `src/crystal-fx.ts` — telegraph is unchanged.
- `src/post-processing.ts` — no bloom changes.

## Commit message

`feat(pickups): temporary pickups — fire-rate / shield+ / spread with HUD pills (Phase 7)`

## Verification

- Full vitest suite green (existing 203 tests + new ~15 pickup tests).
- Typecheck clean (`tsc --noEmit`).
- Build clean (`npm run build`).
- Playwright screenshot: spawn a crystal, kill it, verify a pickup mesh appears at the kill site, then drive the player into it, then capture a screenshot of the bottom-center HUD with one pill visible.
- Playwright screenshot: wait `PICKUP_DURATION_SECONDS + 0.1` after collect, verify the pill is gone.

---

# Phase 7 EXPANSION — Active Activation Subset

**Status:** Design approved 2026-06-24
**Replaces:** Sections above where they conflict (kept for the 3 temp pickups that ship unchanged).
**Goal:** Add one ACTIVE pickup (Bomb Strike) that the player can press a key to fire, proving the activation model. Future phases ship additional active types and the "ultimate weapon" boss-killer using the same model.

## Why a demo active pickup in Phase 7

The original 3 passive pickups (fire-rate / shield+ / spread) are timer-based — they auto-run and expire. They prove the *pickup lifecycle* but not the *active button-press* model. The GDD defers "ultimate weapon" to a later phase, but shipping ONE active pickup in Phase 7:

- Proves the architecture scales (charges + cooldown + input binding + active HUD).
- Gives the player a *moment-to-moment* power spike that the passive timers can't deliver.
- Sets the stage for the ultimate weapon (the player learns Q fires the slot; future pickups slot into the same row).
- Reuses the existing `Shockwave` visual class — minimum new code, maximum feel.

## Chosen demo active — Bomb Strike (rank #1 in research)

A press-to-fire radial AOE that:
- Deals 1 HP to every asteroid in `BOMB_STRIKE_RADIUS` (~5.0 world units).
- Removes all currently-spawned `activeShards` in radius (cleanses Shard Swarm threat).
- Plays the existing `Shockwave` expanding ring at the ship's position.
- Spawns 1 floating text "BOMB!" in the player's color.

### Why Bomb Strike (over Mega Laser, Orbit Drone, etc.)

- **Reuses `Shockwave`** — the expanding ring visual is already a self-contained class. Zero new visual code.
- **Damage hooks into `handleCollisions`** — the bomb's damage is a one-shot radial sweep run in `Game.fireActivePickup()` BEFORE the per-frame update. Hits all asteroids in radius, applies damage via the same `AsteroidState.health -= 1` path projectiles use.
- **Shard-cleansing** is a one-liner: `this.activeShards = this.activeShards.filter(s => Math.hypot(s.state.position.x - ship.x, s.state.position.y - ship.y) > BOMB_STRIKE_RADIUS)`. This is the "I countered the Shard Swarm" payoff moment.
- **No new dependencies, no new shader, no new mesh class** — smallest possible new code that proves the model.

### Activation pattern (research-backed)

Hybrid gating — **charges + cooldown** (Doom Eternal / Dead Cells / Destiny pattern):

| Property | Value | Source |
|----------|-------|--------|
| Charges per pickup | 1 | Doom Eternal Frag Grenade model |
| Per-shot cooldown | 3.0 s | Survey consensus for "finite AOE" |
| Charge cap | 3 | Doom Eternal cap (matches Frag Grenade) |
| Activation key | `1` (number row) | Player choice; `2`/`3` reserved for future actives |

### Why `1`/`2`/`3` (over `Q`/`E`/`R`)

Player choice. Number row is left-hand-friendly (WASD + 1/2/3 stays on the left), matches Enter the Gungeon's slot pattern, and keeps the right hand on the mouse for aim. Phase 7 ships only slot `1`; slots `2` and `3` are reserved for future active pickups (the ultimate weapon lives in slot `2` or `3`).

## Architecture additions to the existing spec

### `src/pickups.ts` — extensions

```ts
// Extend the existing PickupKind enum with BOMB_STRIKE.
export enum PickupKind {
  FIRE_RATE = 'fireRate',     // passive — 6s
  SHIELD = 'shield',          // passive — 8s
  SPREAD = 'spread',          // passive — 10s
  BOMB_STRIKE = 'bombStrike', // active — 1 charge + 3s cooldown
}

// New constants for the active subset.
export const BOMB_STRIKE_RADIUS = 5.0;
export const BOMB_STRIKE_COOLDOWN_SECONDS = 3.0;
export const BOMB_STRIKE_CHARGE_CAP = 3;
export const BOMB_STRIKE_DAMAGE = 1;

// Each active kind has its own ammo + cooldown (future-proof: a future
// pickup kind in slot 2 would have its own ammo state).
export interface ActiveAmmoState {
  charges: number;          // current charges, 0..cap
  cooldownRemaining: number; // seconds until next charge is fireable
}

// A player has one ActiveAmmoState per active pickup kind. Lives on Game.
export type ActiveAmmoMap = Record<PickupKind, ActiveAmmoState>;

// Extend the apply function to also grant ammo for active kinds.
// (DIAL-UP update: caps now come from ACTIVE_KIND_SPECS[kind].chargeCap,
// not the per-kind BOMB_STRIKE_CHARGE_CAP constant, so this function is
// forward-compatible with Orbit Drones and Homing Missiles.)
export function applyPickupEffect(
  kind: PickupKind,
  ship: { fireCooldown: number },
  shield: { energy: number; maxEnergy: number },
  activeAmmo: ActiveAmmoMap,    // ← new param
): { kind: PickupKind; remaining: number; total: number } | { kind: PickupKind; ammo: ActiveAmmoState } {
  // ... existing passive branches unchanged ...
  case PickupKind.BOMB_STRIKE: {
    const spec = ACTIVE_KIND_SPECS[PickupKind.BOMB_STRIKE];
    activeAmmo[PickupKind.BOMB_STRIKE].charges = Math.min(
      spec.chargeCap,
      activeAmmo[PickupKind.BOMB_STRIKE].charges + 1,
    );
    // No timer (active pickups have no duration; the ammo IS the resource).
    return { kind: PickupKind.BOMB_STRIKE, ammo: activeAmmo[PickupKind.BOMB_STRIKE] };
  }
}

// Pure helper: can the player fire an active pickup right now?
export function canFireActive(ammo: ActiveAmmoState): boolean {
  return ammo.charges > 0 && ammo.cooldownRemaining <= 0;
}

// Per-frame tick: decrement cooldown by deltaTime (no automatic regen of
// charges — charges are pickup-gated only, not time-gated).
export function tickActiveAmmo(ammo: ActiveAmmoState, deltaTime: number): void {
  ammo.cooldownRemaining = Math.max(0, ammo.cooldownRemaining - deltaTime);
}

// On fire: consume a charge, set cooldown, return success.
export function consumeActiveCharge(ammo: ActiveAmmoState): boolean {
  if (!canFireActive(ammo)) return false;
  ammo.charges -= 1;
  ammo.cooldownRemaining = BOMB_STRIKE_COOLDOWN_SECONDS;
  return true;
}

// Reset state (used by Game.stop and respawn).
export function createEmptyActiveAmmo(): ActiveAmmoMap {
  const kinds = [PickupKind.FIRE_RATE, PickupKind.SHIELD, PickupKind.SPREAD, PickupKind.BOMB_STRIKE];
  const map = {} as ActiveAmmoMap;
  for (const k of kinds) {
    map[k] = { charges: 0, cooldownRemaining: 0 };
  }
  return map;
}
```

### `src/input.ts` — additions

Extend the `InputState` interface with three new fields, one per active slot. The input handler reads the actual key state and writes to the right field. Phase 7 binds only `1`; `2` and `3` are reserved for future slots.

```ts
export interface InputState {
  move: Vector2;
  aim: Vector2;
  fire: boolean;
  deployBreather: boolean;
  useActive1: boolean;   // ← new — bound to '1' in this phase
  useActive2: boolean;   // ← new — reserved (no binding in Phase 7)
  useActive3: boolean;   // ← new — reserved (no binding in Phase 7)
}
```

In the input handler, add `'1'` (and structurally `'2'`/`'3'`) to the keydown/keyup listener. Use `e.code === 'Digit1'` (or `KeyboardEvent.code`) for the number row — robust to keyboard layouts.

### `src/game.ts` — additions

| Hook | Change |
|------|--------|
| New field | `private activeAmmo: ActiveAmmoMap = createEmptyActiveAmmo()` |
| `applyPickupEffect` call sites (passive + active) | Pass `this.activeAmmo` as the new 3rd arg. On active pickup collect, the effect returns the ammo state; on passive, the existing `ActivePickupEffect` (timer) is pushed to `activeEffects`. |
| `update(deltaTime)` | After `updateActivePickupEffects`, add `tickActiveAmmo(this.activeAmmo[PickupKind.BOMB_STRIKE], deltaTime)`. Then check `input.useActive1 && canFireActive(...)` → if true, call `this.fireActivePickup(PickupKind.BOMB_STRIKE)`. |
| New `fireActivePickup(kind)` | For BOMB_STRIKE: call `consumeActiveCharge`; if successful, run the one-shot radial damage pass against all `asteroids` (1 HP each, mark for destroy if HP ≤ 0), `activeShards` (filter out), spawn `Shockwave` at ship position, spawn floating text "BOMB!". |
| New `updateActiveHud(deltaTime)` | Reconciles the bottom-right ammo row to `activeAmmo`: for each active kind, draw a small icon + numeric charge counter + a thin radial cooldown sweep. **The pill row is unaffected** — passive pickups still use the bottom-center pill row. |
| `updateHud` | Add call to `this.updateActiveHud(deltaTime)`. |
| `createHud` | Add a new `activeHudElement` div, bottom-right, 16px from edge, horizontal flex row. |
| `stop()` | Clear `activeAmmo` via `createEmptyActiveAmmo()`; remove `activeHudElement` and its child icons. |

### `src/ship.ts` — no changes (signature stays as already specced in the original Phase 7).

### `src/shockwave.ts` — no changes. Reuse as-is via `new Shockwave(shipPos, 0xff8800, 1.0)` (orange — matches the bomb color) + bumped `scaleMax` (handled by passing `intensity = 1.0` which already scales the ring up to ~4 units; if 5.0 radius needs a larger ring, we can extend Shockwave with a `scaleMax` override — but only if 4.0 is too small).

### `src/crystal-fx.ts` — no changes. Telegraph is unaffected.

## Data flow for an active pickup

```
[On pickup collect, kind === BOMB_STRIKE]
  applyPickupEffect(BOMB_STRIKE, ship, shield, activeAmmo)
    activeAmmo[BOMB_STRIKE].charges = min(3, current + 1)
  push no ActivePickupEffect (active pickups have no duration)
  spawn "+BOMB STRIKE" floating text

[Per frame in Game.update]
  tickActiveAmmo(activeAmmo[BOMB_STRIKE], deltaTime)
  if (input.useActive1 && canFireActive(activeAmmo[BOMB_STRIKE])):
    consumeActiveCharge(activeAmmo[BOMB_STRIKE])   // charges--, cooldown = 3.0
    // Damage pass: for each asteroid within BOMB_STRIKE_RADIUS of ship:
    //   asteroid.state.health -= BOMB_STRIKE_DAMAGE
    //   if (asteroid.state.kind === CRYSTAL && shouldCrystalFracture(state))
    //     this.fractureCrystal(liveAsteroid)
    //   if (asteroid.state.health <= 0)
    //     this.destroyAsteroid(liveAsteroid)
    //   else keepAsteroid = true
    //   mark asteroid for keep (NOT push back into this.asteroids)
    // Shard cleanse: this.activeShards = filter(s, radius check)
    // Visual: this.activeShockwaves.push(new Shockwave(shipPos, 0xff8800, 1.0))
    // Text: spawnFloatingText("BOMB!", shipPos)
    // The damage pass writes directly into this.asteroids (NOT through
    // handleCollisions) because bombs are not projectiles — they bypass
    // the projectile cull + ship-canFire gates.
```

**Important** — the bomb's damage pass must happen OUTSIDE the normal `handleCollisions` frame. Rationale: projectiles run their own per-frame integration; bombs don't. We want the bomb to feel *instant* on key press, not "wait for the next frame's collision step." Implementation: a synchronous one-shot pass in `fireActivePickup` that iterates `this.asteroids` directly, applies damage, calls the existing `fractureCrystal` / `destroyAsteroid` methods, then filters the array.

**Subtle**: the existing `handleCollisions` builds a new `aliveAsteroids` list each frame. If `fireActivePickup` runs BEFORE `handleCollisions` and modifies `this.asteroids` in place, the next `handleCollisions` call sees the post-bomb state cleanly. If it runs AFTER, same result. We will place the bomb check BEFORE `handleCollisions` in the `update` order so the shockwave + text appear the same frame the key was pressed (no 1-frame delay).

## HUD layout — two rows, not one

The expanded Phase 7 has TWO HUD regions:

| Region | Element | What it shows |
|--------|---------|---------------|
| **Bottom-center** (existing pill row from original spec) | `pickupHudElement` | One pill per ACTIVE passive effect. Drain bar + time. Max 3 pills (one per passive kind). |
| **Bottom-right** (new) | `activeHudElement` | One icon per ACTIVE pickup kind. Icon + charge count + radial cooldown sweep. Max 3 icons (one per slot). |

Phase 7 ships only BOMB_STRIKE as an active, so the bottom-right row has 1 icon (the bomb) that shows "0", "1", "2", or "3" charges with the cooldown sweep.

## Drop rates revisited (no change)

- **Crystal destroyed** → guaranteed 1 pickup, kind uniformly random across all 4 kinds (passive or active).
- **Iron LARGE destroyed** → 10% chance, same uniform 4-kind roll.
- **Iron SMALL/MEDIUM/TINY destroyed** → no pickup (preserved from the spec).

This means roughly 1 in 4 crystals drops a Bomb Strike — the player gets one every few crystal kills on average. Combined with the 10% iron LARGE drop, the player should encounter their first Bomb Strike within a minute of play.

## Future-phase hooks (designed in this spec, built later)

The architecture here is intentionally forward-compatible:

| Future pickup | Slot | Drop source | Notes |
|---------------|------|-------------|-------|
| **Mega Laser** (rank #2) | `2` | Rare drop from CRYSTAL FRACTURED state (1%) | Piercing beam, ticks 1 HP/frame |
| **Homing Missiles** (rank #3) | `3` | Boss drop only | Tracking volley |
| **Orbit Drones** (rank #5) | passive (slot 4) | 5% from IRON LARGE | Add to passive kind list |
| **Nuke** (rank #7) | `2` (replace Mega Laser) | 1% from BOSS kill | Screen-clear; replaces Mega Laser as the boss-killer |
| **Heal-on-Kill** (rank #8) | passive | 8% from CRYSTAL | Adds to passive kind list |

The "ultimate weapon" (rank #7 Nuke or the rank #2 Mega Laser) is unlocked via the first boss kill (per the research synthesis — progression-gated unlock + luck-gated runtime supply). Phase 7 builds the *infrastructure* for this; the boss itself ships in a later phase.

## Test plan additions (new file: `tests/pickups-active.test.ts`)

1. `createEmptyActiveAmmo` initializes all 4 kinds with `charges=0`, `cooldownRemaining=0`.
2. `applyPickupEffect(BOMB_STRIKE, ...)` increments charges to 1, leaves cooldown at 0.
3. `applyPickupEffect(BOMB_STRIKE, ...)` × 4 caps charges at 3.
4. `canFireActive({charges: 1, cooldownRemaining: 0})` returns true.
5. `canFireActive({charges: 0, ...})` returns false.
6. `canFireActive({charges: 1, cooldownRemaining: 1.5})` returns false (cooldown gating).
7. `consumeActiveCharge` decrements charges and sets cooldown to 3.0.
8. `consumeActiveCharge` returns false when charges=0 OR cooldownRemaining>0.
9. `tickActiveAmmo` decrements cooldown by deltaTime, floored at 0.
10. `BOMB_STRIKE_COOLDOWN_SECONDS === 3.0`, `BOMB_STRIKE_RADIUS === 5.0`, `BOMB_STRIKE_CHARGE_CAP === 3`, `BOMB_STRIKE_DAMAGE === 1`.

The existing `tests/pickups.test.ts` (passive pickup tests from the original spec) is unchanged.

## Files NOT modified

- `src/ship.ts` — signature change from the original spec is unchanged (just `fireRateMultiplier`).
- `src/asteroid.ts` — no crystal FX changes, no new methods.
- `src/crystal-fx.ts` — telegraph is unaffected.
- `src/post-processing.ts` — no bloom changes.
- `src/shockwave.ts` — reuse as-is, no API changes. If the 4.0-unit max scale is too small for the 5.0-unit bomb radius, we may extend Shockwave with a `scaleMax` override in a single-line follow-up commit — but the spec assumes the default 4.0 is close enough.

## Commit message

`feat(pickups): Phase 7 — passive pickups + active Bomb Strike (charges + cooldown)`

## Verification (additions to original)

- Vitest: existing 203 tests + 15 passive pickup tests + 10 active pickup tests = 228 tests green.
- Typecheck: clean.
- Build: clean.
- Playwright screenshot: collect a Bomb Strike (force a crystal kill, drive into the drop), capture the bottom-right HUD icon showing "1" charge.
- Playwright screenshot: press `1`, capture a frame showing the shockwave ring expanding from the ship + several floating shards removed from the scene.
- Playwright screenshot: wait 3.0s after firing, capture the bottom-right HUD icon showing the cooldown sweep fully drained and the charge count back to 0 (or 1 if more pickups were collected in the interim).

## Open questions deferred to writing-plans

- The bomb's damage pass order vs. `handleCollisions` — needs an implementation spike to confirm it doesn't double-count damage to a crystal that was just hit by a projectile the same frame.
- Should the Bomb Strike also damage the player's own ship fragments / shield? (Default: no — friendly fire off. The spec says "no" but the implementer should confirm the player has no other self-damage sources in the scene.)
- Visual: should the bomb's shockwave color be `0xff8800` (orange, matches the pickup mesh) or `0xffffff` (white, more "explosion"-like)? Spec assumes orange to match the pickup color and avoid white-out per the Phase 6c/6d additive-blending lesson.

---

# Phase 7 DIAL-UP — Two More Active Kinds (Orbit Drones + Homing Missiles)

**Status:** Design approved 2026-06-24
**Extends:** "Phase 7 EXPANSION — Active Activation Subset" above.
**Goal:** Ship 3 active pickup kinds total (Bomb Strike + Orbit Drones + Homing Missiles) in the same Phase 7 commit, not 1. Each kind occupies one slot in the bottom-right HUD and is bound to `1`/`2`/`3`.

## Why 3 actives, not 1

The single Bomb Strike in the EXPANSION spec proves the model but doesn't *use* it. With 3 distinct kinds:
- **Slot 1** (Bomb Strike) = burst AOE — single key press, radial damage, instant payoff.
- **Slot 2** (Orbit Drones) = deployable turret — key press summons a 6s autonomous helper.
- **Slot 3** (Homing Missiles) = tracking projectile — key press fires a 4-missile volley.

Three distinct activation paradigms (instant, deploy, volley) give the player real choice in their loadout. They also fill the slot row the EXPANSION spec reserved (`2` and `3`), so the architecture investment pays off in the same commit.

## The 3 active kinds (full roster)

| Kind | Key | Charges | Cooldown | Duration | Visual |
|------|-----|---------|----------|----------|--------|
| `BOMB_STRIKE` | `1` | cap 3 | 3.0 s | (instant) | Shockwave ring (existing class) + floating "BOMB!" text |
| `ORBIT_DRONES` | `2` | cap 2 | 4.0 s | 6.0 s after press | 2 cyan satellite meshes orbiting ship at radius 1.5, auto-firing at nearest asteroid |
| `HOMING_MISSILES` | `3` | cap 3 | 4.0 s | (instant) | 4 magenta tracking projectiles, 1.5s tracking, 1 HP each |

### Why these 3 (and not Mega Laser + Nuke)

User choice from the research-backed menu. The chosen trio:
- **Slot variety**: 1 burst / 2 deploy / 3 volley — three paradigms, not three variations of the same idea.
- **Reuse-heavy**: Shockwave (existing) for bomb, MeshStandardMaterial (existing) for drones, the existing projectile system (existing) for missiles. Zero new shader / mesh class.
- **No boss required**: all 3 are useful in normal play against the existing crystal/iron field. The "ultimate weapon for boss battles" deferral remains a separate phase per the GDD.

## New active #2 — Orbit Drones (rank #5 in research)

A press-to-deploy turret that:
- Spawns 2 satellite meshes that orbit the ship at radius `ORBIT_DRONES_ORBIT_RADIUS = 1.5`, angular speed `ORBIT_DRONES_ORBIT_SPEED = 2π / 1.5` rad/s (one full orbit per 1.5s).
- Each drone auto-fires at the *nearest* asteroid in `ORBIT_DRONES_TARGET_RADIUS = 4.0` every `ORBIT_DRONES_FIRE_INTERVAL = 0.4` seconds.
- Drone projectiles use the existing `fireProjectile` path — 1 HP, normal cull.
- Drones expire after 6.0s; on expiry the meshes fade out over 0.3s and are disposed.

### Why "press to deploy" (not passive pickup)

Orbit Drones live in an *active slot* because they're a *deployable resource* (charges + cooldown) not a *timer-augmenting power-up*. Two reasons:
1. **Balance**: a passive 6s drone that auto-deploys on pickup is too strong — the player would just stockpile drones from rapid crystal kills and become invincible. Charge-gating limits the total airborne time per minute.
2. **HUD consistency**: slot 2 shows "charges remaining + cooldown sweep," the same affordance as slots 1 and 3. The player learns one row to read three weapons.

### Cooldown semantics — block re-press while active

After the player presses `2`:
- Cooldown starts *after* the 6s active window expires (not at press time).
- Re-pressing `2` during the active window is silently ignored (no stacking, no timer refresh).
- Visual feedback: the slot 2 icon shows "DEPLOYED" text + a draining bar instead of charges+cooldown during the active window.
- Result: max 4 drones on screen at once (cap 2 charges × 2 drones per deploy).

## New active #3 — Homing Missiles (rank #3 in research)

A press-to-fire tracking volley that:
- Spawns 4 missile meshes from the ship's position.
- Each missile tracks the *nearest* asteroid within `HOMING_MISSILES_TRACKING_RADIUS = 8.0` for `HOMING_MISSILES_TRACKING_DURATION = 1.5s` (or until impact).
- If no asteroid is in range at spawn, missiles fly straight in the player's current aim direction for 1.5s then self-destruct.
- Each missile deals `HOMING_MISSILES_DAMAGE = 1` on impact (existing `AsteroidState.health -= 1` path).
- Missile speed: `HOMING_MISSILES_SPEED = 6.0` units/s (faster than normal projectiles' ~4.0 for arcade feel).

### Why "4-missile volley" (not 2-heavy or held-fire)

4-missile volley is the Doom Eternal Rocket model — fast, lethal, screen-filling. Two reasons:
1. **Visual signature**: 4 distinct magenta trails read instantly as "tracking weapon." A 2-missile volley reads as "two projectiles," not "homing salvo."
2. **Damage per pickup**: 4 missiles × 1 HP = 4 HP per pickup. Matches the Bomb Strike's "clears a cluster" payoff. With cap 3, the player can have 12 missiles queued for a boss phase.

### Tracking math (simple, deterministic)

Each frame for each missile:
1. Find the nearest `LiveAsteroid` within `HOMING_MISSILES_TRACKING_RADIUS`. If none, hold current heading.
2. Compute the steering vector: `(target.position - missile.position).normalize() * HOMING_MISSILES_TURN_RATE`. `HOMING_MISSILES_TURN_RATE = 8.0` rad/s of arc.
3. Apply steering to the missile's velocity (don't snap — let the missile *curve* toward target for visible tracking).

The curve is the "tracking" signature — straight-line missiles wouldn't read as homing.

## Architecture additions to the EXPANSION spec

### `src/pickups.ts` — extend `PickupKind` and constants

```ts
export enum PickupKind {
  FIRE_RATE = 'fireRate',           // passive — 6s
  SHIELD = 'shield',                // passive — 8s
  SPREAD = 'spread',                // passive — 10s
  BOMB_STRIKE = 'bombStrike',       // active — slot 1 — instant AOE
  ORBIT_DRONES = 'orbitDrones',     // active — slot 2 — 6s deploy
  HOMING_MISSILES = 'homingMissiles', // active — slot 3 — 4-missile volley
}

// Bomb Strike constants (unchanged from EXPANSION spec)
export const BOMB_STRIKE_RADIUS = 5.0;
export const BOMB_STRIKE_COOLDOWN_SECONDS = 3.0;
export const BOMB_STRIKE_CHARGE_CAP = 3;
export const BOMB_STRIKE_DAMAGE = 1;

// Orbit Drones constants (NEW)
export const ORBIT_DRONES_COOLDOWN_SECONDS = 4.0;
export const ORBIT_DRONES_CHARGE_CAP = 2;
export const ORBIT_DRONES_DURATION_SECONDS = 6.0;
export const ORBIT_DRONES_ORBIT_RADIUS = 1.5;
export const ORBIT_DRONES_ORBIT_PERIOD_SECONDS = 1.5;  // one orbit per 1.5s
export const ORBIT_DRONES_TARGET_RADIUS = 4.0;
export const ORBIT_DRONES_FIRE_INTERVAL_SECONDS = 0.4;
export const ORBIT_DRONES_DAMAGE = 1;
export const ORBIT_DRONES_DRONE_COUNT = 2;
export const ORBIT_DRONES_FADE_OUT_SECONDS = 0.3;

// Homing Missiles constants (NEW)
export const HOMING_MISSILES_COOLDOWN_SECONDS = 4.0;
export const HOMING_MISSILES_CHARGE_CAP = 3;
export const HOMING_MISSILES_VOLLEY_COUNT = 4;
export const HOMING_MISSILES_DAMAGE = 1;
export const HOMING_MISSILES_SPEED = 6.0;
export const HOMING_MISSILES_TRACKING_RADIUS = 8.0;
export const HOMING_MISSILES_TRACKING_DURATION = 1.5;
export const HOMING_MISSILES_TURN_RATE = 8.0;  // rad/s of arc

// Drone timers are per-deploy (charges cap × drones per deploy).
// Each deploy creates a new DronsTimer instance; on expiry it disposes the meshes.
export interface DroneDeploymentState {
  remaining: number;     // seconds until all drones expire
  droneMeshes: Mesh[];   // the 2 satellite meshes
  shipPosition: Vector2; // for orbit center; refresh each frame from ship state
  phase: number;         // orbital phase, advances each frame
}

// Same for missiles — a volley fires 4 missiles, each tracked until expiry or impact.
export interface HomingMissileState {
  position: Vector2;
  velocity: Vector2;
  remaining: number;     // tracking duration left
  mesh: Mesh;
  targetId: string | null;  // optional: nearest asteroid id at lock-on
}
```

### Extend `ActiveAmmoState` — keep it the same, the *dispatch* is what changes

The `ActiveAmmoState` interface stays `{ charges, cooldownRemaining }` — what changes is the per-kind *behavior table* the Game reads on pickup collect. New helper:

```ts
// Pure helper: what constants apply to each active kind?
// (DIAL-UP: this table is the single source of truth for active kind
// behavior. The EXPANSION's applyPickupEffect body reads from this table
// instead of hard-coding BOMB_STRIKE_CHARGE_CAP, so the same code path
// handles all 3 active kinds.)
export interface ActiveKindSpec {
  readonly chargeCap: number;
  readonly cooldownSeconds: number;
  readonly displayName: string;   // for HUD label ("BOMB" / "DRONES" / "MISSILES")
  readonly color: number;         // 0xff8800 / 0x66ddff / 0xff66ff
  readonly isDeployable: boolean; // true for ORBIT_DRONES (timer-based), false for BOMB / MISSILES (instant)
  readonly durationSeconds: number; // 0 for instant kinds, 6.0 for drones
}

export const ACTIVE_KIND_SPECS: Record<PickupKind, ActiveKindSpec> = {
  [PickupKind.BOMB_STRIKE]: {
    chargeCap: 3,
    cooldownSeconds: 3.0,
    displayName: 'BOMB',
    color: 0xff8800,
    isDeployable: false,
    durationSeconds: 0,
  },
  [PickupKind.ORBIT_DRONES]: {
    chargeCap: 2,
    cooldownSeconds: 4.0,
    displayName: 'DRONES',
    color: 0x66ddff,
    isDeployable: true,
    durationSeconds: 6.0,
  },
  [PickupKind.HOMING_MISSILES]: {
    chargeCap: 3,
    cooldownSeconds: 4.0,
    displayName: 'MISSILES',
    color: 0xff66ff,
    isDeployable: false,
    durationSeconds: 0,
  },
};
```

This single table replaces the 3 hand-written `if/else` branches the EXPANSION spec had for BOMB_STRIKE. The Game reads `ACTIVE_KIND_SPECS[kind].chargeCap` on pickup collect instead of hard-coding 3.

### `src/input.ts` — bind `2` and `3` to `useActive2` / `useActive3`

```ts
// In the keydown listener:
if (e.code === 'Digit1') input.useActive1 = true;
if (e.code === 'Digit2') input.useActive2 = true;
if (e.code === 'Digit3') input.useActive3 = true;

// And in keyup: same, set false.
```

### `src/game.ts` — additions

| Hook | Change |
|------|--------|
| New field | `private activeDeployments: DroneDeploymentState[] = []` — one entry per live drone deploy (1-2 simultaneous max) |
| New field | `private homingMissiles: HomingMissileState[] = []` — live missiles (up to 12 with 3 charges × 4 volley) |
| New field | `private droneMeshGroup: Group | null` — parent for all drone meshes (clean disposal) |
| New field | `private missileMeshGroup: Group | null` — parent for all missile meshes |
| `applyPickupEffect` call sites | Now reads `ACTIVE_KIND_SPECS[kind]` to set charge cap. For active kinds, increments charges. For passive kinds, unchanged. |
| `update(deltaTime)` | After `tickActiveAmmo`, add:<br>1. `tickDroneDeployments(deltaTime)` — decrements remaining, updates orbital phase, repositions drone meshes, fires projectiles at nearest target.<br>2. `tickHomingMissiles(deltaTime)` — updates position by velocity, applies tracking steering, decrements remaining, checks asteroid collision, disposes on impact/expiry.<br>3. `input.useActive1 && canFireActive(activeAmmo[BOMB_STRIKE])` → `fireActivePickup(BOMB_STRIKE)`<br>4. `input.useActive2 && canFireActive(activeAmmo[ORBIT_DRONES]) && activeDeployments.length === 0` → `fireActivePickup(ORBIT_DRONES)` (the `length === 0` is the "block re-press while active" guard)<br>5. `input.useActive3 && canFireActive(activeAmmo[HOMING_MISSILES])` → `fireActivePickup(HOMING_MISSILES)` |
| `fireActivePickup(kind)` | Dispatch on kind:<br>• BOMB_STRIKE → existing EXPANSION behavior (Shockwave + radial damage + floating text)<br>• ORBIT_DRONES → spawn 2 drone meshes, push new `DroneDeploymentState` with `remaining: 6.0`<br>• HOMING_MISSILES → spawn 4 missile meshes aimed at the player's current aim direction, push 4 `HomingMissileState` |
| `updateActiveHud(deltaTime)` | For each of 3 slots, render: small icon (square with kind color), charge count (`"3"`), and either a cooldown sweep (when on cooldown) OR a drain bar (when deployed, for ORBIT_DRONES only) OR "READY" text (when charges > 0 and not on cooldown and not deployed). |
| `stop()` | Dispose drone mesh group, missile mesh group, clear `activeDeployments` and `homingMissiles`, remove `activeHudElement` children. |

### `src/asteroid.ts` — no changes

Drone and missile projectiles use the existing `fireProjectile(angleOffsets)` path. Drone auto-fire passes `[0]` (single shot); missile volley passes 4 aim-relative offsets.

### `src/post-processing.ts` — no changes

All 3 active visuals are within the existing bloom budget (the existing 0.6 strength handles 1 shockwave + 2 drone meshes + 4 missile trails without white-out, per the Phase 6c/6d tuning).

## Data flow — orbit drones

```
[On pickup collect, kind === ORBIT_DRONES]
  applyPickupEffect(ORBIT_DRONES, ship, shield, activeAmmo)
    activeAmmo[ORBIT_DRONES].charges = min(2, current + 1)
  spawn "+DRONES" floating text

[On press '2']
  if (activeAmmo[ORBIT_DRONES].charges > 0
      && activeAmmo[ORBIT_DRONES].cooldownRemaining <= 0
      && activeDeployments.length === 0):        ← the "block re-press" guard
    consumeActiveCharge(activeAmmo[ORBIT_DRONES])
    spawnDroneDeployment(shipPos)
      creates 2 cyan Mesh (IcosahedronGeometry, MeshStandardMaterial 0x66ddff, scale 0.12)
      pushes { remaining: 6.0, droneMeshes: [m1, m2], shipPosition, phase: 0 }

[Per frame in tickDroneDeployments(deltaTime)]
  for each deployment:
    remaining -= deltaTime
    phase += (2π / 1.5) * deltaTime
    // Place 2 drones at phase + 0 and phase + π (opposite sides of orbit)
    m1.position = shipPos + (cos(phase), sin(phase)) * 1.5
    m2.position = shipPos + (cos(phase + π), sin(phase + π)) * 1.5
    fireTimer += deltaTime
    if (fireTimer >= 0.4):
      fireTimer = 0
      nearest = findNearestAsteroid(shipPos, radius=4.0)
      if (nearest):
        angle = atan2(nearest.y - shipPos.y, nearest.x - shipPos.x)
        fireProjectile([0]) with origin = drone position (NOT ship)
  if (remaining <= 0):
    start fade-out (scale *= 0.95 each frame for 0.3s)
    after 0.3s: dispose meshes, splice from array

[Cooldown starts when remaining hits 0]
  activeAmmo[ORBIT_DRONES].cooldownRemaining = ORBIT_DRONES_COOLDOWN_SECONDS  // 4.0
```

## Data flow — homing missiles

```
[On press '3']
  if (canFireActive(activeAmmo[HOMING_MISSILES])):
    consumeActiveCharge(activeAmmo[HOMING_MISSILES])
    spawnMissileVolley(shipPos, aimDir)
      for i in 0..3:
        spread = (i - 1.5) * 0.15   // ±0.225 rad spread, gives a fan pattern at spawn
        velocity = rotate(aimDir, spread) * 6.0
        push { position: shipPos, velocity, remaining: 1.5, mesh: <new magenta Mesh> }

[Per frame in tickHomingMissiles(deltaTime)]
  for each missile:
    remaining -= deltaTime
    nearest = findNearestAsteroid(missile.position, radius=8.0)
    if (nearest && remaining > 0):
      desired = (nearest.position - missile.position).normalize()
      current = missile.velocity.normalize()
      // SLERP-like: lerp current toward desired by turn rate
      newDir = lerpAngle(current, desired, HOMING_MISSILES_TURN_RATE * deltaTime)
      missile.velocity = newDir * HOMING_MISSILES_SPEED
    missile.position += missile.velocity * deltaTime
    // Check asteroid collision (simple: hypot < 0.3 = hit)
    if (collidesWithAnyAsteroid(missile.position)):
      asteroid.health -= 1
      destroy missile (dispose mesh, splice)
      if (asteroid.health <= 0): destroyAsteroid(asteroid)
    else if (remaining <= 0):
      destroy missile (dispose mesh, splice)
```

## HUD — 3 active slots

The bottom-right HUD row grows from 1 icon (BOMB only) to 3 icons (BOMB / DRONES / MISSILES). Each icon is a 56×56px div with:

```
┌─────────────────┐
│  [icon]  N      │   ← icon (square, kind color) + charge count
│  ━━━━━━━━━━     │   ← thin horizontal bar (cooldown OR duration OR full = ready)
└─────────────────┘
```

State mapping:
- **READY** (charges > 0, no cooldown, no active deploy): icon full color, count shown, bar fully filled.
- **COOLDOWN** (charges > 0, cooldownRemaining > 0): icon at 50% opacity, count shown, bar drains right-to-left as `1 - cooldownRemaining / cooldownSeconds`.
- **DEPLOYED** (only for ORBIT_DRONES during the 6s active window): icon full color, count decremented (shows 1 if 2 charges spent, 0 if both), bar drains right-to-left as `remaining / durationSeconds`.
- **EMPTY** (charges == 0, no cooldown): icon at 30% opacity, count greyed-out, bar empty.

All 3 slots render side-by-side with 8px gap, anchored 16px from bottom-right corner.

## Drop rates revisited

- **Crystal destroyed** → guaranteed 1 pickup, kind uniformly random across all 6 kinds (3 passive + 3 active).
- **Iron LARGE destroyed** → 10% chance, same uniform 6-kind roll.
- **Iron SMALL/MEDIUM/TINY destroyed** → no pickup.

With 6 kinds, the player gets one of each active kind per ~6 crystal kills on average. First-time encounter with each new active is within ~30 seconds of play.

## Test plan additions (extend `tests/pickups-active.test.ts`)

11. `ACTIVE_KIND_SPECS[BOMB_STRIKE].chargeCap === 3` and `cooldownSeconds === 3.0`.
12. `ACTIVE_KIND_SPECS[ORBIT_DRONES].chargeCap === 2` and `isDeployable === true` and `durationSeconds === 6.0`.
13. `ACTIVE_KIND_SPECS[HOMING_MISSILES].chargeCap === 3` and `isDeployable === false` and `durationSeconds === 0`.
14. `applyPickupEffect(ORBIT_DRONES, ...)` increments charges to 1.
15. `applyPickupEffect(HOMING_MISSILES, ...)` increments charges to 1.
16. Drone deployment tick: after 0.5s, both drone meshes are positioned at radius 1.5 from ship (within tolerance).
17. Drone deployment tick: after 6.0s, the deployment is removed from the array and meshes marked for disposal.
18. Missile volley spawn: pressing MISSILES produces 4 `HomingMissileState` entries with distinct velocities.
19. Missile tracking: with a target placed at 5 units, missile velocity converges toward target heading over 0.5s.
20. Missile expiry: after `HOMING_MISSILES_TRACKING_DURATION` without impact, missile is removed.
21. Missile impact: missile within `0.3` of any asteroid decrements `asteroid.health` by `HOMING_MISSILES_DAMAGE`.

## Files NOT modified (re-asserted)

- `src/asteroid.ts` — no crystal FX changes, no new methods. Drone auto-fire uses existing `fireProjectile` with origin override.
- `src/scrap.ts` — magnet math duplicated (not imported), same as EXPANSION spec.
- `src/crystal-fx.ts` — telegraph unchanged.
- `src/post-processing.ts` — no bloom changes.
- `src/shockwave.ts` — reused as-is for Bomb Strike visual.

## Commit message (DIAL-UP replaces EXPANSION commit message)

`feat(pickups): Phase 7 — 3 passive + 3 active (Bomb Strike / Orbit Drones / Homing Missiles)`

## Verification (additions to EXPANSION)

- Vitest: existing 203 tests + 15 passive pickup tests + 21 active pickup tests = 239 tests green.
- Typecheck: clean.
- Build: clean.
- Playwright screenshot: collect all 3 active kinds in sequence, capture bottom-right HUD with 3 icons showing "READY" state.
- Playwright screenshot: press `2`, capture a frame with 2 cyan drone meshes orbiting the ship + first drone projectile visible.
- Playwright screenshot: press `3` with an asteroid in front of the player, capture 4 magenta missile trails curving toward the target.
- Playwright screenshot: press `1`, capture the shockwave ring + a "DEPLOYED" / "COOLDOWN" indicator on slots 2 and 3 respectively.
- Playwright screenshot: bottom-right HUD with one slot in DEPLOYED state (drain bar), one in COOLDOWN (radial sweep), one in READY (full bar).

## Anti-patterns avoided (dial-up-specific)

- **No new shader** — drones use `MeshStandardMaterial` (existing); missiles use `MeshBasicMaterial` (existing, no PBR cost). Zero new GLSL.
- **No new global state** — `activeDeployments` and `homingMissiles` are owned by `Game`, same pattern as `activeShards`.
- **No refactor of existing projectile system** — missiles reuse `fireProjectile` with origin override; drones fire from their own position using the same call. No new projectile class.
- **No new HUD regions** — the bottom-right ammo row just grows from 1 icon to 3 icons. No new screen real estate.
- **No breaking changes to passive pickups** — `fireRateMultiplier` / shield+ / spread logic is unchanged. The 3 active kinds sit alongside the 3 passive kinds in the same `PickupKind` enum.
- **No bloom white-out** — 3 simultaneous active visuals (1 shockwave + 2 drones + 4 missiles) sit within the existing 0.6 bloom strength budget. The Phase 6c/6d tuning saga is the reference here; we are not adding new AdditiveBlending sources.

## Open questions deferred to writing-plans

- Should orbit drones prioritize *asteroid type* (always target crystal first if one is in range) or just *nearest*? Spec assumes nearest for simplicity; crystal-priority is a 1-line filter if desired.
- Should homing missiles target *shards* too, or only full asteroids? Spec assumes asteroids-only (shards are sub-targets; missiles skipping them preserves the existing shard-vs-asteroid visual hierarchy).
- Drone projectile speed: same as player projectiles (~4.0 units/s) or faster (6.0 to feel "turret-like")? Spec assumes same as player for visual consistency.
- Should the drone's auto-fire be audible? (Default: no — drones are visual-only, no new sound asset in Phase 7.)
- Should pressing `2` mid-deployment (within the 0.3s fade-out) be blocked or allowed? Spec assumes blocked (cleaner state machine).
