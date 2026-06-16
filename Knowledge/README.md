# Knowledge Architecture

This project uses a three-layer knowledge system inspired by the Karpathy Method workflow. Each layer has a distinct owner, update cadence, and trust level.

## Layers

| Layer | Path | Owner | Purpose | Mutability |
|-------|------|-------|---------|------------|
| **RAW** | `Knowledge/RAW/` | Austin | Immutable source material — Austin ingests, never gets edited | Never edited by Claude |
| **Wiki** | `Knowledge/Wiki/` | Claude | Claude generated synthesis and Claude maintained | Claude maintains |
| **Frameworks** | `Knowledge/Frameworks/` | Austin + Claude | Actionable guides | Collaborative |

## Rules

1. **RAW is immutable.** Claude reads it but never writes to it. If a RAW source is wrong, add a correction note in `Wiki/` rather than editing the original.
2. **Wiki is the searchable index.** When Claude needs context, it should read `Wiki/` first, then fall back to `RAW/` only if the synthesis is insufficient.
3. **Frameworks are executable conventions.** Every framework should be actionable: "When X happens, do Y." If it is not actionable, it belongs in `Wiki/`.
4. **Cross-link liberally.** Wiki entries link to RAW files; Frameworks link to Wiki entries and memory files.
5. **Keep Git-friendly.** RAW files may be binary or large; use `.gitattributes` and `.gitignore` as needed.
