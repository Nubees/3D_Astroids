# Framework: Code Section Notes ("My Rules")

This framework defines the mandatory comment-block convention for every non-trivial code change in the 3D Astroids project.

Linked memory: [[feedback_code_section_notes]] + [[feedback_my_rules_alias]]

---

## Rule

Between every distinct code section (or after any non-trivial change), insert a detailed comment block that explains the change.

---

## Required fields

```
// ═══ Purpose ═══
// Why this block exists.
//
// ═══ Setup ═══
// What it needs to work.
//
// ═══ Issues ═══
// What was broken before.
//
// ═══ Fix ═══
// What was done and why.
//
// ═══ Gotchas ═══
// Edge cases or traps for future editors.
```

---

## Triviality test

- **Non-trivial:** required debugging, research, or altered a value derived from another system.
- **Trivial:** pure refactor with no logic change (e.g., renaming a variable).

Trivial changes do **not** need a full block, but a one-line comment is still encouraged.

---

## Self-enforcement

Before declaring any task "done":
1. Read back every added comment block from the modified files.
2. Paste each block verbatim into the chat.
3. If more than 3 blocks were added, post a summary message first:
   ```
   Verifying N comment blocks across files: [file1.ts, file2.ts, ...]
   ```

---

## Aliases

"My Rules" and "Rules" both refer to this exact procedure. If the user says "add My Rules" or "follow Rules", they mean this framework.
