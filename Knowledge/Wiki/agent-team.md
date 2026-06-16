# Wiki: Agent Team

This file documents the project-specific agents for 3D Astroids.

See the agent definitions in `C:\Projects\3D_Astroids\.claude\agents\`.

---

## Roster

| Agent | Role | Edits? | When to use |
|-------|------|--------|-------------|
| `coder-agent` | Correctness, style, cleaner implementation | Yes | Writing or modifying game code |
| `testing-agent` | Test coverage and quality gates | Yes | Reviewing tests, verifying gate before commit |
| `graphics-reviewer` | Rendering, shaders, asset loading, visual verification | Yes | Modifying visual code or integrating a 3D engine |
| `challenger-agent` | Adversarial review | No | Before significant commits, architectural decisions, complex bugfixes |

---

## Usage guidelines

- Route skepticism about requirements, design, or cost to `challenger-agent`.
- `coder-agent`, `testing-agent`, and `graphics-reviewer` should not act as final arbiters of whether a feature should exist.
- For adversarial review of rendering trade-offs, escalate from `graphics-reviewer` to `challenger-agent`.
- See `Knowledge/Frameworks/adversarial-audit.md` for the full audit procedure.
