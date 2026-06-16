# Plan — Port Donkey Kong Claude Code Environment to 3D_Astroids

**Date:** 2026-06-15  
**Goal:** Give `3D_Astroids` the same Claude Code environment structure as `DonkeyKong`, while keeping it isolated and engine-agnostic.  
**Constraints:**
- Do **not** modify any `DonkeyKong` files.
- Keep the 3D_Astroids stack undecided for now.
- Treat `Setup.md` as a living document: rewrite it for 3D_Astroids and improve it.

---

## What we are doing (and why)

The Donkey Kong project built a mature Claude Code environment: custom status line, lifecycle hooks, code-style rules, memory system, auto-save cron, skills, agents, and a detailed `CLAUDE.md`. Those lessons are transferable. We will mirror that *structure* in `3D_Astroids`, replacing Donkey-Kong-specific content with engine-agnostic placeholders.

---

## Files to create

| # | Path | Purpose |
|---|------|---------|
| 1 | `C:\Users\User101\.claude\3dastroids-statusline.cjs` | New project-specific status line (reads 3D_Astroids memory, not Donkey Kong). |
| 2 | `C:\Projects\3D_Astroids\.claude\settings.json` | Project permissions + hooks + status line override. |
| 3 | `C:\Projects\3D_Astroids\.claude\hooks\session-start.cjs` | Session greeting + auto-save reminder. |
| 4 | `C:\Projects\3D_Astroids\.claude\hooks\pre-tool-use.cjs` | Warn on destructive commands and `.env` writes. |
| 5 | `C:\Projects\3D_Astroids\.claude\hooks\post-tool-use.cjs` | Log tool errors to `.remember\logs\hook-errors.log`. |
| 6 | `C:\Projects\3D_Astroids\.claude\rules\code-style.md` | Engine-agnostic code conventions. |
| 7 | `C:\Projects\3D_Astroids\CLAUDE.md` | Project onboarding + non-negotiable workflow rules. |
| 8 | `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\MEMORY.md` | Memory index for this project. |
| 9 | `…memory\project_3d_astroids.md` | Project identity + current state. |
| 10 | `…memory\project_autosave_system.md` | Auto-save + recap rule (ported lesson). |
| 11 | `…memory\feedback_code_section_notes.md` | “My Rules” / code-section notes rule. |
| 12 | `…memory\feedback_workflow.md` | Research-first, infrastructure-first, procedural assets, etc. |
| 13 | `…memory\feedback_atomic_actions.md` | Do exactly what is asked, no cascading side effects. |
| 14 | `…memory\reference_status_line_windows.md` | Forward-slash path gotcha from Donkey Kong. |
| 15 | `C:\Projects\3D_Astroids\.claude\skills\build-project\SKILL.md` | Generic build workflow skill. |
| 16 | `C:\Projects\3D_Astroids\.claude\skills\preview-project\SKILL.md` | Generic preview/workflow skill. |
| 17 | `C:\Projects\3D_Astroids\.claude\agents\coder-agent.md` | Generic code-review specialist. |
| 18 | `C:\Projects\3D_Astroids\.claude\agents\testing-agent.md` | Testing / quality-gate specialist. |
| 19 | `C:\Projects\3D_Astroids\.claude\agents\graphics-reviewer.md` | Rendering / visual-code reviewer. |
| 20 | `C:\Projects\3D_Astroids\Setup_MD\Setup.md` | Rewritten as the 3D_Astroids environment runbook. |

## Files to modify

| # | Path | Change |
|---|------|--------|
| 1 | `C:\Users\User101\.claude\settings.json` | Add `C:\\Projects\\3D_Astroids` to `additionalDirectories`. Do **not** change the existing Donkey Kong status-line reference. |

---

## Key design decisions

### 1. Status line — new project-specific script
- Create `3dastroids-statusline.cjs` alongside the existing `dk-statusline.cjs`.
- Identical logic, but `MEMORY_DIR` points to `C--Projects-3D-Astroids\memory`.
- Project `settings.json` overrides the global status line.
- Global settings remain untouched except for `additionalDirectories`.

### 2. Engine-agnostic placeholders
- `CLAUDE.md` and `Setup.md` will mark tech stack as **TBD**.
- Code-style rules will be generic (indentation, naming, imports) without Phaser/Three.js specifics.
- Skills/agents will have generic names until the engine is chosen.

### 3. Living Setup.md
- The current `Setup.md` is a Donkey Kong runbook.
- We will rewrite it as the 3D_Astroids runbook, then append a maintenance log entry documenting the port.
- Future 3D_Astroids lessons will be appended to this document and to memory files.

### 4. Memory system — port transferable lessons
The following rules from Donkey Kong apply to any project and will be stored in memory:
- Auto-save + recap every 50 minutes.
- Code-section notes / “My Rules”.
- Workflow preferences (research first, infrastructure first, procedural assets, browser verification, percentage adjustments, no side changes).
- Atomic actions.
- Status-line forward-slash gotcha on Windows.

Donkey-Kong-specific lessons (barrels, elevators, intermission sprite sheets, fire spark scaling) will be left in Donkey Kong memory; we will not copy them.

---

## Implementation order

1. Rewrite `Setup.md` as 3D_Astroids runbook.
2. Update global `settings.json` with `additionalDirectories` entry.
3. Create `3dastroids-statusline.cjs`.
4. Create `3D_Astroids\.claude\` directory tree.
5. Create project `settings.json`.
6. Create hooks (`session-start`, `pre-tool-use`, `post-tool-use`).
7. Create `code-style.md`.
8. Create `CLAUDE.md`.
9. Create memory directory + index + transferable memory files.
10. Create generic skills and agents.
11. First run: trust dialog, verify status bar, verify hooks fire.
12. Create auto-save cron job with 3D_Astroids memory path.
13. Restart Claude Code to confirm status line.
14. Append maintenance log entry to `Setup.md`.

---

## Open decisions to discuss after this setup is complete

1. **Engine stack** — Three.js pure 3D, Phaser + Three.js overlay, Babylon.js, or something else.
2. **Additional skills** — once the engine is known, add engine-specific skills (e.g., `threejs`, `asteroids-physics`).
3. **Additional agents** — e.g., `physics-agent`, `level-designer`, `audio-agent`.
4. **Build tooling** — Vite, webpack, or engine-native tooling.

---

## Verification after implementation

- [ ] `claude` launched from `C:\Projects\3D_Astroids` shows custom status bar.
- [ ] Status bar reads from `C--Projects-3D-Astroids\memory`.
- [ ] Session-start hook prints greeting + auto-save reminder.
- [ ] Pre-tool-use hook warns on destructive patterns.
- [ ] `/CronList` shows the 3D_Astroids auto-save cron.
- [ ] `Setup.md` reads as a 3D_Astroids document, not Donkey Kong.

---

## Assistant agent used

A `feature-dev:code-architect` agent was spawned to review `Setup.md`, compare the current state, and produce the gap analysis that fed into this plan.
