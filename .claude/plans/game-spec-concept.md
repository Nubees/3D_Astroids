# Plan — 3D Astroids Game Spec / Concept Document

**Date:** 2026-06-15  
**Goal:** Produce a single authoritative Game Design Document (GDD) for the 3D Astroids “Next Edition” project that captures the research, brainstorming, and starter-kit decisions so far.

---

## Overview

The user has approved **Option A** (the 7-item synthesis MVP) and resolved the last open questions:

- Planet hub **pauses the game**.
- Controls: **Mouse aims direction**, WASD/Arrow keys move, Space/LMB shoots, C/RMB shields.
- Blueprints are **saved locally**.
- Thermal Capacitor gap resolved by adding **Frost Chondrite** as the fourth starter asteroid.

This plan proposes creating one comprehensive spec document in `Knowledge/Wiki/` and linking it from the Wiki README. The document will serve as the north star for all future implementation.

---

## Document to create

| # | Path | Purpose |
|---|------|---------|
| 1 | `Knowledge/Wiki/asteroids-next-edition-spec.md` | Authoritative Game Design Document / concept spec. |
| 2 | `Knowledge/Wiki/README.md` | Add the new spec to the game-design research index. |

---

## Spec document structure

1. **Frontmatter** — name, description, version, status.
2. **Elevator Pitch / Hook** — the single-sentence vision.
3. **Design Pillars** — 4–5 non-negotiable design principles.
4. **Core Loop** — what the player does every 5–60 seconds.
5. **Controls** — exact input mapping.
6. **Movement Model** — soft forward drift, arena fallback, alignment mechanic.
7. **The Planet** — visual beacon, alignment, growth rules, arrival/hub behavior.
8. **Weapons & Addons** — base blaster + 3 starter addons, matching rules, combinations.
9. **Asteroids** — 4 starter types, break behavior, loot tables, spawning rules.
10. **Enemies** — 3 starter types, AI behavior, counter loop, drops.
11. **Loot & Economy** — 3 loot types, collection rules, hub services.
12. **Planet Hub** — paused UI, 3 buttons, services, prices/scarcity.
13. **Progression & Blueprints** — local persistence, unlock flow, meta-loop.
14. **Phased MVP** — 10 phases with ship/defer lists and verification per phase.
15. **Visual & Audio Direction** — palette, silhouette, readability, arcade-juice notes.
16. **Risks & Mitigations** — top cross-system risks from starter kit.
17. **Open Questions / Future Expansion** — deferred features for later phases.
18. **Related Pages** — cross-links to all research and starter-kit pages.

---

## Key design decisions already locked

| Topic | Decision |
|---|---|
| Movement | Soft forward drift with full 2D steering; mouse sets direction; WASD/Arrows strafe |
| Escape tool | Shield (C / RMB), no default hyperspace |
| Planet alignment | Straying off-center pauses/slows planet growth; staying centered accelerates it |
| Hub | Pauses the game; 3 buttons: Refuel/Repair, Outfitting, Depart |
| Matching system | 3 weapon addons ↔ 4 asteroid types, color/element based |
| Persistence | Blueprints saved locally (e.g., localStorage) |
| Starting sets | 3 weapons, 4 asteroids, 3 enemies, 3 loot types |

---

## Implementation order (for the spec, not code)

1. Draft the spec in `Knowledge/Wiki/asteroids-next-edition-spec.md`.
2. Update `Knowledge/Wiki/README.md` to link the spec.
3. Run a `challenger-agent` review of the spec for gaps and contradictions.
4. Present the final spec to the user.

---

## Verification

- [ ] Spec covers all 7 Option A items.
- [ ] Spec resolves the three final user answers (paused hub, control mapping, local blueprints).
- [ ] Spec links back to `asteroids-next-edition-starter-kit` and other research pages.
- [ ] Challenger review passes with no blocking issues.

---

## Risks

- **Over-scoping in the spec.** Mitigation: explicitly label every feature as Phase 1–9 and keep Phase 1 minimal.
- **Contradictions between research and spec.** Mitigation: cross-link every major claim to the research page that supports it.
- **Spec becomes stale.** Mitigation: add a version/date header and a “Last verified” note.
