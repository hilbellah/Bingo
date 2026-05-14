import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-smoke-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';

const { migrate } = await import(pathToFileURL(path.join(repoRoot, 'server/src/migrate.js')));
const { getDb, all } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  await migrate();
  await getDb();

  const packages = all('SELECT name, type, is_active, is_phd FROM packages ORDER BY sort_order, name');
  const activeRequired = packages.filter(pkg => pkg.type === 'required' && pkg.is_active === 1);
  const activePhd = packages.filter(pkg => pkg.is_phd === 1 && pkg.is_active === 1);
  const activeOptional = packages.filter(pkg => pkg.type === 'optional' && pkg.is_active === 1);

  assert(packages.length >= 9, `expected baseline packages, found ${packages.length}`);
  assert(activeRequired.length >= 1, 'expected at least one active required package');
  assert(activeOptional.length >= 1, 'expected at least one active optional package');
  assert(activePhd.length >= 1, 'expected at least one active PHD package');

  console.log('Smoke check passed:', {
    packageCount: packages.length,
    activeRequired: activeRequired.length,
    activeOptional: activeOptional.length,
    activePhd: activePhd.map(pkg => pkg.name),
  });
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
