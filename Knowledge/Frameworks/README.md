# Frameworks — Actionable Guides (Austin + Claude Collaborate)

This folder holds actionable guides, checklists, and procedures that Austin and Claude follow when working on the project.

## What belongs here

- Decision frameworks (e.g., "How to choose a 3D engine")
- Coding checklists (e.g., "Pre-commit verification checklist")
- Debugging playbooks (e.g., "Status line not showing — diagnosis steps")
- Review procedures (e.g., "How to run challenger-agent against a plan")
- Workflow templates (e.g., "Feature implementation plan template")

## What does NOT belong here

- Original source material — `Knowledge/RAW/`
- General project background — `Knowledge/Wiki/`
- Code, logs, or build artifacts

## Format

Each framework should be actionable. Prefer checklists and `if-then` statements over prose.

```markdown
# Framework: <name>

## When to use
...

## Steps
1. ...
2. ...

## Verification
- [ ] ...
- [ ] ...

## Related
- Wiki: [[wiki-file]]
- Memory: [[memory-name]]
- RAW: `RAW/YYYY-MM-DD-...`
```

## Ownership

User and Claude collaborate. The user owns the intent; Claude owns keeping the framework current as the project evolves.
