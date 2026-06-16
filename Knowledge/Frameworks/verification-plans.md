# Framework: Verification Plans

This framework requires a verification plan before any multi-step build task.

Linked memory: [[karpathy-method]]

---

## When a plan is required

Before building anything that is:
- more than 2 steps, **or**
- touches more than 1 file.

---

## Format

```
Plan:
1. [Step] → verify: [specific check]
2. [Step] → verify: [specific check]
3. [Step] → verify: [specific check]
```

---

## Valid verification methods

- A test passing.
- A command succeeding (`npm run typecheck`, `npm test`, `npm run lint`).
- A manual check (screenshot, browser behavior).
- A code review from an agent (`coder-agent`, `testing-agent`, `challenger-agent`).

---

## Rule

Do not proceed to the next step until the current step's verification is satisfied.

---

## Why

Turns vague tasks into verifiable goals and catches regressions before they compound.
