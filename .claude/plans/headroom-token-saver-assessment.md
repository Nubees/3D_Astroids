# Plan — Assess HEADROOM Token Saver

**Date:** 2026-06-15  
**Goal:** Research `chopratejas/headroom`, evaluate whether it can be integrated safely with this Claude Code project, and present a go/no-go recommendation.

---

## What HEADROOM Is

HEADROOM is a context-optimization layer that sits between an AI agent (Claude Code, Cursor, Codex, Aider) and the LLM provider. It compresses tool outputs, logs, files, and RAG chunks before they reach the model, claiming **60–95% token savings** with preserved answer quality.

**Repository:** https://github.com/chopratejas/headroom  
**Docs:** https://chopratejas.github.io/headroom/  
**Quickstart:** https://github.com/chopratejas/headroom/blob/main/docs/quickstart.md  
**MCP docs:** https://github.com/chopratejas/headroom/blob/main/docs/content/docs/mcp.mdx  
**Integration guide:** https://github.com/chopratejas/headroom/blob/main/docs/integration-guide.md

---

## Integration Modes for Claude Code

| Mode | How It Works | Touch Production Files? | Risk Level |
|---|---|---|---|
| **Proxy** | `headroom proxy --port 8787`, then `ANTHROPIC_BASE_URL=http://localhost:8787 claude` | No code changes | Low-Medium |
| **MCP server** | `headroom mcp install`, adds `headroom_compress`, `headroom_retrieve`, `headroom_stats` tools | Adds MCP config | Medium |
| **Wrap command** | `headroom wrap claude` | Wraps the Claude process | Medium |
| **Library** | Direct `compress()` calls in code | Requires code edits | High (not relevant for us) |

---

## Potential Benefits

1. **Token cost reduction** — 60–95% fewer tokens on large outputs (search results, logs, long files).
2. **Faster responses** — less context to process upstream.
3. **Local caching** — originals are cached, model can request them back.
4. **Reversible compression** — original content is recoverable.
5. **Multiple algorithms** — SmartCrusher for JSON, AST-aware CodeCompressor, prose model, image modules.

---

## Risks and Concerns

1. **Man-in-the-middle to the LLM provider.** The proxy mode intercepts all Claude Code ↔ Anthropic traffic. This is a significant trust decision.
2. **External asset downloads.** Runtime may fetch ONNX Runtime and a HuggingFace model. Could fail offline or behind corporate firewalls.
3. **SSL/corporate MITM errors.** README explicitly warns about `CERTIFICATE_VERIFY_FAILED` in corporate environments with SSL inspection.
4. **Relatively new third-party project.** Unknown long-term maintenance, bug stability, or Claude Code compatibility.
5. **Could break hooks/skills/MCP/tool-use.** Anything that changes how Claude Code sends/receives tool output or context could conflict with this project's `.claude/hooks`, skills, agents, or MCP setup.
6. **Windows compatibility.** The repo mentions Rust/maturin builds; Windows support should be verified before installation.
7. **No free lunch.** Heavy compression of code context could theoretically strip nuances needed for debugging or precise edits.

---

## Proposed Safe Evaluation Path

1. **Do not install into this project yet.**
2. Install HEADROOM in a **separate, throwaway test project** or a Python virtual environment.
3. Run it in **proxy mode** against a short, low-stakes Claude Code session.
4. Verify that:
   - Claude Code still starts and responds normally.
   - Tool use (Read, Edit, Bash) still works.
   - This project’s hooks (`session-start`, `pre-tool-use`, `post-tool-use`) still fire.
   - The status line and auto-save cron still behave.
   - Token usage actually drops for representative tasks.
5. If the test passes, propose integration via proxy mode (lowest risk) or MCP mode (more explicit control).

---

## Initial Recommendation

**Defer installation until after a safe test run.** The token savings are attractive, but placing a third-party proxy between Claude Code and Anthropic is a non-trivial trust and stability decision. A short, isolated test will tell us whether the benefits materialize without breaking the project environment.

---

## Verification

- [ ] Research completed and documented.
- [ ] User receives the assessment and decides whether to run the isolated test.
