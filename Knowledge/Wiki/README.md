# Wiki — Claude Generated Synthesis and Claude Maintained

This folder contains summaries, indexes, and cross-references built from RAW material and project experience. It is Claude's maintained knowledge layer.

## What belongs here

- Synthesized notes from RAW sources.
- Glossaries of project terms, naming conventions, coordinate systems.
- Comparison tables (e.g., engine stack options).
- Session summaries that reference RAW inputs.
- Links to relevant memory files in `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\`.

## What does NOT belong here

- Original user documents — those stay in `Knowledge/RAW/`.
- Step-by-step procedures — those go in `Knowledge/Frameworks/`.
- Code or build artifacts.

## Format

Each wiki file is a Markdown file with standard frontmatter:

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary>
---

Summary...
```

## Key entries

- [[setup-index]] — where to start when setting up the project.
- [[lessons-from-donkey-kong]] — what we reused from the previous project and why.
- [[gotchas-and-fixes]] — known issues and resolutions.
- [[agent-team]] — the project agent roster and when to use each.
- [[skills-index]] — the project skill roster.

## Maintenance rule

When a new RAW source is added or a decision changes, Claude should update or create a Wiki entry. Stale wiki entries should be marked with `(STALE — verified [date])` in the description or first line.

Cross-link liberally to RAW files, Frameworks, and memory files using `[[name]]`.
