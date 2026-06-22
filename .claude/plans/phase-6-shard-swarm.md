# Plan — Phase 6: Shard Swarm (Signature Enemy)

## Goal
Add a new **crystal asteroid** type to the arena: a large cyan glassy rock that, when
damaged past a threshold, fractures and releases a **swarm of homing shards** that chase
the player. Destroying the crystal cleanly before the threshold prevents the swarm
entirely. This is the GDD's signature MVP enemy and Phase 6's only deliverable.

## Rules
1. **Crystal kind**: a new `kind: 'crystal'` discriminator on `AsteroidState`, distinct
   from the existing `'iron'`. Only LARGE crystals exist — they don't split into smaller
   crystals, only into shards when fractured or into MEDIUM iron pieces when clean-killed.
2. **Threshold trigger**: when a crystal's `health / maxHealth` first crosses below
   **30%**, it transitions to `fractured = true`, emits a "FRACTURING!" warning, and on
   the same frame spawns 8 outward shards. After fracturing, the crystal continues to
   take damage; if destroyed while fractured, it does **not** split — it shatters into
   nothing (just scoring).
3. **Clean kill**: if the player reduces the crystal to 0 HP while `fractured === false`,
   the crystal splits like a normal LARGE asteroid (→ 2× MEDIUM iron pieces) and grants
   a **+50 clean-kill bonus** on top of the base crystal score. No swarm.
4. **Shards**: 8 small homing shards spawn at the crystal center with outward velocity
   (1.5–2.5 units/s), then over 0.4s transition into homing mode that steers toward the
   ship at a turn rate of ≤ **120°/s**. Lifetime **2.5s**. Hit the ship → shield impact
   + knockback via existing `onShieldAbsorbedHit`.
5. **Spawn gating**: crystals appear starting at **wave 3**, no more than one per wave
   for the first 3 appearances (GDD pacing rule: one new element per approach).
6. **Visual identity**: faceted cyan glassy crystal — subdivided IcosahedronGeometry
   with `flatShading: true`, slight emissive (0x114455), high specular. Distinct from
   the grey Iron Slag and the red "targeted" asteroid.

## Design choices (locked 2026-06-22)
| # | Question | Choice | Why |
|---|----------|--------|-----|
| 1 | Threshold value | **30% of max health** | Gives a visible commitment window; not instant-punish |
| 2 | Shard count | **8** | Readable swarm, not screen-fill |
| 3 | Shard turn rate | **≤120°/s** | Readable arcs, dodgeable, looks cool |
| 4 | First appearance | **Wave 3** | GDD pacing rule |
| 5 | Material style | **Faceted cyan crystal** | Cheap, on-brand, immediately distinguishable |
| 6 | Clean-kill reward | **+50 score only** | Pickups come in Phase 7 |

## Approach

### 1. Types (`src/types.ts`)
- Add `AsteroidKind = 'iron' | 'crystal'` enum.
- Extend `AsteroidState`:
  - `kind: AsteroidKind` (defaults to `'iron'` for existing code paths)
  - `maxHealth: number` (for threshold math)
  - `fractured: boolean`
- Add `ShardState`:
  ```ts
  interface ShardState {
    position: Vector2;
    velocity: Vector2;
    angle: number;          // facing direction (radians)
    targetAngle: number;    // current desired angle (homing)
    homingDelay: number;    // seconds remaining before homing engages
    lifetime: number;
    readonly maxLifetime: number;
  }
  ```

### 2. Asteroid (`src/asteroid.ts`)
- `createAsteroidState(size, position, velocity, isTargeted, kind)` — overload with
  `kind = 'iron'` default. Crystals are LARGE-only; reject other sizes by coercion.
- `SIZE_HEALTH`: add a `crystal: 6` entry (vs LARGE iron's 4). Crystals take more hits.
- `createAsteroidMesh(size, isTargeted, kind)` — accept kind; crystal returns a cyan
  faceted material with emissive.
- `markCrystalFractured(state)` — sets `fractured = true`, returns boolean (true if it
  just transitioned, false if already fractured — prevents double-swarm).
- `splitAsteroid(state)` — crystal clean-kill path returns 2× MEDIUM iron pieces (kind
  set to `'iron'`); otherwise unchanged.

### 3. Shard module (`src/shard.ts` — new, pure)
- `MAX_SHARDS = 32` (safety cap so we never overflow an array).
- `SHARD_SPEED = 9.0`, `SHARD_LIFETIME = 2.5`, `SHARD_HOMING_DELAY = 0.4`,
  `SHARD_TURN_RATE = Math.PI * 2 / 3` (120°/s).
- `createShard(position, angle, targetPosition) → ShardState`
  - Velocity = `(cos(angle), sin(angle)) * SHARD_SPEED`
  - `homingDelay = SHARD_HOMING_DELAY`
  - `targetAngle = angle` (will update each frame)
- `updateShard(shard, deltaTime, shipPosition)`
  - `shard.homingDelay -= deltaTime`
  - If `homingDelay <= 0`: compute desired angle to ship, **steer** current
    `shard.angle` toward it by min(deltaAngle, turnRate * deltaTime). Use `atan2`
    and handle wrap-around (target - current, then normalize to [-π, π]).
  - Update `velocity` from new angle (preserve speed).
  - Integrate position.
  - Decrement lifetime.
- `isShardDead(shard, boundsRadius)` — out of bounds or lifetime ≤ 0.
- `applyShardDamageToShip(shard, ship)` — uses existing collision math
  (`circlePointCollide` from `src/utils/collision.ts`).

### 4. Shard mesh (`src/shard-mesh.ts` — new)
- `createShardMesh() → Mesh`
  - Small stretched tetrahedron or low-poly cone, length ≈0.4, cyan with emissive.
  - Returns the mesh; Game tracks rotation per frame from `shard.angle`.

### 5. Game integration (`src/game.ts`)
- Extend `Game`:
  - `private activeShards: ShardState[] = []`
  - `private activeShardMeshes: Mesh[] = []`
  - `private crystalSpawnedThisRun: number = 0` (cap at 1 per wave for first 3)
- `spawnWaveAsteroids()` — at wave ≥ 3, replace one of the standard spawns with
  `spawnCrystal()`. Crystal spawns at the arena edge.
- `damageAsteroid(state, projectile)` — update to set `fractured` when crossing
  threshold, spawn 8 shards if this is the first fracture event.
- `updateShards(deltaTime)` — new method, mirrors `updateProjectiles` style:
  - Move + age each shard
  - Cull dead shards (out of bounds or lifetime)
  - Test shard↔ship collisions; on hit, call `onShieldAbsorbedHit(contact)` with
    `damage = 1`; remove the shard.
- `scoreForKill(state, wasCleanKill)` — crystal base 250 + clean-kill bonus +50.
- Cleanup: `stop()` disposes shard meshes and clears the array.

### 6. Telemetry
- On crystal fracture: spawn a "FRACTURING!" floating text via the existing
  floating-text system (assumes one exists; if not, add a minimal one-off).

### 7. HUD
- No new HUD elements required for Phase 6. The crystal is self-evident on screen.

## Files Modified / Created

| File | Change |
|------|--------|
| `src/types.ts` | Add `AsteroidKind`, `ShardState`; extend `AsteroidState` |
| `src/asteroid.ts` | Add crystal kind, `markCrystalFractured`, extend `createAsteroidState`, `createAsteroidMesh`, `splitAsteroid` |
| `src/shard.ts` | **NEW** — pure shard logic |
| `src/shard-mesh.ts` | **NEW** — shard visual |
| `src/game.ts` | Spawn crystals, fracture logic, shard update loop, scoring, telemetry |
| `tests/shard.test.ts` | **NEW** — homing, threshold, lifetime, clean-kill tests |
| `tests/asteroid.test.ts` | Extend — crystal split vs swarm branch |

## Risks
- Shard homing can oscillate if turn rate is not clamped — use rate-limited steering.
- Wave spawn gating could break if wave counter resets on death; verify the counter
  survives respawn.
- `kind: 'crystal'` discriminator requires default value for existing call sites that
  don't pass it — default to `'iron'` to keep blast radius minimal.
- Shard array could grow unbounded if `isShardDead` is buggy — `MAX_SHARDS = 32` cap.
- Existing asteroid tests will need `kind` defaulted; check all `createAsteroidState`
  call sites in tests.

## Verification
1. `npm run typecheck` → 0 errors.
2. `npm test` → all existing tests pass + new `tests/shard.test.ts` (≥5 new tests).
3. `npm run build` → succeeds.
4. Playwright screenshot at wave 3+ → crystal asteroid visible in arena.
5. Manual smoke: let crystal cross threshold → 8 shards spawn, curve toward ship,
   trigger shield impact rings.
6. Manual smoke: clean-kill crystal → splits to 2× MEDIUM iron, +50 bonus, no shards.

## Out of Scope (deferred)
- New weapons (Split Refractor) — comes with Phase 9 matching.
- Match-element bonuses — Phase 9.
- Shard pickups / currency — Phase 7.
- Ember Skiff / Anchor Drone — future enemy phases.