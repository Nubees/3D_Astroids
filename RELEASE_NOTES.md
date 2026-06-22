# Release Notes — 3D Astroids

This file documents user-facing changes shipped on each `phase-2-movement` push.
The latest release is at the top; older entries are appended below.

---

## v0.7.0 — Crystal Shard Swarm + Fracture Burst Cascade (2026-06-22)

Commit: `1c2c832` on `phase-2-movement`.

This release adds the **Crystal Shard Swarm** enemy type (Phase 6) and the
**Fracture Burst Cascade** mechanic (Phase 6b), giving the player a new high-stakes
asteroid kind that escalates over time when shot.

### ✨ New Features

#### 💎 Crystal Asteroid Kind
A third asteroid type joins Iron Slag and (eventual) others. Crystals are
**cyan faceted** with a subtle emissive glow, visually distinct from chunky
iron rocks.

- Spawns from wave 3 onward (35 % chance per slot).
- Has a **30 % damage threshold**: hitting it below 30 % health does NOT kill
  it — it **fractures** and spawns 8 homing shards.
- **+50 clean-kill bonus** if the player kills a crystal from above 30 % health
  before it fractures (rewards precise burst damage).

#### 💥 Fracture Burst Cascade
When a crystal fractures, it now escalates through a 1→2→4→8→16→24 shard
burst schedule over 10 seconds:

| Time after fracture | Burst size | Notes |
|---------------------|------------|-------|
| 0.1 s               | 1 shard    | First warning burst |
| 2.1 s               | 2 shards   | Cracked-pulse telegraph |
| 4.1 s               | 4 shards   | |
| 6.1 s               | 8 shards   | Mid-cascade |
| 8.1 s               | 16 shards  | |
| 10.1 s              | 24 shards  | **Saturation cap** — triggers 0.4 s death tween + shockwave |

Between bursts, the crystal pulses with a cracked-vein emissive texture that
eases from 0.3 → 1.0 intensity as the next burst approaches.

#### 🎯 Score Tiers
The crystal-kill moment now scores into one of 4 tiers, displayed as floating
text in-game:

| Tier | Bonus | Trigger |
|------|-------|---------|
| **ULTRA CLEAN** | +75 | Kill within 2 s of fracture |
| **CLEAN** | +100 | Kill between 2–4 s of fracture |
| **LATE** | +25 | Kill between 4–10 s (cascade still running) |
| **SURVIVOR** | +10 | Crystal completes full cascade and dies on its own |

Plus **+50 clean-kill** (the Phase 6 base bonus) when killing the crystal
BEFORE it fractures.

#### 🎁 New Hooks
- **CLUTCH** — +50 bonus when killing the crystal within 0.5 s of an imminent
  burst.
- **Telegraph** — 0.15 s ghost-line pre-burst indicator showing where the
  next wave will go.
- **PERFECT CASCADE** — +250 bonus when killing the crystal on the exact burst
  frame (50 ms window). Gated behind the CLUTCH trigger; rare and rewarding.

#### 🔊 Audio Hook (Stub)
Each burst fires a `thoom` sub-bass audio hook — currently a stub ready for
the SFX layer (Kenney.nl packs already researched in `Sound_Effects/`).

#### 🛡️ Shield Interop
Shards collide with the player's shield like small asteroids. The existing
`absorbHit` math is reused via a new `absorbShardHit` helper in `src/shield.ts`.

### 🛠️ Developer Additions

- **`window.__hooks` bridge** in `src/main.ts` — exposes
  `spawnCrystalAt(x, y)`, `fractureCrystal(id)`, `setGameTime(s)`,
  `getCrystal(id)` for deterministic Playwright screenshots. Available in both
  dev and prod.
- **9 new Playwright screenshots** in `tests/phase6b-screenshots.spec.ts`
  covering: healthy crystal, fractured pre-burst, 8/16/24-shard bursts, death
  explosion, ULTRA CLEAN+CLUTCH combo, SURVIVOR, and telegraph ghost lines.
  All saved to `.test-artifacts/phase6b-crystal-*.png`.

### 📁 Files Added / Changed

**Added** (8 files, ~2 600 lines):
- `src/crystal-fx.ts` — cracked-vein texture + pulse + death-tween helpers.
- `src/shockwave.ts` — shockwave ring on burst + death.
- `src/shard.ts` — pure shard logic.
- `src/shard-mesh.ts` — cyan emissive shard mesh.
- `tests/shard-burst.test.ts` — 35 vitest (cascade math, score tiers, hooks).
- `tests/shockwave-gpu-leak.test.ts` — 5 vitest (mock 2D context, no DOM).
- `tests/phase6b-screenshots.spec.ts` — 9 Playwright screenshots.
- `.claude/plans/phase-6-shard-swarm.md` + `phase-6-shard-swarm-escalation.md`.

**Changed**:
- `src/types.ts` — `AsteroidKind.CRYSTAL`, `fractured` flag, `FractureBurstState`,
  burst schedule constants.
- `src/asteroid.ts` — crystal mesh, 30 % threshold fracture, `swapToCrackedMaterial`,
  `drawCrackedCrystalPattern` pure function for testability, cracked material
  disposal.
- `src/game.ts` — `CrystalCascade` scheduler, 4 score-tier + 3 hook emitters,
  4 debug hooks for Playwright.
- `src/shield.ts` — `absorbShardHit` helper.
- `src/main.ts` — `__hooks` window bridge.
- `Welcome.md` + 3 polish plan files + plans README — completion status updated.
- `phase6-shard-swarm-gameplay.png` — reference screenshot.

### ✅ Quality Gates

- `npm run typecheck` → 0 errors.
- `npm test` → **179/179 vitest** across 16 test files + **10/10 Playwright**
  (1 Phase 0 + 9 Phase 6b).
- `npm run build` → green (73.61 kB main bundle).

### 🧠 Memory Trail

- `project_phase_6_shard_swarm_completed.md` — Phase 6 base summary.
- `project_phase_6b_crystal_cascade_completed.md` — Phase 6b cascade summary.
- `MEMORY.md` index updated with both entries.

### ⏭️ Next Steps

Per `project_outstanding_phases_after_b_c.md`:
- **Phase 7** — Scrap Field pickups (next recommended).
- OR — wire the sub-bass "thoom" audio hook to a real SFX layer (stub now,
  Kenney.nl pack already downloaded).

---

## v0.6.x — Earlier Releases (Polish Bucket)

Phase 2 movement identity, Ship Hangar / flame editor, Shield Panic (passive
armor with HUD + knockback), Scrap Field + Breather Zone, Asteroid Chaos,
Sound Effects research, Ship Selector, GLB ship catalog + loader, exhaust
gameplay system, ship damage, post-processing.

See git log on `phase-2-movement` for full commit history.

---
