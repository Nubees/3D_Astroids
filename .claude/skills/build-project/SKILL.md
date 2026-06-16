---
name: build-project
description: Build the 3D Astroids project. Runs typecheck, lint, and production build for the chosen stack. Use when the user says "build", "make production build", or before deploying.
allowed-tools: [Bash, Read, Write, Edit]
---

# Build Project Workflow

1. Determine the active build commands from `package.json` or project `CLAUDE.md`.
2. Run the type-check command for the chosen stack.
3. Run the lint command for the chosen stack.
4. If either fails, report errors and stop.
5. Run the production build command.
6. Report success and the output path.
