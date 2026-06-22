# Welcome, New Model — 3D Astroids Project Onboarding

> Read this file first when you start working on this project. It tells you what we've built, where things live, how we work, and what still needs doing.

---

## 1. Project Snapshot

**Project:** 3D Astroids — browser-based 3D Asteroids-style game.  
**Stack:** Three.js (rendering) + Vite (build/dev) + TypeScript.  
**Test runner:** Vitest for unit tests, Playwright for screenshot smoke tests.  
**Current branch:** `phase-2-movement` (pushed to GitHub).  
**Main branch:** `master`.  
**Repository:** `https://github.com/Nubees/3D_Astroids.git`

**Latest gate status (as of 2026-06-22, after Phase 6 + 6b Crystal Shard Swarm + Cascade):**
- `npm run typecheck` → pass (0 errors).
- `npm test` → **179 Vitest** tests + **10 Playwright** screenshot tests pass (1 Phase 0 + 9 Phase 6b cascade).
- `npm run build` → production build succeeds (73.61 kB main bundle).

See `RELEASE_NOTES.md` for the latest release entry.

---

## 2. What Is Already Done

### Implemented Phases & Systems

| Phase / Feature | Status | Notes |
|-------------------|--------|-------|
| **Phase 0 — Foundations** | ✅ Done | Three.js + Vite scaffold, procedural ship/asteroid/starfield, screenshot harness. |
| **Phase 1 — Sacred Loop** | ✅ Done | Ship movement, base blaster, breakable Iron Slag asteroids, collisions, death/restart. |
| **Phase 2 — Movement Identity** | ✅ Done | Arena vs drift bake-off coded; **Arena chosen** as main movement. Drift controller remains in source. |
| **Shield Panic / Passive Armor** | ✅ Done | Shield converted to passive armor with HUD, arc flash, and knockback. |
| **Scrap Field + Breather Zone** | ✅ Done | Scrap drops, Breather Zone deployment with slowdown/repulsion, floating text, scoring. |
| **Asteroid Chaos** | ✅ Done | Omni-directional spawns, targeted spawn #4, asteroid-vs-asteroid bounce. |
| **Ship Hangar / Flame Editor** | ✅ Done | Player-facing page at `/ships-inspector.html`. Drag-to-place nozzle markers, `F` duplicate, `D` delete, `T` reset tuning, color picker, localStorage persistence. |
| **Sound Effects Research** | ✅ Done | Research docs and Kenney.nl download script in `Sound_Effects/`. |
| **Ship Selector** | ✅ Done | Visual ship selection screen with hangar icon. |
| **Ship Catalog / GLB Loader** | ✅ Done | `src/ships/catalog.ts` loads and normalizes production GLB ships. |
| **Exhaust Gameplay System** | ✅ Done | `src/exhaust-config.ts` + `src/exhaust-gameplay.ts` attach flame cones to ships; reads overrides from localStorage. |
| **Post-Processing / Shield Visuals / Ship Damage** | ✅ Done | Separate modules for visuals and damage handling. |

### Key Completed Decisions

- **Movement identity:** Arena mode is locked for the main game (drift was implemented and rejected after comparison).
- **Phase 3 (Planet Beacon):** Abandoned after Arena decision.
- **HEADROOM proxy:** Installed and integrated; launcher scripts in `.claude/headroom-start.bat` / `.claude/headroom-stop.bat` (or `npm run headroom:start` / `npm run headroom:stop`).
- **Flame editor:** Signed off by user — "Well Done, Looks Great".

---

## 3. Project Structure

```
3D_Astroids/
├── index.html                 # Main game entry point
├── ships-inspector.html       # Ship Hangar / flame editor (bundled to dist/)
├── package.json               # Scripts and dependencies
├── vite.config.ts             # Vite config; includes index + hangar inputs
├── tsconfig.json              # TypeScript config
├── CLAUDE.md                  # PRIMARY PROJECT RULEBOOK — read this
├── Welcome.md                 # This file
├── .claude/                   # Claude Code project config, hooks, skills, agents, rules
│   ├── rules/code-style.md    # Style guide (2-space, single quotes, semicolons, etc.)
│   ├── hooks/                 # Session-start, pre-tool-use, post-tool-use guardrails
│   ├── agents/                # coder-agent, testing-agent, graphics-reviewer, challenger-agent
│   ├── skills/                # Project-specific skills
│   └── plans/                 # Implementation plans (see §5 What's Next)
├── Knowledge/                 # Three-layer knowledge architecture (see §4)
│   ├── RAW/                   # Immutable source material — NEVER edit
│   ├── Wiki/                  # Claude-maintained synthesis
│   └── Frameworks/            # Actionable guides
├── Sound_Effects/             # SFX research docs and download script
├── src/                       # All game logic
│   ├── main.ts                # Game bootstrap
│   ├── game.ts                # Main Game class / loop
│   ├── ship.ts                # Ship state and mesh
│   ├── asteroid.ts            # Asteroid state and splitting
│   ├── scrap.ts               # Scrap field logic
│   ├── shield.ts              # Passive shield/armor logic
│   ├── shield-visuals.ts      # Shield visual effects
│   ├── ship-damage.ts         # Ship damage handling
│   ├── post-processing.ts     # Post-processing effects
│   ├── input.ts               # InputManager
│   ├── projectile.ts          # Projectile update logic
│   ├── types.ts               # Shared interfaces/types
│   ├── exhaust-config.ts      # Per-ship exhaust nozzle configs
│   ├── exhaust-gameplay.ts    # Runtime flame attachment + localStorage overrides
│   ├── ship-select.ts/css     # Ship selection screen
│   ├── ships/                 # Ship catalog + hangar inspector
│   │   ├── catalog.ts
│   │   ├── inspector.ts
│   │   └── inspector.css
│   ├── movement/              # Movement controllers
│   │   ├── arena-controller.ts
│   │   ├── drift-controller.ts
│   │   └── movement-controller.ts
│   └── utils/                 # Pure utility functions (unit-testable)
│       └── collision.ts
├── tests/                     # Vitest tests
├── public/                    # Static assets (GLB models, ship PNGs)
└── dist/                      # Build output (gitignored)
```

---

## 4. Knowledge Architecture (MUST FOLLOW)

This project uses a three-layer knowledge system. Do not violate ownership rules.

| Layer | Path | Owner | Mutability | Purpose |
|-------|------|-------|------------|---------|
| **RAW** | `Knowledge/RAW/` | Austin | **NEVER edited by Claude** | Immutable source material. If wrong, add a correction note in Wiki. |
| **Wiki** | `Knowledge/Wiki/` | Claude | Claude maintains | Searchable synthesis of RAW + project learnings. |
| **Frameworks** | `Knowledge/Frameworks/` | Austin + Claude | Collaborative | Actionable "when X happens, do Y" guides. |
| **Memory** | `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\` | Claude + user | Persistent across sessions | User preferences, project status, gotchas, feedback. |

**Start every session by reading:**
1. `CLAUDE.md` (project rulebook)
2. `.claude/rules/code-style.md` (style)
3. `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\MEMORY.md` (memory index)
4. This `Welcome.md`

**When you learn something new that future models need:** write or update a memory file and add a one-line entry to `MEMORY.md`.

---

## 5. What's Next (Pending Plans)

The polish-bucket plans previously listed here (`ship-explosion-drift.md`, `respawn-clear-and-countdown.md`, `shader-shield-impact-rings.md`) are all completed as of 2026-06-22 — see `.claude/plans/README.md` for the full status table.

**Outstanding phase recommendations** (from memory): proceed with Phase 6 Shard Swarm or Phase 7 pickups.

---

## 6. How We Work

### Non-Negotiable Workflow Obligations

1. **Auto-Save + Recap every 50 minutes.**
   - A cron fires every 50 minutes.
   - Announce: `🔄 Memory save is now taking place…`
   - Persist new/updated memories, touch the newest memory file even if empty, deliver a recap, then confirm: `✅ Memory save complete. Recap delivered.`
2. **Code Section Notes ("My Rules").**
   - Insert detailed comment blocks between code sections: Purpose, Setup, Issues, Fix, Gotchas.
   - Read them back before declaring done.
3. **Verification Plans.**
   - For any task with >2 steps or >1 file, state a plan with `Step → verify: check`.
4. **Run tests before committing.**
   - `npm test` must pass. Fix type errors before pushing.
5. **Browser verification for visual changes.**
   - Run `npm run dev`, capture a screenshot, confirm the result.

### Useful Commands

```bash
npm run dev          # Start dev server (Vite, port 5173 by default)
npm run build        # Type check + production build
npm run typecheck    # TypeScript only
npm test             # Vitest + Playwright
npm run preview      # Preview production build
npm run headroom:start
npm run headroom:stop
```

### Agent Roles (use them)

- `coder-agent` — code correctness, style, cleaner implementation.
- `testing-agent` — test coverage and quality gates.
- `graphics-reviewer` — rendering, shaders, asset loading, visual verification.
- `challenger-agent` — adversarial reviewer; challenges requirements-fit, robustness, simplicity, cost.

---

## 7. Important Conventions

- All game logic lives under `src/`. No logic in `public/`.
- Engine-specific integration code lives in its own subdirectory (e.g., `src/movement/`, `src/ships/`).
- Use `readonly` for config constants. Prefer `const` over `let`.
- Export shared types from `src/types.ts`.
- Pure utility functions live in `src/utils/` and must be unit-testable.
- Avoid raw `setTimeout` / `setInterval` in game logic.
- 2-space indentation, single quotes, semicolons, max line length 100.
- Match existing style; do not "improve" adjacent code unless asked.
- Percentage adjustments for sizes/positions, absolute values only when no baseline exists.

---

## 8. Quick Troubleshooting

- **Vite ports 5173-5178 in use:** The dev server auto-increments. Check the actual port in the terminal output (e.g., `5179`).
- **Hangar page not found in dev:** Navigate to `/ships-inspector.html` from the dev server root.
- **Tests fail after visual changes:** Update Playwright screenshot expectations or unit test data if behavior intentionally changed.
- **Memory file location:** External to the repo at `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\`. Do not look for memory inside the git tree.

---

## 9. What To Do Right Now

If you have just loaded this project:

1. Read `CLAUDE.md`, `.claude/rules/code-style.md`, `MEMORY.md` (external memory index), and this file.
2. Run `npm test` to confirm the baseline is green.
3. Check `git status` to see if there is uncommitted work in progress.
4. Look at `.claude/plans/` for the next pending task.
5. Ask the user what they want to work on next.

---

*Last updated: 2026-06-22 after pushing Ship Hangar flame editor to `phase-2-movement`.*
