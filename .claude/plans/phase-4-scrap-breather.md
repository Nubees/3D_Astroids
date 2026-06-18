---
name: phase-4-scrap-breather
description: Phase 4 replacement — Scrap Field + Breather Zone. Asteroids drop scrap that magnetizes to the ship; filling a meter deploys a temporary safe zone that recharges shield and boosts score.
---

# Phase 4 — Scrap Field + Breather Zone

**Date:** 2026-06-18
**Goal:** Replace the abandoned planet-alignment Phase 4 with an Arena-native mechanic that rewards breaking asteroids and gives the player a clutch, deployable safe zone.
**Decision:** User chose Option A from the Phase 4 replacement brainstorm.

## 1. Overview

Breaking asteroids releases short-lived Scrap. A magnet ring around the ship auto-collects Scrap. Collecting Scrap fills a **Breather Zone** meter. When the meter is full, the player can deploy a temporary bubble at the ship's current position. Inside the bubble, shield energy recharges rapidly and the player earns a small score multiplier.

This mechanic:
- Rewards every break beyond points.
- Creates a moment-to-moment resource to manage.
- Provides a clutch choice: deploy now or save for a worse wave.
- Requires no persistence, menus, or blueprint systems.

## 2. Scope

**In scope:**
- Scrap entity and `ScrapManager`.
- Magnet radius around the ship.
- Scrap drops from asteroid destruction (size-scaled chance).
- Breather Zone meter and deployment input (`X` key by default).
- Deployed zone: visual bubble, shield recharge, score multiplier.
- Zone duration and cleanup.
- Unit tests for scrap spawning, magnet pickup, and zone logic.

**Out of scope:**
- Persistent currency.
- Blueprints or permanent upgrades.
- Other loot types (gold/gems) — deferred to later phases.

## 3. Files

| File | Change |
|---|---|
| `src/types.ts` | Add `Scrap` type and `BreatherZoneState` interface. |
| `src/scrap.ts` | New file: scrap state, update, spawn logic, magnet collection. |
| `src/breather.ts` | New file: meter, deployment, zone state, shield recharge, score multiplier. |
| `src/input.ts` | Add `deployBreather` input (`x` key). |
| `src/game.ts` | Wire scrap spawning, collection, meter, deployment, zone update/render. |
| `src/waves.ts` | Apply score multiplier during active zone. |
| `tests/scrap.test.ts` | Unit tests for scrap collection. |
| `tests/breather.test.ts` | Unit tests for meter and zone effects. |

## 4. Design Details

### Scrap Drops
- Small asteroid: 20% chance
- Medium asteroid: 40% chance
- Large asteroid: 60% chance
- Scrap drifts downward slowly.
- Lifetime: 8 seconds.
- Value: 1 scrap unit each.

### Magnet
- Base radius: 2.5 world units.
- Visualized by a faint pulse ring around the ship.

### Breather Zone Meter
- Cost to fill: 8 scrap units.
- HUD shows `ZONE 5/8` or `READY` when full.
- Deployment key: `X`.

### Deployed Zone
- Duration: 6 seconds.
- Radius: 4 world units.
- Shield recharge rate: 5× normal while inside.
- Score multiplier: 1.5× for breaks made inside the zone.
- Visual: translucent bubble around ship.

## 5. Risk Assessment

| Risk | Mitigation |
|---|---|
| Zone trivializes wave pressure | Zone has short duration and requires scrap farming. |
| Visual clutter from scrap + asteroids | Use bright gold color and small size; limit on-screen count. |
| Magnet feels too generous | Tune radius small; no upgrades in this phase. |

## 6. Verification Plan

```
Plan:
1. Add scrap and breather types → verify: typecheck passes.
2. Spawn scrap on asteroid break → verify: screenshot shows drops.
3. Collect scrap via magnet → verify: meter increments in HUD.
4. Deploy Breather Zone → verify: bubble appears, shield recharges, score multiplier applies.
5. Run tests → verify: all pass.
6. Build and screenshot → verify: no errors.
```

## 7. Related

- `project_phase_3_abandoned.md` — why Phase 3 was removed.
- `project_phase_2_movement_decision_arena.md` — Arena locked as movement identity.
