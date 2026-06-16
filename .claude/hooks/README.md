# Claude Code Hooks

Hooks are scripts that run automatically in response to Claude Code events. They are configured in `.claude/settings.json` and referenced from this folder.

## How Hooks Work

- **SessionStart:** Runs once when a new Claude Code session begins. Good for printing project reminders or checking environment.
- **PreToolUse:** Runs before every matched tool call. Can provide additional context or warnings.
- **PostToolUse:** Runs after every matched tool call. Good for logging, notifications, or post-processing.

## Current Hooks

| Hook | Script | Purpose |
|------|--------|---------|
| SessionStart | `session-start.cjs` | Print project greeting, check `node_modules`, remind about auto-save |
| PreToolUse | `pre-tool-use.cjs` | Warn about destructive commands and `.env` file writes |
| PostToolUse | `post-tool-use.cjs` | Log tool errors to `.remember/logs/hook-errors.log` |

## Creating a New Hook

1. Create a `.cjs` or `.js` script in this folder.
2. Add an entry to `hooks` in `.claude/settings.json`.
3. The script receives event data via stdin and prints JSON to stdout.

## Important

- Hooks run in a subprocess. They cannot directly modify the chat.
- Keep hooks fast (< 1 second) to avoid slowing down every tool call.
- On Windows, use `node` scripts for portability instead of `.sh`.
- If the project later declares `"type": "module"` in `package.json`, use `.cjs` for CommonJS `require()` scripts.
