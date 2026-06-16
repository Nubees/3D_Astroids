# RAW — Immutable Source Material

This folder holds source material that Austin ingests and Claude never edits.

## What belongs here

- Original documents from the user (e.g., design docs, notes, screenshots)
- Exported files from external tools
- Reference images, videos, audio files
- Third-party documentation or links saved as files
- Meeting transcripts or pasted user requirements
- Anything that is "source truth" from outside the project

## What does NOT belong here

- Claude-generated summaries — those go in `Knowledge/Wiki/`
- Step-by-step procedures — those go in `Knowledge/Frameworks/`
- Code, logs, or build artifacts

## Naming convention

Use a date-stamped, descriptive filename:

```
YYYY-MM-DD-<short-description>.<ext>
```

Examples:
- `2026-06-15-engine-stack-research.pdf`
- `2026-06-15-asteroid-concept-art.png`
- `2026-06-15-user-requirements.md`

## Rule

**Claude must not edit, move, rename, or delete any file in this directory.** If a source becomes outdated, add a note in `Knowledge/Wiki/` referencing the stale RAW file and explaining the correction.
