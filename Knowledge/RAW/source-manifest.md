# RAW Source Manifest — 3D Astroids

This file lists the immutable source material for the 3D Astroids project.

**Owner:** Austin. Claude reads but never edits files in this directory.

---

## Manifest

| Source | Date | Description | Location |
|--------|------|-------------|----------|
| Karpathy Method video summary | 2026-06-15 | External research summary on Karpathy's workflow philosophy | `Knowledge/Wiki/lessons-from-donkey-kong.md` |
| Setup.md backup | 2026-06-15 | Full original runbook before migration | `Setup_MD/Setup.md.bak` |
| Original user requirements | TBD | Capture here when provided | `Knowledge/RAW/` |
| Engine stack research | TBD | Capture here when provided | `Knowledge/RAW/` |
| Concept art / reference | TBD | Capture here when provided | `Knowledge/RAW/` |

---

## Self-contained Donkey Kong lessons (copied for durability)

These lessons were originally learned in the Donkey Kong project. They are copied here so 3D Astroids remains self-contained if Donkey Kong is removed.

### Lesson 1: Project isolation

Keep status lines, memory paths, and project configs separate per project.

### Lesson 2: Windows path escaping

Use forward slashes in all Claude Code configuration paths; backslashes are interpreted as escape sequences by the Git Bash runner.

### Lesson 3: Status line requires restart

`statusLine` config is cached at process startup. Any change requires a full exit and restart.

### Lesson 4: Memory `type` frontmatter

Memory files must have `type:` as a top-level frontmatter key, not nested under `metadata:`.

### Lesson 5: Adversarial audits

Run `challenger-agent` before significant commits and after major setup changes. Use at least two lenses: technical auditor + naive user roleplay.

### Lesson 6: Monolithic runbooks rot

Split large runbooks into RAW/Wiki/Frameworks layers for maintainability.

### Lesson 7: Self-containment

Do not rely on external references for critical project knowledge. Copy or summarize important lessons locally.

---

## How to update this manifest

Austin adds new RAW files here. If a source becomes outdated, Austin may add a correction note in `Knowledge/Wiki/`; Claude does not edit RAW files.
