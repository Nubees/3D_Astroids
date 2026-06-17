# Plan — Isolated HEADROOM Test

**Date:** 2026-06-15  
**Goal:** Safely evaluate HEADROOM by running it in proxy mode in a temporary directory / Python virtual environment, without touching the 3D_Astroids project.

---

## Test Environment

- **Directory:** `C:\Projects\3D_Astroids\.tmp\headroom-test` (temporary, outside git tracking)
- **Python:** 3.12+ (or best available on Windows)
- **Install method:** `python -m venv .venv` then `pip install "headroom-ai[all]"`
- **Run mode:** `headroom proxy --port 8787`
- **Claude Code launch:** `ANTHROPIC_BASE_URL=http://localhost:8787 claude` from the temp directory

---

## What Will Be Tested

1. HEADROOM installs cleanly on Windows.
2. Proxy starts without errors.
3. Claude Code connects through the proxy.
4. Simple tool use still works (Read, Bash, Glob).
5. A representative task (e.g., read a few files, ask for a summary) completes successfully.
6. HEADROOM reports compression stats.
7. No interference with normal Claude Code lifecycle hooks.

---

## Risks and Safeguards

| Risk | Safeguard |
|---|---|
| Pollutes 3D_Astroids repo | Test directory is `.tmp/headroom-test` and added to `.gitignore` if it does not already match |
| Breaks existing Claude Code environment | Use a fresh terminal and temp directory; do not modify global Claude settings |
| Proxy intercepts real API traffic | Use a low-value test session; verify the proxy is bound to `localhost` only |
| Heavy download/install time | Cap install step with a 5-minute timeout and report if it fails |

---

## Expected Artifacts

1. Test transcript saved to `.tmp/headroom-test/headroom-test-report.md`.
2. Summary posted to chat: install status, proxy status, observed token savings (if reported), and a go/no-go recommendation for 3D_Astroids.

---

## Decision Gate

After the test, present the user with:
- **Option A (Go):** Install HEADROOM into 3D_Astroids via proxy mode.
- **Option B (No-Go):** Skip HEADROOM and rely on prompt/context discipline.

---

## Verification

- [ ] `pip install` succeeds.
- [ ] `headroom proxy --port 8787` starts.
- [ ] Claude Code launches through the proxy.
- [ ] Read/Bash/Glob tools work in the test session.
- [ ] HEADROOM reports compression stats.
