# Wiki: Gotchas and Fixes

This file tracks known issues, their root causes, and resolutions for the 3D Astroids Claude Code environment.

---

## Status line

### `auto mode on` instead of custom bar

| | |
|---|---|
| Root cause | Windows backslashes in `statusLine.command` are treated as escape sequences by the Git Bash runner. |
| Fix | Use forward slashes in all `settings.json` paths, e.g., `C:/Users/<YourUser>/.claude/3dastroids-statusline.cjs`. |

### Custom bar still not shown after editing settings

| | |
|---|---|
| Root cause | The `statusLine` config is cached at Claude Code process startup. |
| Fix | Fully exit Claude Code (`Ctrl+C` or `exit`) and restart it. |

---

## Trust and startup

### Trust dialog repeats every session

| | |
|---|---|
| Root cause | `hasTrustDialogAccepted` is missing from `~/.claude.json`. |
| Fix | Accept the dialog once interactively. Do not hand-edit `.claude.json`. |

### Session-start hook fails with "node not found"

| | |
|---|---|
| Root cause | Hook runs before shell env is fully initialized, or Node.js is only in the user PATH. |
| Fix | Ensure Node.js is in the **system** PATH. |

---

## Memory

### Memory save time shows `--:--` forever

| | |
|---|---|
| Root cause | No `.md` files in the memory directory yet. |
| Fix | Create or update any memory `.md` file in `C:\Users\<YourUser>\.claude\projects\C--Projects-3D-Astroids\memory\`. |

### Memory file `type` field rejected or ignored

| | |
|---|---|
| Root cause | The `type` field was nested under `metadata:` instead of being top-level. |
| Fix | Use this exact format: `---\nname: ...\ndescription: ...\ntype: project\n---`. |

---

## Plugins and marketplace

### Plugins not available

| | |
|---|---|
| Root cause | Marketplace not initialized or plugin IDs changed. |
| Fix | Run `/plugin list` and `/plugin install <name>` manually. IDs may drift. |

---

## Module system

### `.cjs` vs `.js` confusion

| | |
|---|---|
| Root cause | The project may later declare `"type": "module"`. |
| Fix | Any file using `require()` must use the `.cjs` extension. |

---

## Configuration loss

### Lost all configs after reinstall

| | |
|---|---|
| Root cause | `~/.claude/` and `project/.claude/` are machine-specific and not in Git. |
| Fix | Back up `~/.claude/settings.json`, `~/.claude/3dastroids-statusline.cjs`, and `project/.claude/` to a private dotfiles repo or cloud storage. |

---

## Engine-specific gotchas

Add new engine-specific issues here as they are discovered.
