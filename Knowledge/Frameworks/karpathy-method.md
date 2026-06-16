# Framework — Karpathy Method

## When to use

For every coding, planning, or debugging task in the 3D Astroids project.

## The 4 principles

1. **Think Before Coding** — Surface assumptions, tradeoffs, and multiple interpretations before implementing.
2. **Simplicity First** — Minimum code that solves the problem. No speculative abstractions or unrequested features.
3. **Surgical Changes** — Touch only what the request requires. Match existing style. Clean up only your own mess.
4. **Goal-Driven Execution** — Define verifiable success criteria. For multi-step tasks, state `Step → verify: check`.

## Pre-task role routing

Before starting any task, identify the mode:

| Mode | What I will do | What I will NOT do |
|------|----------------|--------------------|
| **Planning** | Research options, write `.claude/plans/`, define verification | Write implementation code |
| **Building** | Make surgical changes to solve the stated problem | Redesign unrelated systems, add speculative features |
| **Reviewing** | Read code, ask questions, suggest improvements | Make edits unless explicitly asked |
| **Debugging** | Reproduce, isolate root cause, propose minimal fix | Layer workarounds without understanding the cause |
| **Testing** | Run gates, write/propose tests, verify behavior | Change production logic unless the fix is trivial and safe |

State the mode explicitly when beginning work.

## Search before building

Before writing new code:
1. Search the codebase for similar functionality (`Grep` / `Glob`).
2. Check existing skills, agents, and `Knowledge/Wiki/`.
3. Reuse or extend existing patterns rather than duplicating.

## Effort matching

Match depth to task size:

| Task size | Response |
|-----------|----------|
| Quick fix (<5 lines, obvious) | Short explanation + change |
| Medium change (1 file, contained) | Brief plan + verification |
| Large change (>1 file, architecture, new feature) | Full plan with options, risks, verification matrix |

## Multi-step verification plan template

For any task with more than 2 steps:

```
Plan:
1. [Step] → verify: [specific check]
2. [Step] → verify: [specific check]
3. [Step] → verify: [specific check]
```

Verification can be:
- A test passing
- A command succeeding (`npm run typecheck`, `npm test`)
- A manual check (screenshot, browser behavior)
- A code review from an agent

## Related

- Wiki: [[karpathy-method]] (to be created when first project-specific example is collected)
- Memory: [[feedback-atomic-actions]], [[feedback-workflow]], [[challenger-agent]]
- CLAUDE.md: "Workflow Obligations" section
