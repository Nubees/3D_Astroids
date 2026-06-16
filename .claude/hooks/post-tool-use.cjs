#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const projectRoot = path.resolve(__dirname, '..', '..');
const logDir = path.join(projectRoot, '.remember', 'logs');
const logFile = path.join(logDir, 'hook-errors.log');

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '');
  }
} catch (err) {
  // silently continue to avoid infinite hook error loops
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  try {
    const event = JSON.parse(line);
    const tool = event?.tool || '';
    const error = event?.error || event?.result?.error;

    if (error) {
      const timestamp = new Date().toISOString();
      const entry = `[${timestamp}] Tool: ${tool} | Error: ${JSON.stringify(error)}\n`;
      try {
        fs.appendFileSync(logFile, entry);
      } catch (e) {
        // Silent fail to avoid hook loops
      }
    }

    process.stdout.write(JSON.stringify({}));
    rl.close();
  } catch (err) {
    process.stdout.write(JSON.stringify({}));
    rl.close();
  }
});
