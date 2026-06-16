#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const hasNodeModules = fs.existsSync(path.join(root, 'node_modules'));

const messages = [];

messages.push({
  type: 'text',
  content: '3D Astroids project loaded.'
});

if (!hasNodeModules) {
  messages.push({
    type: 'text',
    content: 'node_modules not found. Run the install command for your chosen stack before building.'
  });
}

messages.push({
  type: 'text',
  content: '🛡️ Auto-save active: memory save + recap every 50 minutes.'
});

process.stdout.write(JSON.stringify({
  updatedContext: messages.map(m => m.content).join('\n')
}));
