---
name: asteroids-next-edition-starter-kit
description: Detailed Option A starter kit with phased MVP, 3 weapon addons, 4 asteroid types, 3 enemy types, 3 loot types, and cross-system risks.
---

# Asteroids “Next Edition” — Option A Starter Kit

This page is the output of the agent brainstorming session that reviewed Option A in detail. It is built on top of [[asteroids-next-edition-brainstorm]], [[asteroids-official-lineage]], [[asteroids-modern-descendants]], and [[asteroids-next-edition-design-ideas]].

---

## 1. The Option A Tension

The user selected **Option A**, the 7-item synthesis MVP:

1. Soft forward drift with full 2D steering.
2. Visible planet that grows as you align with it.
3. Shoot + shield escape (no default hyperspace).
4. Color/element weapon↔asteroid matching.
5. One signature enemy: shard swarm from cracked crystal asteroids.
6. Temporary combat pickups + persistent blueprint unlocks.
7. Three-button planet hub: Refuel/Repair, Outfitting, Depart.

The **challenger-agent review** argued this cannot ship as a single MVP. It is a coherent **vision**, but it must be layered so the core loop is proven before systemic features are added.

**Proposed contract:** Adopt Option A as the Phase 2–3 target, but ship a **Phase 1 vertical slice** that proves the sacred loop first.

---

## 2. Phased MVP

| Phase | Focus | What Ships | What Is Deferred |
|---|---|---|---|
| 0 | Foundation | Engine/tooling decision, scaffold, browser screenshot harness | — |
| 1 | Sacred loop | Ship movement, shooting, breakable asteroids, death/restart | Planet, shield, matching |
| 2 | Movement identity | Drift vs. arena bake-off; pick one | Other movement variants |
| 3 | Planet beacon | Visible planet that grows as you align | Alignment penalty |
| 4 | Soft alignment | Penalty/reward for staying on planet vector | Hub UI |
| 5 | Shield panic | Shield escape button | Temporary pickups |
| 6 | Signature enemy | Shard Swarm | Other enemies |
| 7 | Temporary pickups | First pickups + UI feedback | Persistent blueprints |
| 8 | Planet hub | Refuel/Repair, then Outfitting, then Depart | Full economy |
| 9 | Matching + blueprints | Weapon↔asteroid matching, blueprint unlocks | Advanced combos |

This preserves every Option A idea while giving each one a testable home.

---

## 3. The 3 Beginning Weapon Addons

| Addon | Element / Mechanic | Counter To | Loot/Part Required |
|---|---|---|---|
| **Thermal Capacitor** | Heat; single forward beam; bonus vs. ice/crystal | **Frost Chondrite** — melts frozen rock cleanly and doubles loot | Heat Sink / Thermite Core |
| **Split Refractor** | Cyan/crystal; splits shot into two parallel beams | **Plasma Glass** — shatters it cleanly instead of triggering Ember Shards | Cracked Crystal Lens |
| **Resonator Coil** | Electric/chain; arcs to up to 2 nearby targets | **Tesla Core** — arcs through charge and clears Spark Motes | Charged Coil |

---

## 4. The 4 Beginning Asteroid Types

| Asteroid | Element / Identity | Break Behavior | Best Counter | Loot |
|---|---|---|---|---|
| **Iron Slag** | Neutral grey-black metallic rock | Classic Asteroids split: large → medium → small | Base blaster (no bonus or penalty) | Metal scrap, generic energy, occasional shield shard |
| **Frost Chondrite** | Pale blue/white ice rock with frozen fractures | Shatters into Ice Splinters that freeze movement briefly on contact; heat melts it to steam and bonus loot | **Thermal Capacitor** (heat beam) | Frozen cores, fuel gel, rare cryo-module blueprint |
| **Plasma Glass** | Amber/crimson volcanic silicate | Explodes into Ember Shards if hit with wrong weapon; crystalline beams shatter it cleanly and grant bonus loot | **Split Refractor** | Thermal cells, plating, rare refractor fragment |
| **Tesla Core** | Purple charged nickel-iron | Splits into Spark Motes that drift toward player; wrong kills leave live sparks | **Resonator Coil** (electric chain) | Capacitors, rare magnet module, electrical-weapon blueprint |

**Pacing rule:** introduce one elemental type per approach, never more than one new element in the same wave. Let the player lock in the association before mixing them. Recommended introduction order: Iron Slag → Frost Chondrite → Plasma Glass → Tesla Core.

---

## 5. The 3 Beginning Enemy Types

| Enemy | Behavior | Threat to Alignment | Primary Drop | Counter |
|---|---|---|---|---|
| **Shard Swarm** (signature) | Large crystal asteroid releases homing shards when damaged below threshold | Parks in the approach lane; swarm pushes player sideways | Shield shard or weapon XP | **Split Refractor** prevents shard release; matching element neutralizes swarm |
| **Ember Skiff** | Saucer-like craft strafes and fires lead-aim plasma bolts | Forces juke off the planet vector | Temporary spread shot or heat-seeking module | **Resonator Coil** arcs to agile target; shield for emergency juke |
| **Anchor Drone** | Slow mine with gravity tether that slows drift and pulls sideways, then detonates | Blocks the lane; going around costs alignment | Repair nanites or fuel | **Thermal Capacitor** sustained beam burns plating; evade tether |

---

## 6. The 3 Beginning Loot Types

| Loot | Purpose | Source | Collection | Hub Use |
|---|---|---|---|---|
| **Aether Crystals** | Common currency / fuel | All asteroids (common); small fragments most per mass | Short-range magnet, 0.3s settle delay | **Refuel / Repair** |
| **Weapon Cores** | Crafting material / blueprint fuel | Enemies + Tesla Core; bonus from element-matched kills | Manual fly-over only (no magnet) — creates risk/reward | **Outfitting** (blueprints) |
| **Solar Gold** | Rare premium currency | Large/rare asteroids, first shard-swarm kill | Long-range magnet only when aligned with planet | **Outfitting premium tab** (scarce upgrades) |

---

## 7. Cross-Mapping Table

### Weapons ↔ Asteroids

| Weapon Addon | Counters |
|---|---|
| Thermal Capacitor | Frost Chondrite (heat melts ice cleanly, bonus loot) |
| Split Refractor | Plasma Glass |
| Resonator Coil | Tesla Core |

### Enemies ↔ Counters

| Enemy | Counter |
|---|---|
| Shard Swarm | Split Refractor / matching element |
| Ember Skiff | Resonator Coil / shield panic |
| Anchor Drone | Thermal Capacitor sustained beam / evade tether |

### Loot ↔ Hub

| Loot | Hub Use |
|---|---|
| Aether Crystals | Refuel / Repair |
| Weapon Cores | Outfitting blueprints |
| Solar Gold | Outfitting premium tab |

---

## 8. Top 3 Cross-System Balance Risks

| Rank | Interaction | Why It Breaks | Mitigation |
|---|---|---|---|
| 1 | **Split Refractor + Resonator Coil combo** | Two parallel beams each arc to nearby targets, turning a moderate weapon into screen-filling chain AoE | Arcs only originate from direct hits, not split-beam clones. Cap arcs at 1 jump per source. |
| 2 | **Plasma Glass + Ember Skiff + Thermal Capacitor** | Using the heat beam on Plasma Glass spawns Ember Shards while the Skiff fires plasma bolts — cascading punishment for wrong-weapon choice | Cap Ember Shard spawn count; telegraph Plasma Glass element clearly; give player an exit vector. |
| 3 | **Anchor Drone tether + Solar Gold magnet** | Drone pulls sideways while gold magnet pulls toward planet, creating a confusing tug-of-war | Disable Solar Gold magnet while tethered; make drone tether a visible cone, not omnidirectional pull. |

---

## 9. First 5 Implementation Milestones

1. **Engine scaffold + screenshot harness** — verify: `npm run dev` starts and a screenshot captures a gameplay frame.
2. **Sacred loop: ship, shoot, breakable Iron Slag, death/restart** — verify: 60-second playtest breaks ≥3 asteroids and respawns in <2 seconds.
3. **Movement identity bake-off: drift vs. arena** — verify: team sign-off after a 5-minute playtest of each movement mode.
4. **Planet beacon visible and growing on alignment** — verify: planet scales by ≥2x from misaligned to fully aligned.
5. **Shield panic button + first temporary pickup** — verify: shield absorbs one otherwise-lethal hit, and a collected pickup updates the HUD.

---

## 10. Go / No-Go Recommendation

**GO — under one condition:**

1. The team accepts the phased MVP contract. Option A is the north star, but Phases 1–5 are the only things in the first build.

RESOLVED: Frost Chondrite has been added as the fourth beginning asteroid type. The starter kit is now balanced: each weapon addon has one hard counter, each elemental asteroid has one matching counter, and Iron Slag remains the neutral teaching rock.

If the phased contract is rejected, the recommendation flips to **NO-GO** because the project would be balancing movement, matching, enemies, loot, and a hub simultaneously without a proven core loop.

---

## 11. Open Questions Before Spec Finalization

1. Does the hub pause the game, or is it a real-time overlay?
2. What is the default movement mode if the bake-off is inconclusive?
3. Should blueprints be saved locally, or is persistence deferred entirely to Phase 9?

---

## Related Pages

- [[asteroids-next-edition-brainstorm]] — the agent brainstorming session that led here.
- [[asteroids-next-edition-design-ideas]] — first-pass research synthesis.
- [[asteroids-official-lineage]] — official Atari series history.
- [[asteroids-modern-descendants]] — modern clones and roguelites.
- [[lessons-from-donkey-kong]] — previous-project lessons shaping phased foundation work.
- [[karpathy-method]] — simplicity first, surgical changes, goal-driven execution.
