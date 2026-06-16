#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const hasNodeModules = fs.existsSync(path.join(root, 'node_modules'));

const messages = [];

// ═══════════════════════════════════════════════════════════════════════════
// My Rules — Session-Start Hook
// ═══════════════════════════════════════════════════════════════════════════
// Purpose:
//   Greet the user when a new Claude Code session starts in this project and
//   surface quick reminders about the local environment and auto-save policy.
//
// Setup:
//   - Lives at .claude/hooks/session-start.cjs
//   - Wired in .claude/settings.json under SessionStart
//   - Reads no stdin; writes a JSON context update to stdout
//
// Issues:
//   - The original version warned about missing node_modules immediately on
//     every session, which felt premature because the project stack is still TBD
//     and no install step has been defined yet.
//   - The file lacked a My Rules comment block documenting its behavior.
//
// Fix:
//   - Reworded the node_modules reminder as a conditional, stack-agnostic hint
//     rather than an error-style warning.
//   - Added this explanatory block per the Code Section Notes convention.
//
// Gotchas:
//   - This hook runs before the first user turn; keep it fast and avoid spawning
//     subprocesses.
//   - Messages appear in the model's context, not the terminal UI.
// ═══════════════════════════════════════════════════════════════════════════

messages.push({
  type: 'text',
  content: '3D Astroids project loaded.'
});

if (!hasNodeModules) {
  messages.push({
    type: 'text',
    content: 'No node_modules detected. Once you choose a stack, run its install command before building.'
  });
}

messages.push({
  type: 'text',
  content: '🛡️ Auto-save active: memory save + recap every 50 minutes.'
});

process.stdout.write(JSON.stringify({
  updatedContext: messages.map(m => m.content).join('\n')
}));
