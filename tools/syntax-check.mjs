#!/usr/bin/env node
/* Syntax-checks the inlined game script exactly as the browser will parse it.
 *
 * The game ships as one inline <script id="game-main"> block inside a classic
 * (non-module) script tag, so we parse it as a classic script via vm.Script —
 * that is the same grammar the browser applies, and it catches the duplicate
 * bindings and malformed destructuring that a plain file check can miss.
 *
 * Pure Node on purpose: the deploy path must not depend on python3 being
 * present on the host image.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const file = process.argv[2] || 'double-game.html';
const abs = path.isAbsolute(file) ? file : path.join(root, file);

const html = fs.readFileSync(abs, 'utf8');
const m = html.match(/<script id="game-main">([\s\S]*?)<\/script>/);
if (!m) {
  console.error(`syntax-check: could not locate the game-main script block in ${file}`);
  process.exit(1);
}

try {
  new vm.Script(m[1], { filename: 'game-main (inline)' });
  const lines = m[1].split('\n').length;
  console.log(`syntax-check: OK — game-main parses as a classic script (${lines} lines)`);
} catch (err) {
  console.error(`syntax-check: FAILED in ${file}`);
  console.error(err.message);
  process.exit(1);
}
