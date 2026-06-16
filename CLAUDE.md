# CLAUDE.md — 3D Astroids

This file provides guidance to Claude Code when working with code in this repository.

Claude must use the highest thinking and problem solving ability it can get from the model.
Claude will always apply deeper critical thinking to every fix, tracing root causes, examining edge cases,
and questioning assumptions before proposing solutions.

## How to use this file

`CLAUDE.md` is the primary rulebook for this project. It must stay in sync with:
1. Long-term memory files in `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\`
2. Project skills in `.claude/skills/`
3. Project agents in `.claude/agents/`
4. Pre-tool-use hook guardrails in `.claude/hooks/pre-tool-use.cjs`
5. The knowledge architecture in `Knowledge/`

If a rule appears in this file, it should also be reflected in memory or a framework file where appropriate.

| Rule in CLAUDE.md | Detailed framework |
|---------------------|--------------------|
| Auto-Save + Recap | `Knowledge/Frameworks/auto-save.md` |
| Code Section Notes ("My Rules") | `Knowledge/Frameworks/code-section-notes.md` |
| Atomic Actions | `Knowledge/Frameworks/atomic-actions.md` |
| Verification Plans | `Knowledge/Frameworks/verification-plans.md` |
| Adversarial audit / challenger-agent | `Knowledge/Frameworks/adversarial-audit.md` |
| Environment setup | `Knowledge/Frameworks/environment-setup.md` |
| Karpathy Method | `Knowledge/Frameworks/karpathy-method.md` |
| Setup goal / quick links | `Knowledge/Wiki/setup-index.md` |
| Lessons learned / gotchas | `Knowledge/Wiki/lessons-from-donkey-kong.md` and `Knowledge/Wiki/gotchas-and-fixes.md` |

---

## Self-audit prompt (run periodically)

> Check my `CLAUDE.md`, my knowledge base (`Knowledge/` + memory), my skills, and my guardrails.
> For each of the **top 5 gaps**, name the file, the problem, and the exact fix — and flag which risky actions need a hook so I can't bypass them.

When asked to run this audit, spawn at least two review agents (e.g., `challenger-agent` + `testing-agent`), compare their findings, and present a ranked list with file paths and concrete fixes. Do not skip the audit because the project "looks fine."

---

## Project

3D Astroids — Browser-based 3D asteroids-style game.
- Engine / framework: **TBD** (decision pending).
- Language: **TBD** (likely TypeScript if web-based).
- Build system: **TBD** (Vite / webpack / engine tooling to be selected).

## Commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (TBD) |
| Build | `npm run build` (TBD) |
| Type check | `npm run typecheck` (TBD) |
| Lint | `npm run lint` (TBD) |
| Preview build | `npm run preview` (TBD) |
| Run tests | `npm test` (TBD) |

## Architecture

| Layer | Technology | Responsibility |
|-------|------------|----------------|
| Game loop | TBD | Update, render, timing |
| 3D rendering | TBD | Models, camera, lighting |
| Physics / movement | TBD | Ship motion, asteroid collisions |
| Input | TBD | Keyboard / mouse / gamepad |
| Build | TBD | Bundling, dev server, HMR |

## Key Conventions

- All game code lives under `src/`. No logic in `public/`.
- Engine-specific integration code lives in its own subdirectory (e.g., `src/renderer/`, `src/physics/`).
- Input abstraction maps raw device input to game actions.
- Placeholder / procedural assets first; replace later.
- Use `readonly` for config constants. Prefer `const` over `let`.
- Export shared types from `src/types.ts`. Avoid deep barrel files.
- Keep visual representation and physics/collision layers independently tunable.
- Match existing style in every file you edit. Do not "improve" adjacent code unless asked.

---

## Knowledge Architecture

This project uses a three-layer knowledge system. Claude must respect the ownership and mutability rules of each layer.

| Layer | Path | Owner | Purpose | Mutability |
|-------|------|-------|---------|------------|
| **RAW** | `Knowledge/RAW/` | Austin | Immutable source material — Austin ingests, never gets edited | Never edited by Claude |
| **Wiki** | `Knowledge/Wiki/` | Claude | Claude generated synthesis and Claude maintained | Claude maintains |
| **Frameworks** | `Knowledge/Frameworks/` | Austin + Claude | Actionable guides | Collaborative |

### Rules

1. **RAW is immutable.** Claude reads it but never writes to it. If a RAW source is wrong, add a correction note in `Wiki/` rather than editing the original.
2. **Wiki is the searchable index.** When Claude needs context, read `Wiki/` first, then fall back to `RAW/` only if the synthesis is insufficient.
3. **Frameworks are executable conventions.** Every framework should be actionable: "When X happens, do Y." If it is not actionable, it belongs in `Wiki/`.
4. **Cross-link liberally.** Wiki entries link to RAW files; Frameworks link to Wiki entries and memory files.
5. **Memory is the persistent rule store.** Project rules, user feedback, and gotchas live in `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\`. Knowledge frameworks should link to memory files with `[[name]]`.

---

## Working Rules

### Karpathy Method

Behavioral guidelines to reduce common LLM coding mistakes. Bias toward caution over speed.

1. **Think Before Coding**
   - State assumptions explicitly before implementing.
   - If multiple interpretations exist, present them — don't pick silently.
   - If a simpler approach exists, say so. Push back when warranted.
   - If something is unclear, stop, name what's confusing, and ask.

2. **Simplicity First**
   - Minimum code that solves the problem. Nothing speculative.
   - No features beyond what was asked.
   - No abstractions for single-use code.
   - No "flexibility" or "configurability" that wasn't requested.
   - If you write 200 lines and it could be 50, rewrite it.

3. **Surgical Changes**
   - Touch only what the user's request requires.
   - Don't "improve" adjacent code, comments, or formatting.
   - Match existing style, even if you'd do it differently.
   - Clean up only the mess your own changes create (unused imports, orphaned variables).
   - If you notice unrelated dead code, mention it — don't delete it.

4. **Goal-Driven Execution**
   - Transform tasks into verifiable goals.
   - "Add validation" → "Write tests for invalid inputs, then make them pass."
   - "Fix the bug" → "Write a test that reproduces it, then make it pass."
   - "Refactor X" → "Ensure tests pass before and after."

### Role Routing

Before starting any task, identify the right mode and state it explicitly:

| Mode | What I will do | What I will NOT do |
|------|----------------|--------------------|
| **Planning** | Research options, write `.claude/plans/`, define verification | Write implementation code |
| **Building** | Make surgical changes to solve the stated problem | Redesign unrelated systems, add speculative features |
| **Reviewing** | Read code, ask questions, suggest improvements | Make edits unless explicitly asked |
| **Debugging** | Reproduce, isolate root cause, propose minimal fix | Layer workarounds without understanding the cause |
| **Testing** | Run gates, write/propose tests, verify behavior | Change production logic unless the fix is trivial and safe |

### Search Before Building

Before writing new code:
1. Search the existing codebase for similar functionality (`Grep` / `Glob`).
2. Check existing skills, agents, and `Knowledge/Wiki/`.
3. Reuse or extend existing patterns rather than duplicating.
4. If duplication seems unavoidable, document why in a "My Rules" comment block.

### Effort Matching

Match analysis depth to task size:

| Task size | Response |
|-----------|----------|
| Quick fix (<5 lines, obvious) | Short explanation + change |
| Medium change (1 file, contained) | Brief plan + verification |
| Large change (>1 file, architecture, new feature) | Full plan with options, risks, verification matrix |

---

## Verification Plans

**Before building anything multi-step, include a verification plan.**

For any task with more than 2 steps or that touches more than 1 file, state the plan in this format:

```
Plan:
1. [Step] → verify: [specific check]
2. [Step] → verify: [specific check]
3. [Step] → verify: [specific check]
```

Verification can be:
- A test passing
- A command succeeding (`npm run typecheck`, `npm test`, etc.)
- A manual check (screenshot, browser behavior)
- A code review from an agent (`coder-agent`, `testing-agent`, `challenger-agent`)

Do not proceed to the next step until the current step's verification is satisfied.

---

## Testing

- Unit tests for pure utility functions in `src/utils/`.
- Manual / automated playtesting for rendering and physics feel.
- Run `npm test` before committing. Fix type errors before pushing.
- After every batch of changes, explicitly state: `"Commit needed: YES"` or `"Commit needed: NO"`.

---

## Workflow Obligations (Non-Negotiable)

### 1. Auto-Save + Recap Every 50 Minutes
- A cron job fires every 50 minutes. When it fires:
  1. **Check state.** "Busy" means the agent has an unresolved tool call in flight or is actively generating a response to a user message. Empty idle time is NEVER busy.
  2. **Announce.** Post exactly: `🔄 Memory save is now taking place…`
  3. **Persist.** Write all new/updated memories to `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\`.
  4. **Empty-cycle mandate.** Even if no memories changed, touch the newest `.md` file in the memory directory so the status bar timestamp (`💾 HH:MM`) updates.
  5. **Recap.** Summarize the last 50-minute block. Minimum required: (a) files modified, (b) decisions made, (c) blockers encountered, (d) next immediate step.
  6. **Confirm.** Post exactly: `✅ Memory save complete. Recap delivered.`
- **This is mandatory.** Do not disable the cron or skip a cycle without explicit user approval.
- Persisted in 4 layers: memory file, session-start hook, this CLAUDE.md section, and MEMORY.md index.
- See `Knowledge/Frameworks/auto-save.md` for the exact procedure.

### 2. Code Section Notes ("My Rules")
- Between every distinct code section (or after any non-trivial change), insert a detailed comment block with:
  - **Purpose** — why this block exists.
  - **Setup** — what it needs to work.
  - **Issues** — what was broken before.
  - **Fix** — what was done and why.
  - **Gotchas** — edge cases or traps for future editors.
- **Triviality test:** If the change required debugging, research, or altered a value derived from another system, it is non-trivial. Pure refactors (renaming a variable with no logic change) are trivial.
- **Self-enforcement:** Before declaring any task "done", read back every added comment block from the files and paste it verbatim into the chat. If more than 3 blocks were added, post a summary message: `"Verifying N comment blocks across files: [file1.ts, file2.ts, ...]"`, then paste each block.
- "My Rules" and "Rules" are aliases for this exact procedure.
- See `Knowledge/Frameworks/code-section-notes.md` for the full spec.

### 3. Development Workflow Preferences
1. **Research first.** Present 2–4 options with pros/cons and a clear recommendation before making architectural or tooling decisions.
2. **Infrastructure before features.** Set up project config, tooling, and folder structure before writing implementation code. **Override clause:** This applies only when the user initiates a new project, major phase, or explicitly asks for setup. It does NOT justify refactoring unrelated systems during a targeted bugfix or asset swap.
3. **Procedural assets.** Default to code-generated or downloadable assets. Do not assume 3D modeling skills.
4. **Browser verification.** After any visual change, run the dev server and capture a gameplay screenshot to confirm the result before declaring done. **Fallback:** If Playwright/screenshot fails, verbally describe what was changed and ask the user to verify visually.
5. **Percentage adjustments.** When tweaking sizes or positions of existing assets, use percentage adjustments (e.g., "30% bigger", "shift by 10%") rather than absolute pixel values. **Baseline rule:** If no prior value exists, propose an absolute starting value, get approval, then switch to percentage adjustments for refinements.
6. **No side changes.** Only touch files and systems directly related to the user's request. If a side change seems necessary, ask first.

### 4. Atomic Actions ("No Assumptions")
1. **Do exactly what is asked.** Every instruction is atomic.
2. **No cascading.** Completing task X does NOT imply task Y is done, even if Y was a prerequisite.
3. **No side effects.** If asked for A, deliver A. Do not also do B, C, or D because they "seem related."
4. **Ask first.** If something else seems necessary, ask: "Should I also...?" and wait for an answer.
5. **Verbalize assumptions.** If an assumption must be made to proceed, state it explicitly before acting: "I am assuming X — confirm or correct me."
6. **Task states are the user's property.** Only the user decides when a task is complete.
