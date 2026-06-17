---
name: asteroids-next-edition-brainstorm
description: Brainstorm session combining official lineage, modern descendants, and forward-flight trading research into a spec direction.
---

# Asteroids “Next Edition” — Brainstorm Synthesis

This page captures the agent brainstorming session that followed the research phase. It combines perspectives from [[asteroids-official-lineage]], [[asteroids-modern-descendants]], and [[asteroids-next-edition-design-ideas]], then adds adversarial review.

---

## The Three Brainstormer Perspectives

### Brainstormer A — Official Lineage

**Searched:** Official Atari *Asteroids* family tree, 1979–2021.

**Core pitch:** Keep the “fly forward and shoot” beat sacred. The planet is the emotional payoff, not just a shop.

**Key suggestions:**
- Shields as the default escape tool instead of hyperspace.
- Add **one signature enemy**, not ten — e.g., a “shard swarm” launched from cracked crystal asteroids.
- Use temporary combat pickups during a run plus persistent ship blueprints across runs.
- Prototype the planet alignment mechanic with a **soft fail state** first.

**Arcade magic:** Visible progress and juicy feedback — chunky hits, debris, screen shake, loot flying to player, planet visibly growing.

---

### Brainstormer B — Modern Clones & Spiritual Successors

**Searched:** Browser/HTML5 remakes, arcade spiritual successors, roguelite build-craft shooters, loot-driven games.

**Core pitch:** *Asteroids* as a short treasure hunt with a visible destination.

**Key suggestions:**
- **Color/element weapon↔asteroid matching** — the right weapon breaks the matching asteroid faster and drops bonus loot.
- **Quadrant-based firing positions** — weapon parts determine not just what fires, but where.
- Temporary risk/reward pickups (like *Asteroids: Recharged* pink UFOs).
- Lightweight planet UI with 3–5 hotkey buttons.
- Persistent blueprint unlocks tied to weapon-part combinations.

**Arcade magic:** Near-miss tension + satisfying loot — rare drops tempt the player to steer off-planet alignment.

---

### Brainstormer C — Forward Flight & Destination-Hub Trading

**Searched:** Rail/tube shooters, planet approach affordances, lightweight trading hubs.

**Core pitch:** Forward motion should feel like drift, not imprisonment.

**Key suggestions:**
- **Soft forward scroll**, not a rail — player steers freely on a 2D plane while the world streams backward.
- Make the planet a **compass in the sky** with a persistent marker/beam.
- Tie **approach speed to alignment**, not survival — straying pauses growth; staying centered accelerates it.
- Start with a **3-button planet UI**: Refuel/Repair, Outfitting, Depart.
- Stock the planet with scarcity.

**Arcade magic:** Visible horizon and reachable goals — planet always visible, obstacles readable, arrival an “almost there” moment.

---

## Synthesis — Winning Combinations

The synthesis agent found that the three pitches converge rather than conflict:

1. **Planet as compass + progress bar.** A and C both want the destination visible and readable from frame one.
2. **Temporary pickups + persistent blueprints.** A and B both propose a two-layer progression model that keeps single runs tight while making death meaningful.
3. **Tactical matching + juicy feedback.** B’s weapon↔asteroid matching gives the player a reason to switch; A’s chunky hit feedback makes switching satisfying.
4. **Soft forward drift protects the sacred loop.** C’s soft scroll preserves A’s “fly and shoot” beat while adding 3D horizon tension.
5. **Strict, hotkey-driven planet hub.** B and C both insist the hub must be tiny and fast.

---

## Proposed Hook Sentence

> “Asteroids, but every run is a short treasure hunt toward a planet you can see growing.”

---

## Prioritized MVP Feature Set

1. **Soft forward drift with full 2D steering** — the core movement loop.
2. **Visible planet destination that grows as you align with it** — the emotional and progress anchor.
3. **Sacred shoot + shield escape** — no hyperspace by default; shield is the panic button.
4. **Color/element weapon↔asteroid matching** — creates tactical switching in a simple form.
5. **One signature enemy: shard swarm from cracked crystal asteroids** — isolated variety.
6. **Temporary combat pickups + persistent blueprint unlocks** — two-layer progression.
7. **Three-button planet hub: Refuel/Repair, Outfitting, Depart** — keeps arcade pacing intact.

---

## Adversarial Challenger Review

A challenger-agent reviewed the combined pitch and argued for **severe pruning**.

### Verdict

**Worth pursuing, but only if pruned.** The strongest kernel is the official-lineage pitch: keep the core loop, add shields, give one new enemy, and make the planet the emotional end-state. Modern and trading ideas are valuable but should be folded in only after the core loop is proven.

### Biggest risks identified

1. **Genre identity crisis: free-roam arena vs. forced-forward runner.** The team must pick movement identity before coding, or the physics will satisfy neither audience.
2. **Feature interaction complexity.** Matching, alignment, shields, trading, and blueprints overlap and could make failure feel unfair.
3. **Diluted emotional payoff.** The planet is being asked to be mood, navigation, progress meter, shop, and win condition all at once.

### Scope creep to defer

- Elemental weapon↔asteroid matching.
- Trading / scarce stock economy.
- Persistent blueprint unlocks.
- Quadrant firing positions.

### Assumptions that need validation

- Players want a destination more than a high score.
- Soft forward scroll preserves the Asteroids feel.
- Color/element matching is readable at Asteroids pace.
- Alignment penalties are intuitive.
- Scarcity creates meaningful decisions.
- A three-button planet UI works under pressure.

### Safeguards / simplifications

1. **Pick one axis of novelty and protect the rest.** A minimal MVP could be: sacred arena loop + shields + planet as distant visual goal + one signature enemy.
2. **Prototype the movement question first in isolation.** Build two one-week prototypes: free-roam arena vs. soft forward scroll. Compare feel, clarity, and survivability before adding pickups, UI, or economy.

---

## Tension to Resolve with the User

There is a real design tension between the synthesis agent (which wants to fold all three angles into a 7-item MVP) and the challenger (which wants to strip back to a 4-item MVP and defer the rest). The user must decide:

- **Option A (Synthesis):** Build the 7-item MVP with soft forward drift, matching, and blueprints.
- **Option B (Challenger):** Build the 4-item stripped MVP first, validate movement feel, then add matching/economy/blueprints in later phases.

Both options preserve the core emotional hook: the visible, growing planet.

---

## Related Pages

- [[asteroids-official-lineage]] — research on official Atari series.
- [[asteroids-modern-descendants]] — research on modern clones and roguelites.
- [[asteroids-next-edition-design-ideas]] — first-pass mapping of research to the project concept.
- [[lessons-from-donkey-kong]] — previous-project lessons that shape phased foundation work.
- [[karpathy-method]] — think before coding, simplicity first, surgical changes, goal-driven execution.
