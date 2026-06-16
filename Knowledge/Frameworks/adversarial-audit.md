# Framework: Adversarial Audit

This framework defines how and when to use the `challenger-agent` as a devil's advocate.

Linked memory: [[challenger-agent]]

---

## When to run an adversarial audit

- Before committing non-trivial changes (architecture, public APIs, game loop, physics, >3 files).
- During architectural or tooling decisions, after research but before implementation.
- During complex bugfixes that seem too clever or rely on non-obvious root causes.
- After `coder-agent` finishes a large feature, as a sequential second opinion.

---

## Audit lenses

The challenger inspects work with these lenses:

1. **Requirements fit** — Does it solve the stated problem, or a different easier one?
2. **Robustness** — Edge cases, nulls, missing assets, failed loads, timeouts, fallbacks.
3. **Logic and consistency** — Does reasoning hold up? Are names, units, and coordinates consistent?
4. **Simplicity** — Can it be smaller or clearer without losing capability?
5. **Optimization discipline** — Is performance work grounded by a measured hot path?
6. **Cost effectiveness** — API/token cost, runtime performance, maintenance, debuggability.
7. **Project rule compliance** — My Rules blocks, atomic actions, no side changes, browser verification.
8. **Assumption surfacing** — List unstated assumptions the author must confirm or refute.

---

## Output format

The challenger must start with one of:
- `APPROVE`
- `APPROVE WITH CONCERNS`
- `CHALLENGE`

For concerns or challenges, list issues with:
- severity
- concise description
- concrete recommendation or question
- file/line references

End with a short "if I were forced to change one thing first" priority.

---

## Setup.md-specific audit

After any major change to environment, hooks, status line, memory format, or permissions, run an adversarial audit of `Setup_MD/Setup.md` with at least two agents:
1. Technical auditor — find gaps, incorrect paths, missing steps.
2. Naive user roleplay — find the first point where a fresh Claude Code instance would fail.

Fix all blockers, triage warnings, and append a maintenance log entry to `Setup.md` Section 9.
