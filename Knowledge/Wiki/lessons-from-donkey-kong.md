# Wiki: Lessons from Donkey Kong

This file captures the transferable lessons from the Donkey Kong project that we applied to 3D Astroids.

Linked memory: [[project_phased_cleanup_procedure]], [[project_setup_md_adversarial_audit]]

---

## 1. Keep projects isolated

**Lesson:** Reusing setup patterns is good, but reusing the exact same files creates coupling.

**Application:**
- Created a separate status-line script: `3dastroids-statusline.cjs` instead of reusing Donkey Kong's.
- Kept all project configuration under `C:\Projects\3D_Astroids\.claude\`.
- Pointed memory to a separate project directory: `C--Projects-3D-Astroids`.

---

## 2. Path escaping on Windows

**Lesson:** Backslashes in `settings.json` paths are treated as escape sequences by the internal Git Bash runner.

**Application:**
- Use forward slashes (`C:/Users/...`) in all Claude Code configuration paths.
- This applies to `statusLine.command`, `hooks.*`, `memory.project`, and `agents.*`.

---

## 3. Status line needs a full restart

**Lesson:** The `statusLine` config is cached at Claude Code process startup.

**Application:**
- Any status-line change requires a full exit and restart to take effect.
- Documented this in `Knowledge/Wiki/gotchas-and-fixes.md`.

---

## 4. Memory files need top-level `type`

**Lesson:** Memory file frontmatter expects `type:` at the top level, not nested under `metadata:`.

**Application:**
- Normalized all memory files so `type` is top-level.
- Documented the format in `Knowledge/Frameworks/environment-setup.md`.

---

## 5. Adversarial audits catch blind spots

**Lesson:** Technical review alone misses where a fresh user would fail.

**Application:**
- Added `challenger-agent.md`.
- Created `Knowledge/Frameworks/adversarial-audit.md` with a two-agent audit format (technical + naive user roleplay).
- Required audits after major setup changes.

---

## 6. Monolithic runbooks rot

**Lesson:** A single `Setup.md` file becomes stale and hard to navigate.

**Application:**
- Split content into RAW/Wiki/Frameworks.
- Rewrote `Setup.md` as a thin goal-bridge index.
- Stored full procedures in `Knowledge/Frameworks/` and synthesis in `Knowledge/Wiki/`.

---

## 7. Self-containment is worth the cost

**Lesson:** External references break if the source project is moved or deleted.

**Application:**
- Copied the most important Donkey Kong lessons into our own Wiki/RAW files rather than linking externally.
- Kept `Setup_MD/Setup.md.bak` as a local backup of the original runbook.
