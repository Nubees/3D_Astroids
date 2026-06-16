# Claude Code Rules

This directory contains project-specific rules that Claude Code should follow when working with code in this repository.

## Current Rules

| File | Scope | Purpose |
|------|-------|---------|
| `code-style.md` | All source files | Engine-agnostic formatting, naming, imports, and game-code patterns |

## Creating a New Rule

1. Create a `.md` file in this folder.
2. Optionally add a frontmatter block with `paths` to scope the rule to specific files:
   ```markdown
   ---
   paths:
     - "src/**/*.ts"
     - "src/**/*.js"
   ---
   ```
3. Add clear headings and concrete examples.
4. Update this README.

## Scoping Rules to Files

Claude Code can associate a rule file with specific file patterns via frontmatter. This is useful when different parts of the project need different conventions (e.g., renderer code vs. utility code).

Example frontmatter:
```markdown
---
paths:
  - "src/renderer/**/*.ts"
---
```

Without a `paths` block, the rule applies globally.

## Rule Categories

- **Formatting / style** — indentation, quotes, line length
- **Architecture** — folder structure, lifecycle patterns, state management
- **Domain-specific** — engine conventions, asset pipelines, physics rules
- **Workflow** — how code should be verified before committing
