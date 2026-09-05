// Repository hygiene guard. Runs as part of `npm run check` (so CI enforces
// it) and fails when the index picks up things that do not belong in a
// production repo: stray files in the root, data/backup/archive files,
// scratch scripts, anything large. Scratch belongs in _attic/ (gitignored),
// documents in docs/, real scripts under scripts/ with a proper name.
//
// Added 2026-09-05 after the root had accumulated 22 screenshots, two
// screenshot scripts, a tutorial PDF and 25 stale planning documents.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot }).toString('utf8').split('\0').filter(Boolean);

// The complete list of files allowed directly in the repository root.
const ROOT_ALLOWLIST = new Set([
  '.gitignore', 'package.json', 'package-lock.json', 'render.yaml',
  'README.md', 'CLAUDE.md', 'AGENTS.md', 'ARCHITECTURE.md', 'INCIDENT-RUNBOOKS.md',
  'ADMIN-CHANGE-LOG.md', 'AUTHORIZE-NET-INTEGRATION.md', 'AUTHORIZE-NET-TUTORIAL.md',
  'BULK-PRINT-GUIDE.md', 'PUBLISH-EVENTS-TO-WEBSITE.md', 'STMEC-DNS-RECORDS.md',
]);
// File types that are never source: data, archives, office documents, logs, caches.
const FORBIDDEN_EXT = /\.(db|sqlite3?|zip|7z|rar|tar|gz|log|docx|xlsx|pptx|bak|pyc)$/i;
// Scratch naming that must not be committed under any directory.
const FORBIDDEN_NAME = /(^|\/)(tmp-[^/]*|[^/]*\.tmp|[^/]*\.BACKUP[^/]*|[^/]*\.PREPOKER[^/]*)$/;
const FORBIDDEN_DIR = /^(_attic|backups|tmp|\.codex|server\/uploads|node_modules|dist)\//;
const MAX_FILE_BYTES = 1024 * 1024; // 1 MB - the client logos and screenshots are all well under this

const problems = [];
for (const f of files) {
  if (!f.includes('/') && !ROOT_ALLOWLIST.has(f)) problems.push(`root file not in allowlist: ${f}`);
  if (FORBIDDEN_EXT.test(f)) problems.push(`forbidden file type committed: ${f}`);
  if (FORBIDDEN_NAME.test(f)) problems.push(`scratch/backup naming committed: ${f}`);
  if (FORBIDDEN_DIR.test(f)) problems.push(`file committed under an ignored/scratch directory: ${f}`);
  if (/(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f)) problems.push(`environment file committed: ${f}`);
  const full = path.join(repoRoot, f);
  if (fs.existsSync(full)) {
    const size = fs.statSync(full).size;
    if (size > MAX_FILE_BYTES) problems.push(`file over 1 MB committed: ${f} (${Math.round(size / 1024)} KB)`);
  }
}

if (problems.length) {
  console.error(`Repository hygiene check FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nScratch and artefacts belong in _attic/ (gitignored). Documents go in docs/. See CLAUDE.md "Repository hygiene".');
  process.exit(1);
}
console.log(`Repository hygiene check passed (${files.length} tracked files, root clean).`);
