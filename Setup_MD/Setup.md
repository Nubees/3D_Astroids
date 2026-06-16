# Setup.md — 3D Astroids Dev Environment

> **Purpose:** This file is the thin goal-bridge index for recreating the Claude Code dev environment for the 3D Astroids project. The full runbook, lessons, and gotchas now live in the Knowledge Architecture.
> **Canonical entry point:** For the full setup goal, start at `Knowledge/Wiki/setup-index.md` and follow its links.
> **Last Updated:** 2026-06-15
> **Maintained By:** Claude Code
> **Origin:** Environment structure ported from the Donkey Kong 2.5D project, then migrated into a three-layer Knowledge structure.
> **Constraint:** This project is isolated from `C:\Projects\DonkeyKong`.
> **Backup:** Full original runbook preserved at `Setup_MD/Setup.md.bak`.

---

## Quick Start

1. Read `Knowledge/Wiki/setup-index.md`.
2. Follow `Knowledge/Frameworks/environment-setup.md`.
3. Check `Knowledge/Wiki/gotchas-and-fixes.md` if anything breaks.

---

## Where everything lives now

| What you need | Where it is |
|---------------|-------------|
| Full setup procedure | `Knowledge/Frameworks/environment-setup.md` |
| Auto-save cycle procedure | `Knowledge/Frameworks/auto-save.md` |
| Code-section comment rule | `Knowledge/Frameworks/code-section-notes.md` |
| Atomic-action rule | `Knowledge/Frameworks/atomic-actions.md` |
| Verification plan rule | `Knowledge/Frameworks/verification-plans.md` |
| Adversarial audit rule | `Knowledge/Frameworks/adversarial-audit.md` |
| Karpathy Method workflow | `Knowledge/Frameworks/karpathy-method.md` |
| Setup goal / quick links | `Knowledge/Wiki/setup-index.md` |
| Lessons from Donkey Kong | `Knowledge/Wiki/lessons-from-donkey-kong.md` |
| Known gotchas and fixes | `Knowledge/Wiki/gotchas-and-fixes.md` |
| Agent team | `Knowledge/Wiki/agent-team.md` |
| Skills index | `Knowledge/Wiki/skills-index.md` |
| RAW source material | `Knowledge/RAW/source-manifest.md` |
| Project-wide rules | `CLAUDE.md` |
| Persistent memory rules | `C:\Users\User101\.claude\projects\C--Projects-3D-Astroids\memory\` |

---

## When to edit this file

Update this index when:
- A new Knowledge file is added that should be discoverable from the top-level setup.
- The Knowledge structure changes.
- A backup is regenerated.

Per the pre-tool-use hook, **append a maintenance log entry below** for any non-formatting change.

---

## 9. Maintenance Log

| Date | Change | Author |
|------|--------|--------|
| 2026-06-15 | Migrated monolithic runbook into Knowledge Architecture (RAW/Wiki/Frameworks). Rewrote `Setup.md` as thin index. | Claude |
| 2026-06-15 | Fixed adversarial audit blockers: corrected `.claude/settings.json` hook paths (absolute forward slashes), added PowerShell to hook matcher, fixed `pre-tool-use.cjs` single-backslash detection, added hook self-protection guard, added My Rules comment blocks to `session-start.cjs` and `post-tool-use.cjs`, rewrote `environment-setup.md` Section 3 to match real Claude Code settings schema, fixed memory cross-link slugs in Frameworks files, added canonical-entry note. | Claude |
