---
name: preview-project
description: Start the dev server and open the game in a browser for playtesting. Use when the user says "preview", "run the game", "test in browser", or "play".
allowed-tools: [Bash, mcp__plugin_playwright_playwright__browser_navigate, mcp__plugin_playwright_playwright__browser_snapshot]
---

# Preview Project Workflow

1. Determine the dev server command from `package.json` or project `CLAUDE.md`.
2. Start the dev server for the chosen stack.
3. Wait for the server to be ready.
4. Open the browser to the local URL.
5. Take a snapshot of the page so the user can see the current state.
6. Report the server URL and any console errors found.
