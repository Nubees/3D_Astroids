# Framework: Auto-Save + Recap

This framework defines the 50-minute memory-save cycle that is mandatory for the 3D Astroids project.

Linked memory: [[project_autosave_system]]

---

## When it runs

A session-only cron job fires every 50 minutes. Do not disable it or skip a cycle without explicit user approval.

---

## Procedure

When the cron fires, do exactly the following:

1. **Check state.** Determine if the agent is "busy". Busy means an unresolved tool call is in flight, or the agent is actively generating a response to a user message. Empty idle time is **never** busy.
2. **Announce.** Post exactly:
   ```
   🔄 Memory save is now taking place…
   ```
3. **Persist.** Write all new or updated memories to `C:\Users\<YourUser>\.claude\projects\C--Projects-3D-Astroids\memory\`.
4. **Empty-cycle mandate.** Even if no memories changed, touch the newest `.md` file in the memory directory so the status bar timestamp (`💾 HH:MM`) updates.
5. **Recap.** Summarize the last 50-minute block. Required fields:
   - (a) files modified
   - (b) decisions made
   - (c) blockers encountered
   - (d) next immediate step
6. **Confirm.** Post exactly:
   ```
   ✅ Memory save complete. Recap delivered.
   ```

---

## How to touch the newest memory file on Windows

Use PowerShell:

```powershell
$dir = 'C:/Users/<YourUser>/.claude/projects/C--Projects-3D-Astroids/memory'
$newest = Get-ChildItem $dir -Filter '*.md' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($newest) { $newest.LastWriteTime = Get-Date }
```

---

## Why

Keeps project context durable across crashes, restarts, and long sessions. The status line gives the user immediate feedback that memory is fresh.
