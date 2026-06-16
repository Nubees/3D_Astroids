# Framework: Environment Setup for 3D Astroids

This framework is the actionable setup runbook for the 3D Astroids project. It contains the exact steps to configure Claude Code, the status line, hooks, memory, skills, agents, and the knowledge architecture.

For the high-level goal and where this fits in the project, see [[setup-index]] in `Knowledge/Wiki/`.

---

## Goal

Create an isolated, self-contained Claude Code development environment for the 3D Astroids project that is independent of the older Donkey Kong project but reuses its proven setup patterns.

---

## 1. Prerequisites

- Windows 11 with Node.js in the **system** PATH.
- Claude Code CLI installed.
- A separate project folder: `C:\Projects\3D_Astroids`.
- (Optional but recommended) Read `Knowledge/Wiki/lessons-from-donkey-kong.md` before starting.

---

## 2. Global Settings

File: `C:\Users\<YourUser>\.claude\settings.json`

Add the project to `additionalDirectories` so Claude Code can discover it:

```json
{
  "additionalDirectories": [
    "C:/Projects/3D_Astroids"
  ]
}
```

Do **not** put a `statusLine` command here. The project-level `settings.json` overrides it.

---

## 3. Project Settings

File: `C:\Projects\3D_Astroids\.claude\settings.json`

```json
{
  "statusLine": {
    "command": "node C:/Users/<YourUser>/.claude/3dastroids-statusline.cjs"
  },
  "hooks": {
    "session-start": "C:/Projects/3D_Astroids/.claude/hooks/session-start.cjs",
    "pre-tool-use": "C:/Projects/3D_Astroids/.claude/hooks/pre-tool-use.cjs",
    "post-tool-use": "C:/Projects/3D_Astroids/.claude/hooks/post-tool-use.cjs"
  },
  "memory": {
    "project": "C:/Users/<YourUser>/.claude/projects/C--Projects-3D-Astroids/memory"
  },
  "agents": {
    "coder-agent": "C:/Projects/3D_Astroids/.claude/agents/coder-agent.md",
    "testing-agent": "C:/Projects/3D_Astroids/.claude/agents/testing-agent.md",
    "graphics-reviewer": "C:/Projects/3D_Astroids/.claude/agents/graphics-reviewer.md",
    "challenger-agent": "C:/Projects/3D_Astroids/.claude/agents/challenger-agent.md"
  }
}
```

**Critical Windows path rule:** Use forward slashes (`/`) everywhere. Backslashes are interpreted as escape sequences by the Git Bash runner and will break the status line.

---

## 4. Status Line

### 4.1 Script

File: `C:\Users\<YourUser>\.claude\3dastroids-statusline.cjs`

This script reads the newest `.md` file in the project memory directory and prints a status line:

```javascript
const fs = require('fs');
const path = require('path');

const memoryDir = 'C:/Users/<YourUser>/.claude/projects/C--Projects-3D-Astroids/memory';

function getNewestMtime(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => fs.statSync(path.join(dir, e.name)).mtime.getTime());
  return files.length ? Math.max(...files) : 0;
}

function formatTime(ts) {
  if (!ts) return '--:--';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const mtime = getNewestMtime(memoryDir);
process.stdout.write(`💾 ${formatTime(mtime)} | 3D Astroids`);
```

### 4.2 Debug Helper

File: `C:\Users\<YourUser>\.claude\3dastroids-statusline-debug.cjs`

Run it manually to verify the status line can execute:

```powershell
node "C:/Users/<YourUser>/.claude/3dastroids-statusline-debug.cjs"
```

If the output shows `node not found`, Node.js is not in the system PATH.

### 4.3 First Run Verification

1. Fully exit Claude Code (`Ctrl+C` or `exit`).
2. Restart Claude Code from `C:\Projects\3D_Astroids`.
3. Accept the trust dialog when prompted.
4. Verify the status bar shows something like:
   ```
   💾 HH:MM | 3D Astroids
   ```
5. If it shows only `auto mode on`, the path in `settings.json` is broken. Check forward slashes and the script path.

---

## 5. Project Hooks

### 5.1 Session Start Hook

File: `C:\Projects\3D_Astroids\.claude\hooks\session-start.cjs`

Runs when Claude Code starts in the project. It should:
1. Greet the user.
2. Warn if `node_modules` is missing.
3. Remind the user that the 50-minute auto-save cron is active.

### 5.2 Pre-Tool-Use Hook

File: `C:\Projects\3D_Astroids\.claude\hooks\pre-tool-use.cjs`

Runs before every tool call. It should guard:
- Writes to `Knowledge/RAW/` (immutable layer).
- Edits to `CLAUDE.md` (must be mirrored in memory / frameworks).
- Edits to `Setup_MD/Setup.md` (must append a maintenance log entry).

Example guards:

```javascript
if (/Knowledge[\\/]RAW[\\/]/.test(filePath)) {
  warnings.push(`Writing to ${filePath}. Knowledge/RAW/ is immutable. Add a correction note to Knowledge/Wiki/ instead.`);
}
if (/[\\/]CLAUDE\.md$/.test(filePath)) {
  warnings.push(`Editing ${filePath}. Ensure the same rule is also updated in memory and/or Knowledge/Frameworks/ if it is a workflow rule.`);
}
if (/Setup_MD[\\/]Setup\.md$/.test(filePath)) {
  warnings.push(`Editing ${filePath}. Append a maintenance log entry in Section 9 unless the change is purely formatting.`);
}
```

### 5.3 Post-Tool-Use Hook

File: `C:\Projects\3D_Astroids\.claude\hooks\post-tool-use.cjs`

Logs tool errors to a project log directory for later inspection.

---

## 6. Memory Directory and Index

Directory: `C:\Users\<YourUser>\.claude\projects\C--Projects-3D-Astroids\memory\`

Create it:

```powershell
New-Item -ItemType Directory -Force -Path "C:/Users/$env:USERNAME/.claude/projects/C--Projects-3D-Astroids/memory"
```

Every memory `.md` file must use this frontmatter format:

```markdown
---
name: short-kebab-case-slug
description: one-line summary
type: user | feedback | project | reference
---
```

The `type` field is a **top-level** frontmatter key, not inside a `metadata:` block.

The `MEMORY.md` index file should list every memory file with a one-line description. Update it whenever a new memory file is added.

---

## 7. Custom Skills

Directory: `C:\Projects\3D_Astroids\.claude\skills\`

Each skill is a folder containing a `SKILL.md` file. Start with two generic skills:

- `build-project/SKILL.md` — typecheck, lint, production build.
- `preview-project/SKILL.md` — dev server, browser open, snapshot.
- `karpathy-method/SKILL.md` — workflow reminder for the Karpathy Method.

Add engine-specific skills after the stack is chosen.

---

## 8. Custom Agents

Directory: `C:\Projects\3D_Astroids\.claude\agents\`

Create four project agents:

| Agent | Role | Edits? | When to use |
|-------|------|--------|-------------|
| `coder-agent` | Correctness, style, cleaner implementation | Yes | Writing or modifying game code |
| `testing-agent` | Test coverage and quality gates | Yes | Reviewing tests, verifying gate before commit |
| `graphics-reviewer` | Rendering, shaders, asset loading | Yes | Modifying visual code or integrating a 3D engine |
| `challenger-agent` | Adversarial review | No | Before significant commits, architectural decisions, complex bugfixes |

See `Knowledge/Wiki/agent-team.md` for full agent descriptions.

---

## 9. Knowledge Architecture

Directory: `C:\Projects\3D_Astroids\Knowledge\`

Three layers:

| Layer | Path | Owner | Mutability |
|-------|------|-------|------------|
| RAW | `Knowledge/RAW/` | Austin | Never edited by Claude |
| Wiki | `Knowledge/Wiki/` | Claude | Claude maintains |
| Frameworks | `Knowledge/Frameworks/` | Austin + Claude | Collaborative |

Rules:
1. RAW is immutable. If a RAW source is wrong, add a correction note in `Wiki/`.
2. Read `Wiki/` first; fall back to `RAW/` only when synthesis is insufficient.
3. Frameworks must be actionable: "When X happens, do Y."
4. Cross-link liberally. Wiki links to RAW; Frameworks link to Wiki and memory.
5. Memory is the persistent rule store. Knowledge frameworks should link to memory files with `[[name]]`.

---

## 10. Plans Directory

Directory: `C:\Projects\3D_Astroids\.claude\plans\`

Create detailed implementation plans here before work that:
- Touches more than 3 files.
- Changes architecture, public APIs, or game flow.
- Introduces new dependencies or build steps.
- Has significant risk or multiple implementation options.

A good plan includes: overview, current/new state, per-file changes, risk assessment, verification commands, manual test matrix, file summary, and rough time estimate.

Before executing a plan, spawn `challenger-agent` to adversarially audit it.

---

## 11. First Run Checklist

1. Open a terminal in `C:\Projects\3D_Astroids`.
2. Run `claude`.
3. Accept the trust dialog.
4. Verify the status bar shows `💾 HH:MM | 3D Astroids`.
5. Install any required marketplace plugins if prompted.
6. Verify hooks fire (session-start greeting should appear).
7. Create at least one memory file to confirm the status bar timestamp updates.

---

## 12. Maintenance

Whenever this framework changes:
1. Update the matching memory file in `C:\Users\<YourUser>\.claude\projects\C--Projects-3D-Astroids\memory\`.
2. Update `CLAUDE.md` if the change affects project-wide rules.
3. Append a maintenance log entry to `Setup_MD/Setup.md` Section 9.
4. Run the adversarial audit procedure in `Knowledge/Frameworks/adversarial-audit.md`.
