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
