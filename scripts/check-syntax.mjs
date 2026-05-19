import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const roots = ['server/src', 'scripts'];
const ignoredDirs = new Set(['node_modules', 'dist', '.git']);
const files = [];

function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(fullPath);
      continue;
    }
    if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
}

for (const relativeRoot of roots) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (fs.existsSync(absoluteRoot)) collect(absoluteRoot);
}

let failed = false;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} backend/script file(s).`);
