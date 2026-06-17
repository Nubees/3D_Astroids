---
name: asteroids-next-edition-design-ideas
description: Synthesis of official lineage and modern descendants into concrete ideas for the 3D Astroids “Next Edition” project.
---

# Asteroids “Next Edition” — Design Idea Synthesis

This page takes the research from [[asteroids-official-lineage]] and [[asteroids-modern-descendants]] and maps it to the project’s starting concept: always-forward flight through space, breakable solid asteroids that drop loot, and a distant planet that grows into a trade hub. It is intended as the bridge between research and the eventual game spec.

---

## Our Starting Concept (from [[project-3d-astroids]])

- Always flying forward through space (star-field forward-motion effect).
- Solid, breakable asteroids that shatter into smaller parts.
- Loot drops: **gems**, **gold**, and **weapon parts**.
- Weapon parts unlock new weapons.
- A tiny planet sits in the far background and slowly grows as the player approaches.
- The player must keep the planet on-screen; steering away pushes it off-frame and out of reach.
- At close range the planet presents trade/buy/sell options for ships, parts, and weapons.
- Hybrid of survival, collection, and economy/trading.

---

## What the Research Proves vs. What Is New

| Project Idea | Proven elsewhere? | Notes |
|---|---|---|
| Always-forward flight | **Yes** — *Star Fox* rail-shooter PATH scripting, *Tempest* tube shooters, *Resogun* cylindrical playfield, *Asteroid Forward* vertical scroller | Camera/event scripting and relative spawning are well understood. |
| Breakable asteroids | **Yes** — core of every *Asteroids* title and many clones | Size tiers and speed scaling are a solved formula. |
| Asteroids drop gems/gold/parts | **Yes** — *Super Stardust HD*, *ROIDERS*, *Comet Rogue*, *Astro Miners*, *Asteroids:EX*, *Asteroids++* | Loot-driven upgrades are a proven retention hook. |
| Parts unlock weapons | **Yes** — *Everspace* blueprints, *Nova Drift* meta-unlocks, *Star Survivor* modules | Persistent unlocks survive death and reward repeated play. |
| Distant planet that grows as you approach | **Partially** — planet approach in *Elite Dangerous*, *Starfield Free Lanes*, *Space Trader’s* Utopia | The “grow in viewport” affordance is satisfying, but tying it to an on-screen alignment mechanic is **not** a common shipped pattern. |
| Keep planet on-screen or lose it | **No major shipped match** | A novel risk/reward layer for our project. |
| Planet becomes trade hub at close range | **Yes** — *FTL* stores, *Everspace* traders/stations, *Rebel Galaxy* stations, *Endless Sky* planet facilities | Lightweight shop UI patterns exist; we should avoid UI bloat. |

**Bottom line:** Our concept is a novel synthesis of proven ingredients. The riskiest unique pieces are the “keep the planet on-screen” alignment mechanic and the single persistent destination-hub.

---

## Proven Mechanics to Adopt

### 1. Forward-Flight Spawning

- Use **Star Fox-style PATH/event scripting** to spawn asteroids, enemies, and loot relative to forward progress.
- Borrow **Resogun’s cylindrical/wrapping forward vision** so threats are visible ahead of time, reducing surprise deaths.
- Keep camera mostly locked behind the ship; add a brief zoom-out/target mode for situational awareness.
- Consider a “soft” forward scroll: player can move within a 2D plane while the world flows backward, rather than hard rails.

### 2. Breakable Asteroids & Loot

- Size tiers: large → medium → small; smaller pieces move faster and are worth more (*Asteroids: By the Numbers* formula).
- Drops per tier: common gems, rare gold, weapon parts from specific asteroid types.
- Add **color/element weapon↔asteroid matching** (*Super Stardust HD*): one weapon family counters one asteroid family, creating tactical switching.
- Use **Nova Drift-style mod combinations**: collected parts can combine into weapon mods (e.g., split shot + fire damage + magnet).
- Add an **Asteroids Deluxe-style “Killer Satellite”** enemy that also drops rare parts.

### 3. Weapon Unlocks & Build Crafting

Suggested hybrid model:

- Collect 3 part types (e.g., **barrel**, **energy core**, **casing**) → combine at the planet into a new weapon.
- Unlocked **blueprints persist across runs** (*Everspace* model).
- Per-run **temporary power-ups** drop from UFOs or rare asteroids (*Asteroids: Recharged* model).
- Optional **quadrant/positional loadouts** (*Star Survivor*) if we want firing position to matter.

### 4. The Distant Planet

- Treat the planet as a **distant beacon/destination** like *FTL* stores or *Space Trader’s* Utopia.
- As it grows, reveal surface features, rings, stations, or atmosphere to signal “almost there.”
- Use **Star Control 2’s** macro flow: far → approach → orbit → interact, simplified to a single destination.
- Gate first-visit services with a small challenge (*Everspace* “activate power units” idea) so the shop isn’t instant full access.

### 5. Keeping the Planet On-Screen

Possible implementations:

- **Alignment/facing bonus**: firing while the planet is centered adds momentum toward it.
- **Progress meter**: the planet’s apparent size grows faster when kept centered; straying slows approach.
- **Soft fail**: if the planet drifts off-frame, approach progress pauses; after a timeout it resets or a “turn back” warning appears.
- **Fuel/efficiency tie**: flying toward the planet conserves fuel; flying away burns it faster.

### 6. Planet Trade UI

Adopt a lightweight version of **Endless Sky’s** planet button bar with hotkeys:

| Button | Hotkey | Service |
|---|---|---|
| Refuel / Repair | R | Restore shields/hull/fuel (*Asteroids Deluxe* shield repair equivalent) |
| Outfitting | O | Buy/sell weapons and parts |
| Ship Dealer | S | Trade up hulls (*Rebel Galaxy* model) |
| Refinery | F | Convert gems/gold into credits or fuel |
| Depart | D | Return to flight |

- Limit stock like *FTL* and *Everspace* traders to create scarcity and replayability.
- Keep UI fast and optional — *Resogun’s* postmortem warns that shops can hurt arcade pacing.

---

## Design Risks to Watch

1. **Difficulty tuning fragility.** *Asteroids Deluxe* proved that over-tuning for experts can drive away casuals. The “keep planet on-screen” mechanic must feel fair, not punishing.
2. **Visual clarity in 3D.** *Asteroids Hyper 64* suffered because 3D asteroids were hard to read. We need high-contrast materials and clear silhouettes.
3. **Pacing vs. economy.** Trading hubs can break the action loop if they are too slow. Make transactions quick and optional.
4. **Scope creep from build-crafting.** *Nova Drift* works because it is laser-focused; 200+ mods is not our starting target. Begin with 3–5 weapon families and a small blueprint set.
5. **Genre reboot risk.** *Asteroids: Outpost* tried too radical a shift and failed to ship. Stay close to the shooter formula.

---

## Minimum Viable Loop Recommendation

Build this first, then validate:

1. **Forward flight** with soft 2D-plane movement.
2. **Breakable asteroids** in large/medium/small tiers.
3. **Three loot types**: gems, gold, weapon parts.
4. **One persistent planet** that grows and opens a 3-button shop (Refuel/Repair, Outfitting, Depart).
5. **Simple alignment mechanic**: keep planet centered to approach; straying slows progress.

Once that loop is fun, layer in:

- Color-coded weapon↔asteroid matching.
- Persistent blueprint unlocks.
- More planet services (Ship Dealer, Refinery).
- Temporary power-ups and enemy variety.

---

## Proven vs. Experimental Ideas Summary

| Idea | Status | Source / Inspiration |
|---|---|---|
| Asteroid splitting physics | Proven | Original *Asteroids* |
| Forward-flight scripting | Proven | *Star Fox* PATH system |
| Cylindrical/wrapping readability | Proven | *Resogun* |
| Loot drops from asteroids | Proven | *Super Stardust HD*, *ROIDERS* |
| ARPG-style mod combinations | Proven | *Nova Drift* |
| Store scarcity / limited stock | Proven | *FTL*, *Everspace* |
| Persistent blueprint unlocks | Proven | *Everspace* |
| Planet button-bar UI with hotkeys | Proven | *Endless Sky* |
| Planet approach → orbit → interact | Proven | *Star Control 2* |
| Single persistent destination-hub | Experimental | Our synthesis |
| “Keep planet on-screen” alignment | Experimental | Our synthesis |
| Forward flight + full trading economy | Experimental | Our synthesis |

---

## Open Questions for Step 2 (Brainstorm / Spec)

1. Should the planet be the **only** hub, or should there be smaller waypoints between planets?
2. Is the alignment mechanic a **hard** constraint (lose the run) or a **soft** one (slower progress / fewer bonuses)?
3. Do weapon parts drop from **all** asteroids, or only specific types/colors?
4. Should the economy use **one currency** (credits) or **multiple** (gems, gold, parts)?
5. What happens when the player reaches the planet — does the run reset with persistent unlocks, or does the same planet keep offering new tiers?
6. Should multiplayer/co-op exist, and if so, how does alignment work for two ships?

---

## Related Pages

- [[asteroids-official-lineage]] — official Atari series history.
- [[asteroids-modern-descendants]] — modern clones, roguelites, and loot shooters.
- [[project-3d-astroids]] — project overview and starting concept.
- [[karpathy-method]] — how we will keep the spec simple and goal-driven.
