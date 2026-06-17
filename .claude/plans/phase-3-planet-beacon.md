---
name: phase-3-planet-beacon
status: abandoned
description: Phase 3 was removed from the active plan because Arena was locked as the movement identity and the planet beacon mechanic is designed around soft forward drift.
---

# Phase 3 — Planet Beacon

**Status:** **ABANDONED**

**Original goal:** Make a visible planet that grows as the player stays aligned with it.

**Reason for abandonment:**
- Phase 2 locked **Arena** as the main movement identity (user decision).
- The planet beacon / alignment mechanic is built on **soft forward drift**: the planet is a destination ahead of the ship, and alignment means staying on the forward vector as the world streams backward.
- In Arena mode the ship is confined to a fixed box with no forward progress vector, so there is no meaningful way to implement alignment or planet growth.
- A decorative-only planet would not satisfy the GDD pillar of "Visible Destination" and would waste implementation time.

**What is preserved:**
- `DriftMovementController` and the `MovementController` strategy remain in the repo as a future variant mode.
- This plan file remains as a record of the decision.

**Decision record:** See memory file `project_phase_3_abandoned.md`.

**Next step:** The user must decide what replaces Phase 3 or whether to proceed to a rescoped Phase 4.
