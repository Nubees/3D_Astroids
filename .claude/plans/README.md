# Implementation Plans

This directory holds detailed implementation plans for significant features, refactors, or architectural changes. Plans are written in Markdown and are not executable code.

## When to Write a Plan

Create a plan before starting work that:
- Touches more than 3 files
- Changes architecture, public APIs, or scene flow
- Introduces new dependencies or build steps
- Has significant risk or multiple implementation options

## Plan Template

A good plan should include:

1. **Overview** — what problem this solves and the chosen approach
2. **Current state / New state** — flow diagrams or before/after descriptions
3. **Changes per file** — specific add/remove/modify instructions
4. **Risk assessment** — what could go wrong and how to mitigate it
5. **Verification** — commands and manual tests to prove correctness
6. **Test matrix** — table of scenarios and expected results
7. **Files modified / created** — summary table
8. **Estimate** — rough time breakdown

## Reviewing Plans

Before executing a plan, consider spawning `challenger-agent` to verify:
- The plan actually solves the stated problem
- Risks are realistic and mitigations are adequate
- The approach is simpler than alternatives
- Verification steps are sufficient

## Plan Status

| File | Status | Description |
|------|--------|-------------|
| `phase-0-foundations.md` | completed | Phase 0 scaffold: Three.js + Vite stack, screenshot harness, npm scripts |
| `ship-explosion-drift.md` | completed | Ship inertia-based movement, shield knockback bounce, death explosion, 1s respawn delay |
| `respawn-clear-and-countdown.md` | completed | Clear threats on respawn, "Press a Key to resume", 3-2-1 countdown |
| `shader-shield-impact-rings.md` | completed | Shader-based energy shield: Fresnel rim, hex grid, geodesic impact rings |
| `phase-6-shard-swarm.md` | completed | Phase 6 base: crystal kind, 30% threshold fracture, 8 homing shards, +50 clean-kill bonus |
| `phase-6-shard-swarm-escalation.md` | completed | Phase 6b: 1→2→4→8→16→24 burst cascade, 4 score tiers, CLUTCH/PERFECT hooks, 9 screenshots |

## Relation to Memory

When a plan is executed, update the corresponding session memory file and `Setup.md` maintenance log if new rules or patterns emerged.
