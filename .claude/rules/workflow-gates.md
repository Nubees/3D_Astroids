# Workflow — Gate Testing Prompt

After every code change, before declaring it done, Claude MUST ask the user
which gate scope to run, using the `AskUserQuestion` tool with the multi-choice
form. Do NOT run quality gates unprompted — the user values speed over
unprompted verification and wants to choose per-iteration.

## Required Prompt

Use the `AskUserQuestion` tool after every code change. The question header
must be `Gate scope`. Use these exact options:

1. **All gates** — Typecheck + vitest + playwright + build (~60s). Most
   thorough; catches type errors, unit regressions, browser regressions, and
   bundle size changes. Use before shipping or when changes touch rendering.
2. **Typecheck + unit tests** — `tsc --noEmit` + `npm test -- --run`
   (~12s). Catches type errors and unit-test regressions. Skip browser
   screenshot suite.
3. **Typecheck only** — Just `tsc --noEmit` (~10s). Cheapest safety net for
   trivial edits like constant tweaks.
4. **Skip gates** — No verification. User accepts the risk and will catch
   regressions in the browser. Use when iterating quickly on visual polish.

## Defaults

- **If the change is trivial** (constant tweak, single-line fix, comment
  update): recommend **Typecheck only** as the first option.
- **If the change touches rendering, physics, or game state**: recommend
  **Typecheck + unit tests** as the first option (vitest covers pure logic).
- **If the change is a release / ship candidate**: recommend **All gates**
  as the first option.

## When to Skip the Prompt

Skip the AskUserQuestion prompt ONLY when:

- The user has already explicitly said which gate scope to run for the
  current batch (e.g. "just typecheck from now on" → no prompt needed).
- The user said "skip" or "no gates" in their previous prompt and that
  intent still applies.
- The change is a documentation-only or memory-file edit (no code touched).

## Anti-Patterns

- DO NOT run `npm run typecheck` / `npm test` / `npm run build` without
  asking first — this is exactly the slowdown the rule exists to prevent.
- DO NOT chain "I'll just run typecheck real quick" without asking.
- DO NOT skip the prompt because "the change is small" — small changes
  can still have type errors; let the user decide.
