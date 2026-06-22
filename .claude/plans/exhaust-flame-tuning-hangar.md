---
name: exhaust-flame-tuning-hangar
description: Build a temporary in-engine Ship Hangar diagnostic page to visually tune exhaust flame positions/sizes/colors against the actual GLB models, then apply the tuned values and document the methodology.
---

# Exhaust Flame Tuning via In-Engine Ship Hangar

**Date:** 2026-06-22  
**Goal:** Fix exhaust/jet flame placement so flames sit exactly on each GLB spaceship's exhaust ports, with correct size and color. Capture the tuned values and the method for future projects.  
**Decision from user:** Build a temporary visual inspector/hangar inside the running project; reuse the same GLB loader/rotation/scaling as the real game; record exhaust positions/sizes/colors per ship; have agents review the plan and code.

## 1. Overview

The previous attempt used sprite PNG pixel coordinates as a proxy for GLB exhaust port positions. That proxy has different padding/geometry, so the resulting flames were misaligned and oversized. The correct fix is to inspect the **actual loaded GLB model** inside the same Three.js pipeline the game uses and tune the flame visually until it matches each ship's drawn/engine exhaust.

This plan introduces a **temporary Ship Hangar diagnostic page** that loads every ship through the production `loadCatalogMesh()` path, displays the ship with optional wireframe/bounding-box/axis helpers, renders candidate exhaust flames, and lets us interactively adjust length, radius, Y-offset, and X-offset for each nozzle. Once every ship looks correct, the final values are written back to `src/exhaust-config.ts` and `src/exhaust-gameplay.ts`.

The hangar page is built primarily to solve the exhaust alignment problem now, but is kept as a dev-only diagnostic showroom so future art passes (new ships, new engine effects, weapon hardpoints) can reuse the same workflow. It is explicitly not part of the shipped game UI.

## 2. Current State / Problem

**Current files:**
- `src/exhaust-config.ts` — per-ship nozzle positions, flame width %, colors, brightness. Positions claim to be derived from GLB vertex clusters but have not been visually verified against the rendered model.
- `src/exhaust-gameplay.ts` — creates cone-geometry flames using the ship's bounding box. Contains debug red rings, green hull-width line, and console logging from the last debugging pass.
- `src/ships/catalog.ts` — loads GLB, centers, rotates `-90° Z`, scales to `SHIP_RADIUS * 5.2`, and replaces PBR with bright `MeshBasicMaterial`.
- `src/game.ts` — calls `attachGameplayFlames(shipMesh, entryId)` and `toggleFlames()` each frame.

**Reported symptoms:**
- Flames are too far behind the ship.
- Flames are too large relative to the exhaust ports.
- Colors/positions do not visually line up with the drawn engine art.

**Root cause:**
There is no visual feedback loop. Values were computed from raw vertices or sprite proxies and then applied without confirming how they look on the rotated/scaled model in the running renderer.

## 2.1 Alternatives Considered

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| A. Temporary separate HTML page (`ships-inspector.html`) | Clean isolation; reuses only `loadCatalogMesh()`; no risk of polluting game loop or ship-select UI; dev-only by default because Vite only bundles `index.html` unless configured otherwise. | One extra HTML/CSS/TS file. | **Chosen.** |
| B. `?hangar=1` mode inside existing `index.html` | Reuses canvas and Vite entry point. | Would require branching `main.ts`, either modifying `Game` or duplicating renderer setup; the game scene contains asteroids/HUD/shield that distract from clean asset inspection. | Rejected — more invasive than a standalone page. |
| C. Extend existing ship-select screen with inspect overlay | Uses existing loader and preview. | Pollutes the production ship-select UX; harder to add rich tuning controls without crowding the selection UI. | Rejected — production UI should stay clean. |

The standalone page is the smallest, least invasive way to get a controlled, repeatable visual feedback loop.

## 3. Proposed Solution

Build a **dev-only Ship Hangar page** that uses the exact same model-loading code as the game, then:
1. Display one ship at a time, centered, with optional slow rotation.
2. Use the **same camera distance and FOV as gameplay** (`PerspectiveCamera(60, aspect, 0.1, 1000)` at `z = 20`) so perceived flame size/position matches the real game.
3. Draw diagnostic overlays: wireframe, bounding box, axes/grid, nozzle markers.
4. Render the current exhaust flame cones at the configured positions.
5. Provide keyboard controls to tune parameters using **percentage adjustments** of hull width/length (see Test Matrix for exact increments).
6. Display live values on screen and provide a one-key export of the current config.
7. Step through all 12 ships, tune each against the objective acceptance criteria in section 8.1, and capture screenshots as evidence.
8. Write the tuned values back into `src/exhaust-config.ts` and a small runtime offset/scale hook in `src/exhaust-gameplay.ts`.
9. Remove all debug artifacts (red rings, green line, logging) from `src/exhaust-gameplay.ts`.
10. Delete the orphaned `src/exhaust-debug.ts`.
11. Document the methodology in memory + wiki + frameworks for reuse.

## 4. New State / Architecture

```
project
├── src/
│   ├── ships/
│   │   ├── catalog.ts          (existing, unchanged)
│   │   └── inspector.ts        (NEW — dev hangar logic)
│   ├── ships/inspector.css     (NEW — overlay styles)
│   ├── exhaust-config.ts       (MODIFIED — tuned values)
│   ├── exhaust-gameplay.ts     (MODIFIED — remove debug, apply tuned values)
│   └── exhaust-debug.ts        (DELETE — orphaned)
├── ships-inspector.html        (NEW — Vite entry point)
├── Knowledge/
│   ├── Wiki/
│   │   └── glb-inspector-method.md   (NEW)
│   └── Frameworks/
│       └── glb-inspector-method.md   (NEW)
└── memory/
    └── glb-inspector-method.md       (NEW)
```

The hangar page is **not part of the main game loop**. It is launched by navigating to `/ships-inspector.html` from the Vite dev server. It shares the same `loadCatalogMesh()` path, so any ship that appears in the hangar is guaranteed to use the same transforms as in `Game`.

## 5. Changes Per File

### New files

| File | Purpose |
|---|---|
| `ships-inspector.html` | Minimal HTML shell in project root. Vite dev server serves it automatically, but it is **not** added to `vite.config.ts`, so it is excluded from the production build. |
| `src/ships/inspector.ts` | Loads the catalog, renders one ship, draws diagnostic overlays, handles keyboard tuning, exports config. Must include a detailed My Rules block. |
| `src/ships/inspector.css` | Overlay UI: ship name, stats, current values, key legend. |
| `Knowledge/Wiki/glb-inspector-method.md` | Synthesized explanation of the visual-tuning workflow for future reference. |
| `Knowledge/Frameworks/glb-inspector-method.md` | Actionable step-by-step guide: when to use, how to set up, how to capture values, how to clean up. |
| `memory/glb-inspector-method.md` | Persistent memory file linking the methodology to this project and related memories. |

### Modified files

| File | Change |
|---|---|
| `src/exhaust-config.ts` | Update `flameWidthPercent`, colors, and any nozzle `xPosition` corrections based on hangar tuning. Add optional per-nozzle `lengthScale` and `yOffset` fields **only if** the hangar proves they are necessary; otherwise keep global offsets. |
| `src/exhaust-gameplay.ts` | Remove debug rings/line/logging. Use the tuned config values. Add small X-offset and length constants derived from the hangar session. |
| `MEMORY.md` | Add index line for `glb-inspector-method.md`. |

### Unchanged files

| File | Reason |
|---|---|
| `vite.config.ts` | No change needed. Vite serves additional `.html` files in dev but only bundles `index.html` by default. This keeps the hangar dev-only without build config complexity. |

### Deleted files

| File | Reason |
|---|---|
| `src/exhaust-debug.ts` | Orphaned stub; never imported, contains non-functional placeholder. |

## 6. Knowledge Capture

The methodology is worth preserving because it generalizes to any project where 2D/3D assets must align exactly with generated effects.

**Memory file** `glb-inspector-method.md` will record:
- Problem: proxy data (sprites, raw vertices, math) does not guarantee visual alignment.
- Solution: build a temporary in-engine viewer using the production asset pipeline and tune by eye.
- Steps: load asset → overlay candidate effect → nudge interactively → screenshot → export values → clean up.
- Link to related memories: `feedback_workflow.md` (browser verification), `karpathy_method.md` (simplicity first), `project_phased_cleanup_procedure.md` (stabilize before polish).

**Wiki file** will synthesize the same content in a searchable form.

**Framework file** will make it actionable: “When you need exact placement of a generated effect on a 3D model, do X, Y, Z.”

## 7. Agent Review Strategy

Per user request, a challenger agent reviews the plan and code as we progress.

1. **Plan review** — before implementation, spawn `challenger-agent` against this plan file. Incorporate feedback before writing code.
2. **Code review (post-implementation)** — spawn `coder-agent` and `graphics-reviewer` against the new `src/ships/inspector.ts`, modified `src/exhaust-gameplay.ts`, and `src/exhaust-config.ts`.
3. **Testing/verification review** — spawn `testing-agent` against the verification plan and test changes.
4. **Final adversarial pass** — if any reviewer raises concerns, re-spawn `challenger-agent` for a final verdict.

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Inspector page accidentally ships in production | Low | Keep `ships-inspector.html` in project root but do **not** add it to `vite.config.ts` inputs. Vite only bundles `index.html` by default. |
| Tuning by eye is subjective | Medium | Define objective acceptance criteria before tuning (see section 8.1). Capture a screenshot of every ship with final flame placement; record exact numeric values. |
| Inspector depends on production loader; breaking the loader breaks both | Low | Reuse `loadCatalogMesh()` without modifying it; the hangar exercises the same path the game already uses. |
| Vite multi-entry config complicates build | None | No `vite.config.ts` change required. |
| Adding per-nozzle `lengthScale`/`yOffset` fields over-configures | Medium | Prefer global length/radius offsets first; only add per-nozzle overrides if the hangar proves they are necessary. |
| Debug artifacts left in `exhaust-gameplay.ts` | Low | Make removal a separate explicit step in the verification plan. |
| GLB load failure breaks tuning for one ship | Low | If `loadCatalogMesh()` falls back to the placeholder, show a warning and skip that ship; revisit after the asset is fixed. |
| Camera angle distorts perceived flame size | Medium | Use the same camera distance/z/FOV as gameplay (`z=20`, perspective 60°) so what you see in the hangar matches what you see in-game. |

## 8.1 Objective Acceptance Criteria

Before tuning begins, define "correct" as:

| Property | Acceptable Range |
|---|---|
| **Position** | Flame base sits inside the visible exhaust port opening, not floating behind it. No gap larger than ~10% of flame length between hull and flame base. |
| **Length** | Total flame length is 25–60% of the ship's nose-to-tail length, depending on ship style. Aggressive ships may be longer; sleek ships shorter. |
| **Radius** | Flame radius at the base is 80–140% of the visible exhaust port width. It must not exceed the hull width at the rear edge. |
| **Color** | Flame color matches the dominant color of the drawn engine glow/art on that ship (e.g., orange for Ironclaw, purple for Voidstriker). |
| **Coverage** | Every visible exhaust port has its own flame; no extra flames on blank hull surface. |

## 9. Verification Plan

```
Plan:
1. Create plan file and have challenger-agent review it → verify: challenger verdict is APPROVE or APPROVE WITH CONCERNS with no high-severity issues.
2. Build ships-inspector.html + src/ships/inspector.ts + inspector.css → verify: page loads, all 12 ships can be switched, wireframe/bounding-box toggles work; inspector.ts contains a My Rules comment block.
3. Tune exhaust flames for all 12 ships in the hangar → verify: screenshots show flames sitting flush at each exhaust port; each ship satisfies the objective acceptance criteria in section 8.1.
4. Record tuned values and export config → verify: exported JSON matches the updated src/exhaust-config.ts.
5. Update src/exhaust-config.ts and src/exhaust-gameplay.ts, remove src/exhaust-debug.ts and debug artifacts → verify: typecheck passes; no debug rings/line/logging remain.
6. Read back every new My Rules comment block → verify: all required blocks are present and accurate.
7. Run npm test → verify: all tests pass.
8. Run npm run build → verify: production build succeeds; `dist/ships-inspector.html` does not exist.
9. Launch main game and screenshot gameplay for several ships → verify: flames appear only on W/Up thrust, are correctly sized/positioned, and debug markers are gone.
10. Spawn graphics-reviewer and testing-agent for final code/verification review → verify: no unresolved high/medium concerns.
11. Write memory + wiki + framework entries and update MEMORY.md → verify: files exist, cross-links work, index updated.
```

## 10. Test Matrix

| Scenario | Expected Result |
|---|---|
| Navigate to `/ships-inspector.html` | Hangar loads; first ship appears centered. |
| Press `→` / `←` | Switches to next/previous ship; name and stats update. |
| Press `W` | Toggles wireframe overlay on current ship. |
| Press `B` | Toggles bounding box and axes helper. |
| Press `R` | Toggles slow rotation. |
| Press `↑` / `↓` | Nudges selected nozzle Y position by ±2% of hull width. |
| Press `+` / `-` | Scales selected nozzle radius by ±5% of current radius (clamped to 50–200% of base). |
| Press `[` / `]` | Scales selected nozzle flame length by ±10% of hull length. |
| Press `<` / `>` | Moves flame base ±2% of hull length closer to / farther from hull rear edge. |
| Press `N` | Cycles to next nozzle. |
| Press `C` | Copies current per-ship config JSON to clipboard. |
| Press `S` | Saves a screenshot of the current ship with flames. |
| Main game launch | Selected ship has no debug rings/line; flames visible only on W/Up thrust. |
| `npm run typecheck` | No TypeScript errors. |
| `npm test` | All Vitest + Playwright tests pass. |
| `npm run build` | Build completes; `dist/` does **not** contain `ships-inspector.html` because it is not a Vite build entry. |

## 11. Estimate

| Step | Time |
|---|---|
| Plan + challenger review + revision | 25 min |
| Build hangar page and inspector module | 40 min |
| Tune all 12 ships and capture screenshots | 50 min |
| Update exhaust-config / exhaust-gameplay, remove debug artifacts | 25 min |
| Typecheck + tests + build + in-game screenshots | 30 min |
| Agent code reviews + final fixes | 25 min |
| Knowledge capture (memory/wiki/framework) | 20 min |
| Contingency buffer | 25 min |
| **Total** | **~3.5–4 hours** |

## 12. Related

- Memory: `exhaust-flames-position-fix.md`, `ship1-exhaust-gameplay-only.md`, `feedback_workflow.md`, `karpathy_method.md`
- Wiki: `Knowledge/Wiki/setup-index.md`
- Frameworks: `Knowledge/Frameworks/verification-plans.md`, `Knowledge/Frameworks/atomic-actions.md`
- Code: `src/ships/catalog.ts`, `src/exhaust-config.ts`, `src/exhaust-gameplay.ts`, `src/game.ts`
