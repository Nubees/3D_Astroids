# Plugins

Plugins in Claude Code are installed **globally** via the Claude Code marketplace or CLI. They do **not** live inside this project folder.

## Currently Enabled Plugins (Global)

See `~/.claude/settings.json` under `enabledPlugins` for the authoritative list.

Plugins useful for this project once the stack is chosen:

| Plugin | Purpose |
|--------|---------|
| `context7@claude-plugins-official` | Query up-to-date library documentation |
| `playwright@claude-plugins-official` | Browser automation for playtesting |
| `typescript-lsp@claude-plugins-official` | TypeScript language server features |

## How to Manage Plugins

- **List installed:** Run `/plugin list` inside Claude Code.
- **Install new:** Use `/plugin install <plugin-name>`.
- **Disable:** Remove from `enabledPlugins` in `~/.claude/settings.json`.

## Note

This `plugins/` folder exists only for documentation. No plugin code should be placed here.
