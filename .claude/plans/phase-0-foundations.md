---
name: phase-0-foundations
description: Phase 0 implementation plan — choose the 3D web stack, scaffold the project, and build a screenshot verification harness.
---

# Phase 0 — Foundations Implementation Plan

**Date:** 2026-06-17
**Goal:** Choose the engine/tooling stack, scaffold the project, and satisfy the Phase 0 verification gates:
1. `npm run dev` starts a local server.
2. A screenshot harness captures a frame from the running game.

## 1. Overview

The GDD in `Knowledge/Wiki/asteroids-next-edition-spec.md` is finalized. Phase 0 is the bridge from design to code. This plan evaluates four realistic browser-based 3D stacks and picks the leanest one that can prove the sacred core loop in Phase 1.

## 2. Stack Options

| # | Stack | Pros | Cons | Verdict |
|---|---|---|---|---|
| 1 | **Three.js + Vite + TypeScript, custom loop, custom collision** | Tiny scaffold, huge ecosystem, procedural geometry, full control of update/render, fast HMR, easy screenshot via Playwright | No built-in physics/GUI; must write small collision/loop | **Recommended** |
| 2 | Babylon.js + Vite + TypeScript | Full engine: physics, particles, GUI, audio built-in | Larger API surface, heavier bundle, more config for Phase 0 gates | Overkill for MVP |
| 3 | PlayCanvas Engine + Vite + TypeScript | Component-based, browser-game focused | Smaller ecosystem, thinner docs, less juice example code | Viable but not optimal |
| 4 | Raw WebGL from scratch | Minimal dependency footprint | Requires building renderer, camera, shaders, audio, input from scratch | Rejects simplicity-first |

### Why Three.js won
All five review agents converged on **Option 1**. Reasons:
- It is the only stack that clears Phase 0 quickly without carrying unused subsystems.
- Soft forward drift, breakable asteroids, and planet beacon can be built with procedural primitives and a small custom loop.
- Arcade juice (screen shake, particles, hit stop, bloom) is achievable with standard Three.js + `EffectComposer` later.
- It aligns with the project code-style rules: game logic under `src/`, shared types, no logic in `public/`, procedural assets first.

### Explicitly deferred
- Physics engine (Cannon-es / Rapier) — custom sphere/AABB is enough through Phase 9.
- ECS / component frameworks — plain objects and functions until Phase 6+ variety demands it.
- Audio middleware — Web Audio API wrapper later; Phase 0 is silent.
- glTF / model pipeline — procedural geometry through Phase 9.
- Canvas UI framework — DOM overlays first; hub UI in Phase 8.

## 3. Current State / New State

**Current state:**
- Empty `package.json` with only `headroom:start` / `headroom:stop` scripts.
- No source files, no build config, no dev server.
- No screenshot harness.

**New state:**
- Vite dev server with TypeScript hot reload.
- `src/` contains a minimal Three.js game loop, a ship, an asteroid, and shared types.
- `tests/` contains a Playwright screenshot test that starts the dev server and captures a frame.
- `npm run dev`, `npm run build`, `npm run typecheck`, `npm run test` all function.

## 4. Changes Per File

### New files

| File | Purpose |
|---|---|
| `vite.config.ts` | Vite config (dev server, build, preview). |
| `tsconfig.json` | TypeScript config for the browser project. |
| `index.html` | Entry HTML with a canvas and script tag. |
| `src/main.ts` | Bootstrap: create renderer, attach to canvas, start game loop. |
| `src/game.ts` | `Game` class: update + render, delta time, scene management. |
| `src/ship.ts` | Procedural ship mesh + input handling stub. |
| `src/asteroid.ts` | Procedural Iron Slag asteroid mesh + basic break/split stub. |
| `src/types.ts` | Shared interfaces (Vector2, Entity, AsteroidSize). |
| `tests/screenshot.spec.ts` | Playwright test: start dev server, capture screenshot. |
| `vitest.config.ts` | Vitest config for unit tests (pure utilities later). |

### Modified files

| File | Change |
|---|---|
| `package.json` | Add dev dependencies and `dev`, `build`, `typecheck`, `lint`, `preview`, `test` scripts while keeping `headroom:*`. |
| `.claude/settings.json` | Add `Bash(npm run dev)`, `Bash(npm run typecheck)`, `Bash(npm run test)` if the existing `Bash(npm *)` wildcard is not sufficient. |

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Playwright browser download fails on Windows | High | Use `npx playwright install chromium` with project permission; fallback to manual Playwright MCP screenshot. |
| Vite HMR conflicts with HEADROOM proxy | Low | HEADROOM sits between Claude Code and Ollama; it does not affect the dev server. |
| Three.js version breaks `@types/three` | Low | Pin `three` and `@types/three` to matching stable versions. |
| Over-engineering the Phase 0 scaffold | Medium | Strictly limit Phase 0 to one ship, one asteroid, starfield, and the loop. No shield, no planet, no enemy, no hub. |
| TypeScript strict mode causes noise | Low | Enable `strict` but allow `any` only in explicit shim files; fix errors as they appear. |

## 6. Verification Plan

```
Plan:
1. Install dependencies (vite, three, typescript, playwright, vitest) → verify: npm install exits 0.
2. Create config files (vite, tsconfig, vitest) → verify: no syntax errors on load.
3. Implement minimal src/ files → verify: npm run dev starts and serves http://localhost:5173.
4. Run Playwright screenshot test → verify: test passes and produces .test-artifacts/phase0-screenshot.png.
5. Run npm run typecheck → verify: tsc --noEmit reports 0 errors.
6. Run npm run test → verify: vitest exits 0.
```

## 7. Test Matrix

| Scenario | Command / Action | Expected Result |
|---|---|---|
| Dev server starts | `npm run dev` | Vite serves on `http://localhost:5173`, no console errors. |
| Game renders | Load dev URL in browser | Canvas displays a dark starfield, a ship, and at least one asteroid. |
| Screenshot harness | `npm run test` | Playwright starts dev server, captures screenshot, test passes. |
| Type safety | `npm run typecheck` | `tsc --noEmit` returns 0 errors. |
| Build works | `npm run build` | Vite produces a `dist/` folder with bundled assets. |
| HEADROOM unaffected | `!npm run headroom:status` via status bar | Status bar still shows `HEADROOM ON`. |

## 8. Files Modified / Created Summary

- **Created:** `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.ts`, `src/game.ts`, `src/ship.ts`, `src/asteroid.ts`, `src/types.ts`, `tests/screenshot.spec.ts`, `vitest.config.ts`.
- **Modified:** `package.json`, `.claude/settings.json` (permissions), `.claude/plans/README.md` (status table).

## 9. Estimate

| Step | Time |
|---|---|
| Dependency install + configs | 10 min |
| Minimal Three.js scene + loop | 20 min |
| Ship + asteroid procedural meshes | 15 min |
| Playwright screenshot harness | 20 min |
| Typecheck + test polish | 15 min |
| Agent review + adjustments | 20 min |
| **Total** | **~1.5–2 hours** |

## 10. Open Decisions

1. Should the screenshot harness be a Playwright test under `tests/` or a standalone script in `.claude/`?
   - **Recommendation:** `tests/` so it runs with `npm test` and becomes a quality gate.
2. Should lint be configured now or deferred to Phase 1?
   - **Recommendation:** Defer ESLint; set `lint` to `echo 'Lint not configured yet.'` to avoid blocking Phase 0. Add it after the first gameplay code is stable.
3. Should unit tests use Vitest or Node built-in test runner?
   - **Recommendation:** Vitest for Vite-native HMR and TS support.

## 11. Related

- `Knowledge/Wiki/asteroids-next-edition-spec.md`
- `Knowledge/Wiki/asteroids-next-edition-starter-kit.md`
- `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\project_spec_planning_done_phase_0_foundations.md`
- `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\karpathy_method.md`
