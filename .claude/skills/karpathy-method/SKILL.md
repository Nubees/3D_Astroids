---
name: karpathy-method
description: Apply Andrej Karpathy's LLM coding guidelines — think before coding, simplicity first, surgical changes, goal-driven execution. Use when planning, writing, reviewing, or debugging code.
allowed-tools: [Read, Grep, Glob, Bash, Edit, Write]
---

# Karpathy Method

## Before starting any task

1. **State your mode:** Planning | Building | Reviewing | Debugging | Testing
2. **State your assumptions.** If uncertain, ask.
3. **Search before building.** Use `Grep`/`Glob` to find existing similar functionality.
4. **Choose the simplest viable approach.** If you are considering an abstraction, delay it until there are at least two concrete use cases.

## During implementation

1. **Surgical changes only.** Every changed line should trace to the user's request.
2. **Match existing style.** Do not "improve" adjacent code unless asked.
3. **Clean up your own mess only.** Remove unused imports/variables that your change created. Do not delete pre-existing dead code.
4. **Write My Rules comment blocks** for every non-trivial section.

## Verification plans

For any task with >2 steps or >1 file, produce:

```
Plan:
1. [Step] → verify: [specific check]
2. [Step] → verify: [specific check]
3. [Step] → verify: [specific check]
```

Do not proceed to step N+1 until step N's verification passes.

## When to escalate

- If the design is unclear or could be simpler → suggest `challenger-agent`.
- If the task is large or architectural → write a `.claude/plans/` document first.
- If you are about to touch more than what was asked → stop and ask.

## Anti-patterns

- Strategy patterns for single-use code
- Speculative configuration or flexibility
- Drive-by refactoring of unrelated code
- "I'll review and improve the code" without verifiable goals
