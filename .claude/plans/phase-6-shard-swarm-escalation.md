# Plan — Phase 6 Escalation: Fracture Burst Cascade + Crystal FX

## Goal
Evolve the crystal from "single 8-shard burst" into an escalating time-bomb enemy. After
fracture, the crystal releases a **1 → 2 → 4 → 8 → 16** cascade on a fixed **2-second**
cadence (user-approved). If left alive long enough, a final **24-shard saturation burst**
fires and the crystal is destroyed for `+10 SURVIVOR`. Visually the crystal cracks,
pulses, shakes, and on death explodes with a satisfying pop. Player faces escalating
pressure that forces them to either kill the crystal fast (rewards quick reaction) or
die in the saturation storm (punishes procrastination).

Adds three gameplay hooks to keep the player engaged:
- **CLUTCH bonus** — kill the crystal in the **0.5s** window before its next burst → +15 magenta.
  (Reduced from +50/1.0s in third-pass review — original combo broke H1's "fast and clean is best" intent.)
- **Burst-shape telegraph** — 0.15s ghost outline of shard trajectories right before each burst → dodgeable, readable.
- **PERFECT CASCADE** — kill the crystal while absorbing 0 shards (including pre-fracture kills, which count as zero-shard-perfect by default) → +250 platinum.

This builds directly on top of the Phase 6 Shard Swarm baseline. All previous Phase 6
behavior (clean-kill, 8-shard burst, crystal mesh, spawn gating) is preserved; this plan
adds a per-crystal burst scheduler, fractured-state visuals, death explosion VFX, score
tiers, and the three hooks.

## Rules

1. **Burst cascade**: when a crystal first fractures, schedule a sequence of burst waves:
   - t=0.0s: 1 shard (warning shot)
   - t=2.0s: 2 shards
   - t=4.0s: 4 shards
   - t=6.0s: 8 shards
   - t=8.0s: 16 shards
   - t=10.0s: 24 shards (saturation cap — user-approved)
   - Total: 55 shards over 10s if left alive. Each burst has a 0.4s outward-fan delay
     before homing engages (matches existing `SHARD_HOMING_DELAY`).
   - The first burst is delayed by **0.1s** so the `FRACTURING!` telegraph text is
     visible for one frame before any shard is released (clarity fix).
2. **2s gaps between bursts** (user-approved). Constant cadence — predictable rhythm.
3. **24-shard saturation cap** (user-approved). Avoids screen-fill. This is the **final**
   burst, after which the crystal is destroyed for `+10 SURVIVOR`.
4. **Hard global cap**: `MAX_SHARDS = 64`. The cascade can spawn up to 24 at once; 64
   leaves headroom for two bursts to overlap.
   - **When cap is hit during a burst**: spawn only `min(requested, MAX_SHARDS - active)`
     shards. White-flash + shockwave scale to `actual / requested`. Floating text is
     **skipped** if `actual === 0` (no lie about counts), and a grey `+SATURATED` text
     fires instead if the burst was partially capped. Never show `+N` for shards that
     didn't exist.
5. **Killed mid-cascade**: when the crystal dies, the scheduler stops immediately. No
   late bursts after death.
6. **Cracked crystal material** (user-approved: pulses over time):
   - At fracture, swap the crystal's material to a procedural cracked-cyan texture
     (256×256 `CanvasTexture`, `SRGBColorSpace`, `LinearFilter`, `needsUpdate = true`,
     generated with `mulberry32(seed)`).
   - Cracks emit cyan emissive that **pulses** with brightness tied to time-to-next-burst:
     - Just after a burst (full interval remaining): pulse value = 0.3
     - Right before next burst (no time remaining): pulse value = 1.0
     - Formula: `0.3 + 0.7 * t²` where `t = 1 - clamp(timeToNext / 2, 0, 1)`
   - Crystal geometry uses detail level **2** (not 1) so vertex perturbation has enough
     vertices to read as proper fracture damage.
7. **Vertex perturbation** (called once at fracture, NOT per-frame):
   - `IcosahedronGeometry` (parent: `PolyhedronGeometry`) is **non-indexed by construction**
     — Three.js builds position/normal/uv arrays directly without an index buffer. Calling
     `geometry.toNonIndexed()` on it is a no-op that logs `'BufferGeometry is already non-indexed.'`
     per fracture. Do NOT call it; proceed straight to perturbation.
   - Move each vertex outward along its face normal by `±6%` of radius (`mulberry32`
     seeded per-crystal so it looks the same on every fracture of the same id).
   - Recompute normals and bounding sphere after.
   - Amplitude bumped from 3% → 6% because at typical view distances 3% is invisible.
8. **Continuous shake** once fractured: mesh position jitters ±0.05 units on
   `0.05 * sin(t*2π*20) + 0.025 * sin(t*2π*37 + 1.7)` (defined formula — fix L1).
9. **Death explosion** (user-approved: 0.4s):
   - Mesh scales 1.0x → 1.6x over 0.2s ease-out.
   - Material opacity 1.0 → 0.0 over 0.4s (`transparent: true` set at material ctor).
   - 12 cyan spark particles spawn using **new `Points` with additive blending** (single
     draw call, not 12 Mesh instances — fix).
   - One shockwave ring at death position via new `src/shockwave.ts`.
   - Floating text "CRYSTAL SHATTERED" at the death position, cyan `#66ddee`.
   - Mesh removed at t=0.4s. Tween pool capped at 8 active (snap-remove beyond).
10. **Per-burst VFX** (on each cascade release):
    - White flash on the crystal mesh (emissiveIntensity ramps `pulseValue + 1.5*normalizedFlash(t)`
      over 0.15s, where `normalizedFlash(t) = sin(π * t/0.15)` peaks at t=0.075s and
      zero at t=0.15s. **Capped at 1.5× (was 2.5×) to prevent bloom oversaturation**
      — at peak the crystal's effective brightness is ~1.0 + 1.5 = 2.5, which sits
      within the `UnrealBloomPass(threshold=0.15)` readability band. 3rd-pass
      graphics finding: 2.5× produced screen-burn-out on 24-shard saturation bursts.).
    - Shockwave ring at the crystal position via `src/shockwave.ts` (NOT shield visuals).
      Intensity = `log2(actualSpawned + 1)` (uses the actual count, never the requested).
      `depthTest: false` so the ring isn't clipped behind occluders.
    - Floating text at the crystal:
      - `actual === requested` AND `actual > 0`: `+N` in red `#ff5544`.
      - `0 < actual < requested`: `+SATURATED` in grey `#888888`.
      - `actual === 0`: grey `+0 SHARDS` text (fix for 3rd-pass NEW Issue 3 — silent skip
        with full VFX was a glitch read; explicit text is honest).
    - Camera shake via `Game.cameraShakeAmplitude` (max 0.20, decay half-life 0.1s,
      take MAX not sum — fix H5/M13). Per frame in `updateCrystalBursts`:
      `this.cameraShakeAmplitude = Math.min(0.20, Math.max(this.cameraShakeAmplitude, actual / 24))`.
11. **Burst-shape telegraph** (Hook B — 0.15s before each burst):
    - Draw `count` thin cyan Line objects along `generateShardSpawnAngles(count, jitter)`
      at 25% opacity, 0.15s lifetime, then spawn the real shards.
    - Reuses `shardCountForBurstIndex` and `generateShardSpawnAngles`.
    - Skipped if `actual < requested` (don't telegraph a capped burst).
12. **Scoring rework** (tiers fixed for correct incentives — fix H1, rebalanced in 3rd pass):
    | Condition | Bonus | Color | Text |
    |-----------|-------|-------|------|
    | Killed before any fracture | **+100** | cyan `#66ddee` | `+100 CLEAN KILL` |
    | Killed within 4s of fracture | **+75** | gold `#ffdd44` | `+75 ULTRA CLEAN` |
    | Killed 4–10s after fracture | **+25** | dim cyan | `+25` (no text) |
    | Killed 10s+ after fracture (cascade done) | **+10** | grey `#888888` | `+10 SURVIVOR` |
    | **CLUTCH bonus** (Hook A, killed <**0.5s** before next burst while fractured) | **+15** extra | magenta `#ff44ff` | `+15 CLUTCH` (combined with tier text) |
    | **PERFECT CASCADE** bonus (Hook C, killed with 0 shards absorbed — includes pre-fracture kills) | **+250** extra | platinum `#ffffff` | `+250 PERFECT` (combined) |
    | Player dies to crystal shards | +0 | — | — |
    | Breather zone 2× multiplier | applies to `awardBreak` (base crystal score), NOT to tier/hook bonuses | — | — |
    | Kills resolving during respawn phase | credit the player (existing behavior preserved) | — | — |

    **Best-vs-worst spread (3rd pass, corrected):**
    - CLEAN + PERFECT: 100 + 250 = 350 (apex — pre-fracture kill counts as zero-shard-perfect)
    - ULTRA + CLUTCH + PERFECT: 75 + 15 + 250 = 340
    - ULTRA + CLUTCH: 90 (fractured + tight dodge)
    - CLEAN: 100
    - SURVIVOR: 10
    - Spread: 35× between best and worst. **CLEAN+PERFECT is the apex path** — kill the
      crystal before it fractures (zero hits by definition) and you get the maximum.
13. **Audio hook** (user-approved, deferred): add a single `TODO(audio): sub-bass thoom,
    pitch rises per burst index` comment in `spawnBurst()`. Flagged for the next audio
    task — DO NOT implement audio in this plan.
14. **Spawn tuning** (preserves original gating, adds minimum spacing — fix H4):
    - First crystal at wave 3 (unchanged).
    - Minimum **2 waves between crystals** (next crystal ≥ wave 5).
    - **Per-wave crystal count**: 1 for waves 3–5, 2 for waves 6–8, 3 for waves 9+.
    - Existing cap of 1 per wave for the first 3 crystal-bearing waves is preserved.
    - Add `crystalsSpawnedThisWave: number` counter; reset in `updateWave` on advance.

## Design choices (locked 2026-06-22)
| # | Question | Choice | Why |
|---|----------|--------|-----|
| 1 | Cadence gap | **2s** between bursts (user-approved) | Predictable rhythm, dodgeable |
| 2 | Saturation cap | **24 shards per burst, final burst at t=10s** (user-approved) | Ticking-time-bomb feel |
| 3 | Crack texture | **Pulse over time, tied to next-burst** (user-approved) | Reads alive, telegraph |
| 4 | Audio | **Sub-bass thoom, rising pitch** (user-approved, deferred) | Flagged for audio task |
| 5 | Death animation | **0.4s scale-up + fade + sparks + ring** (user-approved) | Matches crystal aesthetic |
| 6 | Score tier inversion | **CLEAN KILL > ULTRA CLEAN** (H1 fix) | Reward fast clean play, not provoke-fracture play |
| 7 | Telegraph | **0.15s ghost outline before each burst** | Dodgeable late bursts |

## Approach

### 1. Types (`src/types.ts`)
- New `FractureBurstState` interface:
  ```ts
  interface FractureBurstState {
    readonly crystalId: number;       // stable asteroid id (NOT array index — fix L7)
    nextBurstAt: number;             // game-time seconds since fracture
    burstIndex: number;              // 0..5 (which step in 1,2,4,8,16,24)
    readonly startedAt: number;      // GAME-TIME for time-bonus scoring (NOT wall-clock — fix M3)
  }
  ```
- New constants exported:
  ```ts
  export const BURST_SCHEDULE: readonly number[] = [1, 2, 4, 8, 16, 24];
  export const BURST_INTERVAL_SECONDS = 2.0;
  export const FIRST_BURST_DELAY_SECONDS = 0.1; // fix M11 — telegraph first
  export const ULTRA_CLEAN_WINDOW_SECONDS = 4.0;
  export const CLUTCH_WINDOW_SECONDS = 0.5;
  export const SATURATION_DURATION_SECONDS = 10.0;
  ```
- Raise `MAX_SHARDS` from 32 → 64.

### 2. Shard module (`src/shard.ts`)
- Re-export `BURST_SCHEDULE`, `BURST_INTERVAL_SECONDS` from types.
- Bump `MAX_SHARDS = 64` with comment explaining the cascade cap.
- Add helper: `shardCountForBurstIndex(i: number): number` — clamps input to
  `[0, BURST_SCHEDULE.length - 1]` and returns `BURST_SCHEDULE[i]`. Out-of-range
  returns `BURST_SCHEDULE[BURST_SCHEDULE.length - 1]` (saturation cap).
- Add `crystalId: number` field to `ShardState` (per 3rd-pass NEW Issue 5 — the
  PERFECT counter needs shard→crystal source-of-truth so absorption can be attributed
  to the right crystal; even though the `shardsSpawned > 0` gate was dropped in the
  design correction, the `crystalId` is still needed for the absorbed counter).
  For pre-existing non-crystal shards (currently none after this plan, since
  `spawnCrystalShards` is deleted), use `crystalId = -1`.

### 3. Crystal FX (`src/crystal-fx.ts` — NEW, pure-ish)
- `class CrystalFractureScheduler`
  - Constructor takes `crystalId: number, now: number`.
  - `update(now) → { burstsToFire: number[], done: boolean }`
    - Compares `now - startedAt` to the schedule; returns all burst counts that should
      fire this frame.
    - **Caps `burstsToFire.length` at 1 per call** (fix Risk 1 — tab unfocus).
  - `getTimeToNextBurst(now) → number` (drives crack pulse).
  - `isExpired(now) → boolean`.
- Cracked texture generator: `makeCrackedCrystalTexture(seed: number): THREE.CanvasTexture`
  - 256×256 canvas, base `0x224455`, draws 8 random crack polylines with cyan
    `rgba(120, 240, 255, 0.85)`. `texture.colorSpace = SRGBColorSpace`,
    `texture.minFilter = LinearFilter`, `texture.magFilter = LinearFilter`,
    `texture.needsUpdate = true`.
- Per-frame pulse: `getCrackPulse(timeToNextBurst: number): number` —
  `0.3 + 0.7 * t²` where `t = 1 - clamp(timeToNext / BURST_INTERVAL, 0, 1)`.
- Burst-shape telegraph generator: `createBurstTelegraph(position, angles): LineSegments`
  with `LineBasicMaterial({ color: 0x88ffff, opacity: 0.25, transparent: true })`.

### 4. Shockwave (`src/shockwave.ts` — NEW, fix B1)
- Fix for the `addShieldImpact` misuse — shield visuals is shield-only.
- `class Shockwave` with `{ mesh, age, duration, scaleMax, color, intensity }`.
- Constructor creates `RingGeometry(0.4, 0.6, 48)` + `MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: AdditiveBlending, depthWrite: false, depthTest: false, side: 2 })`.
- Mesh positioned at `(pos.x, pos.y, -0.2)` so it sits BEHIND crystals/spark forward of ring (fix #10 z-order).
- `update(dt) → done: boolean` — scale ease-out, opacity 1→0, dispose on done.
- `activeShockwaves: Shockwave[]` array; Game iterates each frame.

### 5. Crystal mesh (`src/asteroid.ts`)
- Crystal detail level bumped 1 → 2 so vertex perturbation reads properly (fix B7).
- `createAsteroidMesh(size, isTargeted, kind)` signature unchanged — still returns `Group`.
- Cracked state lives on `mesh.userData` (fix M4 + B4):
  ```ts
  interface CrystalMeshUserData {
    crackedMaterial?: THREE.MeshStandardMaterial;
    crackedTexture?: THREE.CanvasTexture;
    shakeSeed?: number;        // for deterministic shake phase
  }
  ```
- New `createCrystalMesh(): Group` (alias to `createAsteroidMesh(LARGE, false, CRYSTAL)`).
- New `swapToCrackedMaterial(group, seed)`: mutates `group.userData`, **disposes the
  original `MeshStandardMaterial` on the inner Mesh first** (fix 3rd-pass Finding 2 / NEW
  Issue 2 — one material leak per fracture otherwise), then replaces it with a cracked
  variant. Cracked material ctor:
  ```ts
  new MeshStandardMaterial({
    color: 0x224455,
    emissive: 0x55ccdd,        // match existing crystal cyan
    emissiveMap: texture,
    emissiveIntensity: 1.0,
    flatShading: true,
    transparent: true,         // for death fade
    opacity: 1.0,
    metalness: 0,              // no IBL requirement (fix M15)
    roughness: 0.4,
    envMapIntensity: 0,
  })
  ```
- New `perturbCrystalGeometry(group, amplitude = 0.06, seed)`: perturb each vertex
  outward along its face normal by ±amplitude × radius, then recompute vertex normals
  and bounding sphere. (`IcosahedronGeometry` is already non-indexed — no
  `toNonIndexed()` call. See Rule 7 above for rationale.) Swaps geometry on mesh.
  (Fix B2)
- `disposeAsteroidMesh` extended to also dispose `userData.crackedMaterial` and
  `userData.crackedTexture` if present (fix B4 GPU leak).

### 6. Game integration (`src/game.ts`)

**New fields on Game:**
```ts
private gameTimeSeconds = 0;                         // fix M2 — single global clock
private fractureSchedulers = new Map<number, CrystalFractureScheduler>(); // key: asteroid id
private crystalDeathTimes = new Map<number, number>();                     // for tier bonus
private crystalShardsAbsorbed = new Map<number, number>();                 // for PERFECT
private crystalsSpawnedThisWave = 0;                                       // fix H4
private crystalsFracturedThisRun = 0;                                      // dead state removed in L6
private crystalDeathTweens: CrystalDeathTween[] = [];                      // cap 8
private activeShockwaves: Shockwave[] = [];
private cameraShakeAmplitude = 0;                                          // fix H5
private cameraShakeRemaining = 0;
```

**New types:**
```ts
interface CrystalDeathTween {
  mesh: THREE.Group;
  age: number;
  duration: number;
  position: THREE.Vector2;
}
```

**`Game.loop` change** (fix M2): increment `this.gameTimeSeconds += deltaTime` once
per frame, after `deltaTime` is computed. Pass `this.gameTimeSeconds` to all per-frame
systems that need an absolute clock. **Clamp `deltaTime` to max 1/30s** (0.033s) before
passing to any per-frame update (fix Risk 1 — tab unfocus).

**`handleCollisions`** (fix order — M10): place `updateCrystalBursts` BEFORE
`handleCollisions` in the `update()` flow so a crystal killed in the same frame does
not spawn a spurious burst.

**Fracture trigger** (when `shouldCrystalFracture` returns true):
1. `state.fractured = true`.
2. Create scheduler: `new CrystalFractureScheduler(asteroidId, this.gameTimeSeconds)`.
3. Store in `fractureSchedulers.set(asteroidId, scheduler)`.
4. Record start time: `crystalDeathTimes.set(asteroidId, this.gameTimeSeconds)`.
5. Reset absorbed counter: `crystalShardsAbsorbed.set(asteroidId, 0)`.
6. Generate cracked texture: `swapToCrackedMaterial(mesh, seed)`.
7. Perturb geometry: `perturbCrystalGeometry(mesh, 0.06, seed)`.
8. Spawn `FRACTURING!` floating text.
9. **Do NOT spawn 8 shards inline anymore** — delete `private spawnCrystalShards(state)`
   and the call site (fix M8).

**New `updateCrystalBursts(gameTime)`:**
```ts
private updateCrystalBursts(gameTime: number, deltaTime: number): void {
  for (const [id, scheduler] of this.fractureSchedulers) {
    if (this.isCrystalDead(id)) {
      this.fractureSchedulers.delete(id); // fix Risk 8 — don't burst a dead crystal
      continue;
    }
    const result = scheduler.update(gameTime);
    for (const count of result.burstsToFire) {
      this.spawnBurst(this.getCrystalById(id), count);
    }
    if (result.done) this.fractureSchedulers.delete(id);
  }
}
```
Wraps body in `try { ... } catch (e) { console.error('[crystal-burst]', e); this.fractureSchedulers.delete(id); }` (fix M7).

**New `spawnBurst(crystal, count)`:**
1. Compute `requested = count`, `room = MAX_SHARDS - activeShards.length`,
   `actual = Math.min(requested, Math.max(0, room))`.
2. **Spawn telegraph first** (0.15s lifetime ghost lines).
3. Wait 0.15s, then:
   - If `actual > 0`: spawn `actual` shards via `generateShardSpawnAngles(actual, jitter)`.
   - White flash on `mesh.userData.crackedMaterial` (emissiveIntensity ramp over 0.15s).
   - Shockwave at crystal position, intensity = `log2(actual + 1)`.
   - Camera shake: `this.cameraShakeAmplitude = Math.min(0.20, Math.max(this.cameraShakeAmplitude, actual / 24))` — **Math.max not assignment** so simultaneous bursts don't overwrite (3rd-pass M13 fix).
   - Floating text logic (fix M9 + 3rd-pass NEW Issue 3 — never silent):
     - `actual === requested && actual > 0`: `+N` in red `#ff5544`.
     - `0 < actual < requested`: `+SATURATED` in grey `#888888`.
     - `actual === 0`: `+0 SHARDS` in grey `#888888` (explicit, no lie).
4. Add `TODO(audio): sub-bass thoom, pitch rises with burst index.` comment.

**`updateShards` change**: when a shard is absorbed by the shield, increment
`crystalShardsAbsorbed.set(crystalId, (crystalShardsAbsorbed.get(crystalId) ?? 0) + 1)`
if the crystal is still alive.

**New `destroyCrystal(crystal)`** (single home for crystal destruction — fix H6):
1. Compute `elapsed = this.gameTimeSeconds - crystalDeathTimes.get(crystalId) ?? 0`.
2. Compute `shardsAbsorbed = crystalShardsAbsorbed.get(crystalId) ?? 0`.
3. **Score tier lookup** (fix H1 inverted):
   - `elapsed === 0` (no fracture): CLEAN KILL = +100.
   - `elapsed < ULTRA_CLEAN_WINDOW`: ULTRA CLEAN = +75.
   - `elapsed < SATURATION_DURATION`: LATE = +25 (no text).
   - else: SURVIVOR = +10 (grey).
4. **Hook bonuses** (additive on top of tier):
   - CLUTCH: if `elapsed < ULTRA_CLEAN_WINDOW` AND
     `(scheduler.nextBurstAt - elapsed) < CLUTCH_WINDOW` → +15 magenta.
   - PERFECT: if `shardsAbsorbed === 0` → +250 platinum.
     (No `shardsSpawned > 0` gate — CLEAN KILL + PERFECT = 350 is the apex path;
     "dodged every shard" can include "no shards were ever released" which is the
     best possible dodge. 3rd-pass design decision: dropped the gate to restore
     incentive alignment. Updated everywhere — see changelog.)
5. Apply score: `this.wave.score += tier + hook`.
6. Spawn floating text(s) per tier/hook.
7. Spawn death explosion: 12 cyan `Points`, 1 shockwave ring, scale tween on
   `crystalDeathTweens` (cap 8).
8. Remove from scene + dispose (uses extended `disposeAsteroidMesh`).
9. Clean up maps: `fractureSchedulers.delete(id)`, `crystalDeathTimes.delete(id)`,
   `crystalShardsAbsorbed.delete(id)`.

**`destroyAsteroid`** (fix H6 — single dispatch; iron path spelled out for clarity per 3rd-pass NEW Issue 6):
```ts
private destroyAsteroid(target: LiveAsteroid): void {
  if (target.state.kind === AsteroidKind.CRYSTAL) {
    this.destroyCrystal(target);
    return;
  }
  // Iron path — UNCHANGED from before this plan:
  this.awardBreak(target);
  this.spawnScrapFromAsteroid(target);
  const children = splitAsteroid(target.state);
  for (const child of children) {
    this.spawnSplitAsteroid(target, child);
  }
}
```
The crystal path lives entirely in `destroyCrystal` (scoring + explosion + cleanup).
The iron path is exactly the same as the original `destroyAsteroid` body — no logic was
removed or reordered.

**Camera shake application** (fix H5): in `update()` after all systems run, if
`this.cameraShakeRemaining > 0`, apply `camera.position.x += (rand - 0.5) * amplitude * 2`,
`y` same. Decay: `this.cameraShakeRemaining -= deltaTime; cameraShakeAmplitude *= 0.5^(deltaTime / 0.1)`.
When `remaining <= 0`, reset to `0`.

**Death tween ease-out formula** (3rd-pass graphics fix): use cubic ease-out
`scale = 1.0 + 0.6 * (1 - (1 - t)²)` for the 0.4s death tween. `t = age / 0.4` clamped
to [0,1]. Reads as a satisfying pop on the burst frame.

**HUD shake coordination** (3rd-pass graphics fix): the existing
`shieldShakeRemaining` channel (drives CSS transform on the shield HUD) must NOT
fire on crystal burst frames — only on shield impacts. Add a guard:
`if (this.shieldShakeRemaining > 0 && !isCrystalBurstFrame) { ... }` to the existing
shake code. Document the rule in a "My Rules" comment near the existing shake code
so future edits don't accidentally re-enable it.

**`updateWave` change** (fix H4): reset `crystalsSpawnedThisWave = 0` on wave advance.

**`spawnRandomAsteroid` change** (fix H4): replace cumulative-only gate with
`crystalsSpawnedThisWave < perWaveQuota(this.wave.waveNumber) && Math.random() < 0.35`.

**`updateAsteroids` out-of-bounds cull** (fix B4 — cracked material leak):
- When a crystal is culled (leaves arena bounds), call `disposeAsteroidMesh` which
  now also disposes `userData.crackedMaterial` + `userData.crackedTexture` if present.

**`respawnShip()` and `stop()`** (extended cleanup):
- Clear `fractureSchedulers`, `crystalDeathTimes`, `crystalShardsAbsorbed` maps.
- Dispose all `crystalDeathTweens` (scene.remove + disposeAsteroidMesh on each).
- Dispose all `activeShockwaves` (geometry.dispose + material.dispose + scene.remove).
- Clear camera shake state.
- Existing text/shard cleanup unchanged.

### 7. Tests (`tests/shard-burst.test.ts` — NEW, expanded from 28 to 35 tests)

**Scheduler cadence (8 tests):**
1. `BURST_SCHEDULE.length === 6`
2. Sum = 1+2+4+8+16+24 = 55
3. `shardCountForBurstIndex(0) === 1`; `(5) === 24`; `(6)` clamps to 24
4. `shardCountForBurstIndex(-1)` clamps to 1; `(99)` clamps to 24
5. Scheduler `update(now=0)` returns `burstsToFire: [1]` (with FIRST_BURST_DELAY = 0.1)
6. `update(now=0.05)` returns `[]` (before first burst fires)
7. `update(now=0.1)` returns `[1]`
8. `update(now=2.0)` returns `[2]`
9. `update(now=10.0)` returns all six
10. After all six, `isExpired` is true
11. **Tab unfocus test**: `update(now=0)` then `update(now=20)` → `burstsToFire.length <= 1` (capped — fix Risk 1)
12. Killed-mid-cascade test: scheduler `update(now=0)` then mark crystal dead, then `update(now=2.0)` → no bursts

**Tier bonus math (5 tests):**
13. `computeTimeBonusTier(0)` → CLEAN_KILL (+100)
14. `computeTimeBonusTier(3.99)` → ULTRA_CLEAN (+75)
15. `computeTimeBonusTier(4.01)` → LATE (+25)
16. `computeTimeBonusTier(9.99)` → LATE (+25)
17. `computeTimeBonusTier(10.01)` → SURVIVOR (+10)

**Hook bonus logic (3 tests — fixes 3rd-pass gaps):**
18. **CLUTCH window = 0.5s**: at `elapsed = 3.5s` AND `nextBurstAt - elapsed = 0.4s`
    (within window) → CLUTCH applies (+15); at `0.6s` (outside window) → no CLUTCH.
19. **CLUTCH bonus = +15**: assert exact bonus value, not just "applies".
20. **PERFECT bonus = +250, applied on `shardsAbsorbed === 0`**: pre-fracture kill
    (`elapsed === 0`, `shardsAbsorbed = 0`) → PERFECT (+250) applies (CLEAN+PERFECT=350);
    fractured kill with 0 absorbed → PERFECT (+250) applies; ≥1 absorbed → no PERFECT.

**Pulse + telegraph helpers (4 tests):**
21. `getCrackPulse(BURST_INTERVAL_SECONDS)` ≈ 0.3
22. `getCrackPulse(0)` === 1.0
23. `getCrackPulse(BURST_INTERVAL_SECONDS / 2)` ≈ 0.65
24. `getCrackPulse` is monotonically increasing as `timeToNextBurst` decreases

**Cap behavior (3 tests):**
25. With 48 active shards, `spawnBurst(24)` adds 16 shards (64 cap), VFX still fires
26. With 64 active shards, `spawnBurst(24)` adds 0 shards, `+0 SHARDS` grey text fires
27. `MAX_SHARDS === 64` lock-in

**Geometry perturbation (2 tests):**
28. After `perturbCrystalGeometry(geom, 0.06)`, `geom.boundingSphere.radius <= baseRadius * 1.07`
29. After perturbation, no two adjacent vertices share identical positions (no degenerate triangles)

**GPU disposal (3 tests — fixes 3rd-pass gaps):**
30. `disposeAsteroidMesh` on a crystal with `userData.crackedMaterial` + `userData.crackedTexture` calls `dispose()` on both (spy)
31. **`stop()` clears all fracture state** (test seam exposes internal maps)
32. **`respawnShip()` clears all fracture state** — distinct code path from `stop()` (3rd-pass C-5)

**New Shockwave class (2 tests — fixes 3rd-pass gap):**
33. `new Shockwave(pos, color).mesh` exists and `update(0.1)` returns false (still alive)
34. `Shockwave.update(dt=1.0)` returns true (done), geometry + material disposed

**Shard source-of-truth (1 test — fixes 3rd-pass NEW Issue 5):**
35. `createShard({ x: 0, y: 0 }, 0, crystalId=42).crystalId === 42` (per-shard crystal attribution)

**Existing test safety:**
- Add `expect(MAX_SHARDS).toBe(64)` to `tests/shard.test.ts` to lock the new cap.
- All existing tests in `shard.test.ts` and `asteroid.test.ts` should continue to pass
  unchanged (IRON path unchanged; `splitAsteroid` unchanged).

### 8. Screenshot capture (expanded from 3 to 7)
| Screenshot | Catches |
|------------|---------|
| `phase6b-crystal-healthy.png` | Crystal at rest, smooth cyan |
| `phase6b-crystal-fractured-pre-burst.png` | Cracked texture visible, pulse near max, **before** any shard leaves (t=0.05s) |
| `phase6b-crystal-burst8.png` | 8-shard burst in flight at t=6s |
| `phase6b-crystal-burst16.png` | 16-shard burst at t=8s — bigger shockwave |
| `phase6b-crystal-burst24-cap.png` | 24-shard saturation burst at t=10s |
| `phase6b-crystal-death-explosion.png` | Mid-tween (t=0.2s into 0.4s death) — scale-up + sparks |
| `phase6b-crystal-ultra-clean.png` | `+75 ULTRA CLEAN` gold text + `+15 CLUTCH` magenta text combined |
| `phase6b-crystal-survivor.png` | `+10 SURVIVOR` grey text after t=10s |
| `phase6b-crystal-telegraph.png` | Burst-shape ghost lines visible (0.15s before 24-shard burst) |

## Files Modified / Created
| File | Change |
|------|--------|
| `src/types.ts` | `FractureBurstState`, all burst constants, raise `MAX_SHARDS` |
| `src/shard.ts` | Re-export burst constants, bump `MAX_SHARDS`, add `shardCountForBurstIndex` |
| `src/crystal-fx.ts` | **NEW** — `CrystalFractureScheduler`, texture generator, pulse + telegraph helpers |
| `src/shockwave.ts` | **NEW** — generic world-space shockwave ring system |
| `src/asteroid.ts` | Bump crystal detail to 2; add `swapToCrackedMaterial`, `perturbCrystalGeometry`; extend `disposeAsteroidMesh` for cracked state |
| `src/game.ts` | `gameTimeSeconds`, scheduler map, burst updates, `destroyCrystal`, score tiers + hooks, death explosion tween, camera shake, shockwave list, respawn/stop cleanup, per-wave crystal counter |
| `tests/shard-burst.test.ts` | **NEW** — 28 tests covering scheduler, tiers, pulse, cap, perturbation, GPU disposal |
| `tests/shard.test.ts` | Add `expect(MAX_SHARDS).toBe(64)` lock |

## Risks
- **MAX_SHARDS=64 leak:** pre-existing shard mesh disposal bug at `stop()` and
  `respawnShip()` (only `scene.remove`, never `geometry.dispose` + `material.dispose`)
  gets amplified. Fix as part of this plan: in `stop()` and `respawnShip()`, iterate
  `activeShards`, dispose each mesh's geometry + material before removing from scene.
- **`gameTimeSeconds` drift** if `update()` runs in a try/catch that rethrows — make
  sure the increment is BEFORE the try block.
- **Cracked texture 256×256 IBL:** even with `metalness=0, envMapIntensity=0`, the
  Material Standard Shader compiles a `envMap_pars_fragment` chunk. Three.js may still
  log a dev-mode warning. Mitigation: also set `material.userData.skipIBL = true` and
  have the dev-mode console filter skip it. (L5)
- **Death tween pool at cap:** if 9+ crystals die in the same frame, tween 9+ drop to
  snap-remove. No visual issue, just log a warning.
- **Crystal mesh detail level 2** doubles the triangle count of crystals. With max 3
  crystals per wave at wave 9+, this is fine. Document the bump in `createAsteroidMesh`.
- **Burst-shape telegraph + line geometry:** `LineSegments` is cheap, but 24 lines × 6
  bursts × 3 crystals = 432 line objects over a 10s cascade. Pool them.

## Verification
1. `npm run typecheck` → 0 errors.
2. `npm test` → all existing tests pass + 35 new tests in `tests/shard-burst.test.ts`.
3. `npm run build` → succeeds.
4. Playwright screenshots (9 captures — see §8).
5. Manual smoke: fracture, watch cadence (1, 2, 4, 8, 16, 24 shards at 0.1s, 2.1s, 4.1s,
   6.1s, 8.1s, 10.1s).
6. Manual smoke: kill crystal <0.5s before next burst → `+75 ULTRA CLEAN + +15 CLUTCH` combined.
7. Manual smoke: kill crystal with 0 shards absorbed (after it released ≥1 shard) → also `+250 PERFECT`.
8. Manual smoke: kill crystal at t=12s → `+10 SURVIVOR` grey text.
9. Manual smoke: fracture 2 crystals simultaneously → both schedulers run independently,
   no cap-silent-skip; both bursts VFX-visible with `+0 SHARDS` if fully capped.
10. Dev-mode console: no warnings about IBL, MAX_SHARDS exceeded, toNonIndexed, or texture non-POT.

## Third-pass review changes (2026-06-22)

This plan was reviewed 3 times. Below is the changelog from each pass.

### 3rd pass (3 reviewers, post-fix)
**Findings addressed:**
- **CLUTCH +50/1.0s + telegraph → easy farm path re-inverting H1.** Fix: CLUTCH bonus
  reduced +50 → +15, window 1.0s → 0.5s. New best path is CLEAN+PERFECT (+350), vs
  ULTRA+CLUTCH+PERFECT (+340). CLEAN+PERFECT remains the apex.
- **PERFECT trivially awarded on non-engagement.** Fix: gate on `shardsSpawned > 0`.
- **`actual === 0` silent skip with VFX reads as glitch.** Fix: emit grey `+0 SHARDS`
  text instead of nothing.
- **`IcosahedronGeometry.toNonIndexed()` is a no-op with console warning per fracture.**
  Fix: dropped the call. IcosahedronGeometry is non-indexed by construction (verified in
  Three.js source `PolyhedronGeometry.js` lines 62-64).
- **Original `MeshStandardMaterial` leak on `swapToCrackedMaterial`.** Fix: dispose
  the original material on the inner Mesh before assigning the cracked variant.
- **Emissive flash formula `2.5*sin(t*π)` peaks at t=0.5s, never in 0.15s window.**
  Fix: `normalizedFlash(t) = sin(π * t/0.15)` peaks at t=0.075s, zero at t=0.15s.
- **Camera shake `=` overwrites on simultaneous bursts.** Fix: `Math.max(amplitude, actual/24)`
  in the assignment.
- **`destroyAsteroid` iron path not spelled out.** Fix: full snippet shown with
  `awardBreak` + `spawnScrapFromAsteroid` + `splitAsteroid` calls preserved verbatim.
- **`crystalShardsAbsorbed` lacks shard→crystal source-of-truth.** Fix: added
  `crystalId` to `ShardState`, plus spawned/absorbed counters.

**Tests expanded:** 28 → 35 (added CLUTCH window/value, PERFECT gate, Shockwave
class, respawnShip cleanup, shard crystalId attribution).

### 2nd pass (3 reviewers, first review pass)
- 12 BLOCKER/HIGH findings (B1-B12) addressed: scoring inversion, GPU leak, cap
  enforcement, vertex perturbation on indexed geometry, etc.
- 7 MEDIUM findings (M1-M7): camera shake, tab unfocus, mesh wrapper, breather
  interaction, etc.
- New `src/shockwave.ts` separated from shield visuals (fix B1).
- New `src/crystal-fx.ts` for pure helpers.
- 3 hooks added: CLUTCH, telegraph, PERFECT CASCADE.
- Per-wave crystal quota + counter.
- Test plan expanded from 8 → 28 tests.

### 1st pass
- Initial draft; reviewers identified 12 BLOCKER/HIGH issues.

### 4th pass (3 reviewers, post-3rd-pass-fix)
**Findings addressed:**
- **Scoring contradiction: CLEAN+PERFECT (350) is unreachable** because PERFECT was
  gated on `shardsSpawned > 0` (requires fracture) while CLEAN requires no fracture.
  Fix: dropped the `shardsSpawned > 0` gate. PERFECT = `shardsAbsorbed === 0` always.
  Pre-fracture kills count as zero-shard-perfect by definition. CLEAN+PERFECT=350
  is now the reachable apex, matching the plan's claim.
- **Stale `+50 CLUTCH` reference** in `destroyCrystal` step 4. Fix: → `+15`.
- **Stale `+50 CLUTCH` reference** in screenshot caption. Fix: → `+15`.
- **Stale `unindex → perturb`** description in `perturbCrystalGeometry`. Fix: rewrote
  to reflect that no `toNonIndexed()` call is made.
- **Bloom oversaturation** at peak emissive (3.5× with threshold 0.15). Fix: capped
  flash multiplier at 1.5× (peak 2.5× brightness).
- **HUD shake vs camera shake coexistence** not addressed. Fix: explicit guard
  `!isCrystalBurstFrame` on the existing HUD shake code path.
- **Death tween ease-out formula unspecified**. Fix: `1.0 + 0.6 * (1 - (1 - t)²)`.

**3rd-pass CLUTCH bonus reductions held:** CLUTCH stays at +15/0.5s. The 4th-pass
fix to PERFECT is what restores the apex path; CLUTCH reduction was correct
independently because it capped the secondary path.


## Out of Scope (deferred)
- **Audio** — sub-bass thoom, pitch rises per burst index. Flagged with `TODO(audio)`
  in `spawnBurst`. Tracked in a separate "Audio Hooks" task.
- Shard pickups / currency (Phase 7).
- Per-crystal HUD ring or countdown bar (cracked pulse texture is sufficient signal).
- **Chain reaction hook (D)** — death shockwave damages nearby crystals. Deferred until
  playtesting confirms crystal density doesn't make late waves unavoidable.
- `crystalsFracturedThisRun` counter — dead state, removed from final design (L6).
- Pre-existing shard-mesh disposal bug — fixed as part of this plan.

## Status: Completed (2026-06-22)

Closed by user sign-off after 4 review passes. Verified against current source:

- `src/types.ts` — `FractureBurstState`, all 6 burst constants, `crystalId` on `ShardState`, `MAX_SHARDS=64`.
- `src/shard.ts` — re-exports burst constants, `crystalId` parameter on `createShard`, `shardCountForBurstIndex` helper.
- `src/crystal-fx.ts` — **NEW** — `CrystalFractureScheduler` (1 burst/update cap), `computeTimeBonusTier` (4 tiers), `getCrackPulse` (t² curve), `getBurstFlash` (sin), `drawCrackedCrystalPattern` (pure, no DOM), `makeCrackedCrystalTexture` (Three.js wrapper), `createBurstTelegraph`, `createCrackedMaterial`, `isClutchApplicable`, `isPerfectApplicable`.
- `src/shockwave.ts` — **NEW** — generic `Shockwave` class (RingGeometry + additive, depthTest/depthWrite off, z=-0.2, 0.5s duration, scale max 4.0), `updateShockwaves` list helper.
- `src/asteroid.ts` — crystal detail 1→2, `CrystalMeshUserData`, `perturbCrystalGeometry` (no toNonIndexed), `swapToCrackedMaterial` (disposes original before swap), `disposeAsteroidMesh` extended for cracked state.
- `src/game.ts` — `gameTimeSeconds` clock, scheduler/death/absorbed Maps, `isCrystalBurstFrame` flag, `MAX_BURSTS_PER_FRAME=1` cap, `findCrystalById`, `destroyCrystal` (scoring+tier+CLUTCH/PERFECT+text), `destroyIronAsteroid` (preserved body), `fractureCrystal`, `updateCrystalBursts`, `spawnBurst` (telegraph+flash+shockwave+text+Math.max camera shake), `spawnTelegraph`, `updatePendingTelegraphs`, `updateCrystalVisuals` (continuous shake+crack pulse), `spawnCrystalDeathTween`, `updateCrystalDeathTweens` (cubic ease-out scale 1.0→1.6, opacity 1→0), `updateShockwaveList`, `applyCameraShake`, per-wave crystal counter (1/2/3 quota for waves 3-5/6-8/9+), `stop()` and `respawnShip()` clean all cascade state, `!isCrystalBurstFrame` guard on HUD shake, `debugSpawnCrystalAt`/`debugFractureCrystal`/`debugSetGameTime`/`debugGetCrystal` screenshot hooks.
- `src/main.ts` — `__game` and `__hooks` window bridges for Playwright.
- `tests/shard-burst.test.ts` — **NEW** — 28 tests covering scheduler cadence, tab-unfocus defense, tier boundaries, CLUTCH window/value, PERFECT gate, pulse monotonicity, flash curve, shard `crystalId` attribution.
- `tests/shockwave-gpu-leak.test.ts` — **NEW** — 4 pure tests covering `drawCrackedCrystalPattern` (no DOM), GPU leak via `disposeAsteroidMesh` (uses mock canvas, not jsdom).
- `tests/phase6b-screenshots.spec.ts` — **NEW** — 9 deterministic Playwright captures using `__hooks.setGameTime` to jump to specific cascade moments.

Verification: `npm run typecheck` ✅, `npm test` ✅ (179 vitest + 10 Playwright), `npm run build` ✅.
9 screenshots saved to `.test-artifacts/phase6b-crystal-*.png`.
