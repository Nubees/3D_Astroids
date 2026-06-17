---
name: asteroids-next-edition-spec
description: Authoritative Game Design Document for 3D Astroids “Next Edition” — concept, core loop, controls, movement, weapons, asteroids, enemies, loot, planet hub, and phased MVP.
version: 1.1
status: reviewed
verified: 2026-06-15
---

# 3D Astroids — Game Design Document

## 1. Elevator Pitch

> **Asteroids, but every run is a short treasure hunt toward a planet you can see growing.**

A browser-based 3D space shooter where the player always flies forward through a streaming asteroid field, breaks solid rocks for loot, and must keep a distant planet on-screen so it grows into a safe harbor. At close range the planet opens a small shop for repairs and new gear. Survival, collection, and economy merge into one arcade loop.

This document is built on research stored in [[asteroids-official-lineage]], [[asteroids-modern-descendants]], [[asteroids-next-edition-design-ideas]], [[asteroids-next-edition-brainstorm]], and [[asteroids-next-edition-starter-kit]].

---

## 2. Design Pillars

1. **Sacred Core Loop.** Fly, shoot, break rocks. Every other system must make that loop better without replacing it.
2. **Visible Destination.** The planet is a persistent, readable goal. The player must always know where they are going and how far they have come.
3. **Meaningful Steering.** Movement is not just survival — it is also alignment, risk/reward, and loot positioning.
4. **Juicy Feedback.** Every shot, break, pickup, and arrival must feel satisfying through sound, motion, and light.
5. **Short Runs, Long Progress.** A single run lasts minutes, but persistent blueprints turn every death into forward momentum.

---

## 3. Core Loop

```
Spawn → Fly forward → Break asteroids → Collect loot → Dodge enemies →
Stay aligned with planet → Reach planet → Repair / upgrade →
Depart → Repeat with better gear
```

**Micro-loop (every 5–15 seconds):**
- Read the incoming asteroid field.
- Choose whether to strafe for loot or stay centered for planet growth.
- Shoot, shield, or juke.
- Collect drops.

**Macro-loop (every run):**
- Start with base ship and base blaster.
- Fly, survive, gather parts.
- Reach the planet or die trying.
- Spend collected resources at the hub.
- Unlock a blueprint or upgrade.
- Start the next run slightly stronger.

---

## 4. Controls

| Action | Input |
|---|---|
| Aim direction | Mouse cursor |
| Move up | W or ↑ |
| Move down | S or ↓ |
| Move left | A or ← |
| Move right | D or → |
| Shoot | Spacebar or Left Mouse Button |
| Shield | C or Right Mouse Button |
| Pause / menu | Escape |

**Design notes:**
- The mouse cursor sets the ship’s heading; shots fire forward along the ship’s nose.
- WASD/Arrows move the ship on a 2D plane while the world streams backward.
- Shield is a depleting panic button with a cooldown. It is the default escape tool; hyperspace is not available by default.

---

## 5. Movement Model

### 5.1 Soft Forward Drift

The game uses **soft forward drift**, not a hard rail:
- The camera and world move backward at a constant base speed.
- The player can freely strafe up/down/left/right within the viewport.
- The ship never truly stops; releasing movement keys lets the ship drift with the forward current.
- Mouse aim is independent of movement direction, allowing strafing shots.

### 5.2 Movement Validation Spike

The default movement mode is **soft forward drift** per the Option A decision. Phase 2 includes a short validation spike to confirm the feel before dependent systems are built.

- Build a one-prototype drift version.
- Run a 5-minute playtest focused on readability, control comfort, and alignment legibility.
- If the spike reveals major problems, escalate to the user for a decision before changing direction.

Arena fallback is documented only as an emergency alternative and is not the planned path.

### 5.3 Alignment Mechanic

- The planet is rendered as a small bright object in the distance, slightly above or below center depending on the route.
- A faint HUD reticle or compass ring marks the planet’s direction.
- When the ship is centered on the planet vector, the planet grows faster.
- When the ship strays far off the vector, planet growth pauses.
- There is no hard fail for losing the planet; progress simply stalls until the player recenters.

---

## 6. The Planet

### 6.1 Visual Beacon

- The planet is visible from the first frame.
- Initially it is a tiny speck or marble.
- As the player stays aligned, it slowly resolves into a disk, then reveals rings, atmosphere, surface features, and station lights.
- The transformation is the emotional payoff of the run.

### 6.2 Growth Rules

| Alignment State | Threshold | Planet Growth Rate |
|---|---|---|
| Centered | Ship within 5° of the planet vector | 1.5x base rate |
| Near center | Ship within 15° of the planet vector | 1.0x base rate |
| Off center | Ship within 30° of the planet vector | 0.5x base rate |
| Far off screen / behind | Planet not visible in viewport | 0.0x base rate (paused) |

- The planet vector is a ray from the ship toward the planet’s current position.
- Base growth is a design target; exact duration (3–8 minutes per run) will be tuned in playtest.
- Reaching the planet triggers the hub sequence.

### 6.3 Arrival Sequence

1. Planet fills a significant portion of the screen.
2. Camera slows; a subtle sound swell plays.
3. Station lights or orbital structures resolve.
4. Game pauses and the planet hub UI appears.

---

## 7. Weapons & Addons

### 7.1 Base Blaster

- The ship starts with a single forward-firing kinetic blaster.
- No element. No special behavior.
- Used against Iron Slag and as the neutral fallback for any asteroid.

### 7.2 Starter Addons

Addons are modifications that bolt onto the base blaster. They are introduced in **Phase 9** alongside the matching system. In Phases 1–8 the player uses only the base blaster; later phases may allow combining or swapping addons.

| Addon | Element | Mechanic | Hard Counter | Part Required |
|---|---|---|---|---|
| **Thermal Capacitor** | Heat | Single beam; bonus damage and loot vs. ice/crystal | **Frost Chondrite** | Heat Sink / Thermite Core |
| **Split Refractor** | Crystal | Splits shot into two parallel beams | **Plasma Glass** | Cracked Crystal Lens |
| **Resonator Coil** | Electric | Beam arcs to up to 2 nearby targets | **Tesla Core** | Charged Coil |

### 7.3 Matching Rules

- Using the correct element against the correct asteroid grants:
  - Faster break time.
  - Cleaner break behavior (no hazardous fragments).
  - +50% loot bonus.
- Using the wrong element still works but is slower and may trigger hazards.
- The base blaster works on everything at neutral efficiency.

### 7.4 Combination Risks

- **Split Refractor + Resonator Coil:** can create screen-filling chain AoE.
  - Mitigation: arcs originate only from direct hits, not split-beam clones. Cap arcs at 1 jump per source.

---

## 8. Asteroids

### 8.1 The Four Starter Types

| Asteroid | Element / Identity | Break Behavior | Best Counter | Loot |
|---|---|---|---|---|
| **Iron Slag** | Neutral grey-black metal | Classic split: large → medium → small | Base blaster | Metal scrap, energy, occasional shield shard |
| **Frost Chondrite** | Pale blue/white ice | Shatters into Ice Splinters that briefly freeze movement; heat melts it cleanly | **Thermal Capacitor** | Frozen cores, coolant gel, cryo-module blueprint fragment |
| **Plasma Glass** | Amber/crimson volcanic silicate | Explodes into Ember Shards if hit wrong; crystalline beams shatter it cleanly | **Split Refractor** | Thermal cells, plating, refractor fragment |
| **Tesla Core** | Purple charged nickel-iron | Splits into Spark Motes that drift toward player; wrong kills leave live sparks | **Resonator Coil** | Capacitors, magnet module, electrical-weapon blueprint |

### 8.2 Spacing Rules

- Introduce one elemental type per planet approach.
- Recommended introduction order: Iron Slag → Frost Chondrite → Plasma Glass → Tesla Core.
- Never spawn an elemental asteroid touching the player; give a 1-second incoming flash.
- Mix waves only after the player has learned each element individually.
- **Phase note:** in Phases 1–8 only the base blaster is available. The “Best Counter” column describes the optimal counter once matching and addons arrive in Phase 9; until then, all asteroids can be destroyed with the base blaster at neutral efficiency.

### 8.3 Size Tiers

- **Large:** slow, high health, splits into 2 medium pieces.
- **Medium:** moderate speed, splits into 2 small pieces.
- **Small:** fast, destroyed in one hit, highest loot-per-mass.

---

## 9. Enemies

### 9.1 The Three Starter Types

| Enemy | Behavior | Threat to Alignment | Primary Drop | Counter |
|---|---|---|---|---|
| **Shard Swarm** (signature) | A large crystal asteroid releases homing shards when damaged below threshold | Parks in the approach lane; swarm pushes the player sideways | Shield shard or temporary weapon boost | Destroy the crystal before it fractures (base blaster works); **Split Refractor** makes it effortless |
| **Ember Skiff** | Saucer-like craft that strafes and fires lead-aim plasma bolts | Forces juke off the planet vector | Temporary spread shot or heat-seeking module | Dodge perpendicular to its strafe (base blaster works); **Resonator Coil** makes hitting it easier |
| **Anchor Drone** | Slow mine with a gravity tether that slows drift and pulls sideways, then detonates | Blocks the lane; going around costs alignment | Repair nanites or shield cells | Destroy from range before entering tether (base blaster works); **Thermal Capacitor** burns it faster |

### 9.2 Pacing

- One enemy type per wave at first.
- Mix pairs only after the player has seen each type multiple times.
- Shard Swarm is the signature MVP enemy and ships in Phase 6.

---

## 10. Loot & Economy

### 10.1 The Three Loot Types

| Loot | Purpose | Source | Collection | Hub Use |
|---|---|---|---|---|
| **Aether Crystals** | Common currency / repair material | All asteroids (common); small fragments best per mass | Short-range magnet, 0.3s settle delay | **Repair / Restore** |
| **Weapon Cores** | Crafting material / blueprint resource | Enemies + Tesla Core; bonus from element-matched kills | Manual fly-over only (no magnet) | **Outfitting** blueprints |
| **Solar Gold** | Rare premium currency | Large/rare asteroids, first shard-swarm kill | Long-range magnet only when aligned with planet | **Outfitting premium tab** |

### 10.2 Collection Rules

- **Crystals:** auto-collect within a short radius. Intended to be low-friction.
- **Cores:** require the player to fly over them. Creates intentional detour risk.
- **Gold:** only magnetizes when the player is aligned with the planet. Rewards good positioning.

### 10.3 Inflation Guardrails

- Crystal→credit conversion is 1:1, but repair costs scale so excess never stockpiles.
- Weapon core blueprint costs are fixed per weapon.
- Gold vendor stock is limited to 1–2 premium items per visit.
- Uncollected loot fades after 8–10 seconds.

---

## 11. Planet Hub

### 11.1 Hub Behavior

- The hub **pauses the game** when opened.
- It appears automatically when the planet is reached, or via a manual key when very close.
- The UI is a small button bar with hotkeys.

### 11.2 Hub Services

| Button | Hotkey | Service |
|---|---|---|
| Repair / Restore | R | Restore shields and hull integrity |
| Outfitting | O | Buy/sell weapons, install addons, unlock blueprints |
| Depart | D | Resume flight from the planet and continue the run |

### 11.3 Scarcity

- Repair prices increase slightly per visit to encourage efficient flying.
- Outfitting stock rotates between runs.
- Premium items cost Solar Gold and are limited in quantity.

---

## 12. Progression & Blueprints

### 12.1 Blueprint System

- Blueprints are **saved locally** (e.g., `localStorage`).
- Collecting enough Weapon Cores unlocks a new weapon blueprint permanently.
- Once unlocked, the weapon can be purchased or equipped at the Outfitting screen.
- Blueprints survive death and persist across sessions.

### 12.2 Meta-Loop

- Each run earns some combination of Crystals, Cores, and Gold.
- A bad run still contributes Cores toward the next blueprint.
- Reaching the planet allows the player to spend resources and prepare for the next run.

### 12.3 Future Expansion

- Multiple hulls with different speed/shield/cargo stats.
- Advanced weapon combinations (dual-element, quadrant firing).
- Rarity tiers for parts.
- Account-level challenges or leaderboards.

---

## 13. Phased MVP

| Phase | Focus | What Ships | Deferred |
|---|---|---|---|
| 0 | Foundation | Engine/tooling decision, scaffold, browser screenshot harness | — |
| 1 | Sacred loop | Ship, shoot, breakable Iron Slag, death/restart | Planet, shield, matching |
| 2 | Movement identity | Drift vs. arena bake-off; pick one | Other movement variants |
| 3 | Planet beacon | Visible planet that grows as you align | Alignment penalty |
| 4 | Soft alignment | Penalty/reward for staying on planet vector | Hub UI |
| 5 | Shield panic | Shield escape button | Temporary pickups |
| 6 | Signature enemy | Shard Swarm | Other enemies |
| 7 | Temporary pickups | First pickups + UI feedback | Persistent blueprints |
| 8 | Planet hub | Repair/Restore, then Outfitting, then Depart | Full economy |
| 9 | Matching + blueprints | Weapon↔asteroid matching, blueprint unlocks | Advanced combos |

### 13.1 Systems Existence by Phase

This matrix shows which mechanics are actually active in each phase. It prevents later-phase mechanics from leaking into earlier design discussions.

| System | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Engine scaffold | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ship + base blaster | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Breakable Iron Slag | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Soft forward drift | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Planet beacon | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Soft alignment | | | | | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Shield panic | | | | | | ✓ | ✓ | ✓ | ✓ | ✓ |
| Shard Swarm enemy | | | | | | | ✓ | ✓ | ✓ | ✓ |
| Temporary pickups | | | | | | | | ✓ | ✓ | ✓ |
| Planet hub | | | | | | | | | ✓ | ✓ |
| Weapon addons + matching | | | | | | | | | | ✓ |
| Blueprint persistence | | | | | | | | | | ✓ |

**Reading guide:** A checkmark means the mechanic is present and tuned in that phase. Mechanics above the current phase may still appear visually (e.g., planet visible from Phase 3) but do not yet drive gameplay.

### 13.3 Phase 0 Verification

- [ ] `npm run dev` starts a local server.
- [ ] A screenshot harness captures a frame from the running game.

### 13.4 Phase 1 Verification

- [ ] 60-second playtest breaks ≥3 Iron Slag asteroids.
- [ ] Respawn happens in <2 seconds after death.

### 13.5 Phase 2 Verification

- [ ] Team sign-off after a 5-minute playtest of drift mode.
- [ ] Arena fallback is documented but not selected without user approval.

### 13.6 Phase 3 Verification

- [ ] Planet is visible from frame one.
- [ ] Planet scales by ≥2x from misaligned to fully aligned.

### 13.7 Phase 4 Verification

- [ ] Straying off vector slows or pauses growth.
- [ ] Staying centered visibly accelerates growth.

### 13.8 Phase 5 Verification

- [ ] Shield absorbs one otherwise-lethal hit.
- [ ] Shield has a visible cooldown and resource bar.

### 13.9 Phase 6 Verification

- [ ] Shard Swarm spawns from a damaged crystal asteroid.
- [ ] Destroying the crystal before the threshold prevents the swarm with the base blaster.

### 13.10 Phase 7 Verification

- [ ] Collecting a temporary pickup updates the HUD.
- [ ] Pickup effect expires after its duration.

### 13.11 Phase 8 Verification

- [ ] Planet hub pauses the game.
- [ ] All three buttons (Repair/Restore, Outfitting, Depart) function.

### 13.12 Phase 9 Verification

- [ ] Each weapon addon has a clear counter-asteroid.
- [ ] Blueprint unlock persists after browser refresh.

---

## 14. Visual & Audio Direction

### 14.1 Visual Principles

- **Readability first.** Asteroids and the ship must read instantly against the starfield.
- **Color = meaning.** Grey = neutral, blue/white = ice, amber/red = fire, purple = electric, gold = premium.
- **High contrast.** Avoid the Asteroids Hyper 64 mistake of dark rocks on dark backgrounds.
- **Planet as progress bar.** Use rings, atmosphere, and station lights to show approach.

### 14.2 Audio Principles

- Each asteroid size has a distinct break pitch.
- Elemental weapons have distinct firing sounds.
- Shield activation has a clear “clang” or hum.
- Planet arrival has a swelling musical cue.

### 14.3 Arcade Juice

- Screen shake on large asteroid breaks.
- Debris and spark particles on hits.
- Loot magnetizes with a visible trail.
- Hit stop / slow-down on critical breaks.

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Movement identity crisis | High | Prototype drift vs. arena in Phase 2 before building dependent systems. |
| Feature interaction complexity | High | Add systems one at a time; verify pairwise interactions. |
| Planet doing too many jobs | Medium | Split responsibilities across phases; start as pure visual beacon. |
| Visual clutter from effects | High | Hard rule: ship and rocks must always read clearly. |
| Overpowered weapon combos | Medium | Cap chains, test time-to-clear for dense waves. |
| Blueprint persistence issues | Medium | Use localStorage; defer backend storage to a future phase. |

---

## 16. Open Questions & Future Expansion

### Resolved

1. ✅ Hub pauses the game.
2. ✅ Control scheme: mouse aim + WASD/Arrows + Space/LMB shoot + C/RMB shield.
3. ✅ Blueprints saved locally.
4. ✅ Thermal Capacitor gap resolved with Frost Chondrite.

### Still Open

1. Should leaderboards or run records be tracked locally?
2. Should the game support gamepads in addition to mouse/keyboard?
3. Should there be difficulty tiers or seeded runs?

### Deferred Features

- Quadrant-based firing positions.
- Multiple playable hulls.
- Boss encounters beyond the signature enemy.
- Multiplayer/co-op.
- Full trading economy with fluctuating prices.

---

## 17. Related Pages

- [[asteroids-official-lineage]] — official Atari series history and takeaways.
- [[asteroids-modern-descendants]] — modern clones, roguelites, and loot shooters.
- [[asteroids-next-edition-design-ideas]] — first-pass research synthesis.
- [[asteroids-next-edition-brainstorm]] — agent brainstorming session and adversarial review.
- [[asteroids-next-edition-starter-kit]] — detailed starter kit with weapons, asteroids, enemies, loot, and phases.
- [[lessons-from-donkey-kong]] — previous-project lessons shaping phased foundation work.
- [[karpathy-method]] — think before coding, simplicity first, surgical changes, goal-driven execution.
