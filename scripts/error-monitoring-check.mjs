import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// In-house error monitoring: browser reports and server errors are cleaned,
// grouped, listed for admins, resolvable, and emailed once in a digest.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-error-monitoring-'));

process.env.NODE_ENV = 'test';
process.env.ERROR_MONITORING = 'on';
process.env.DATABASE_URL = path.join(tmpDir, 'bingo.db');
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.ADMIN_USERNAME = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'password123';

const { prepareTestDatabase } = await import(pathToFileURL(path.join(repoRoot, 'scripts/lib/test-db.mjs')));
const { getDb, all, run } = await import(pathToFileURL(path.join(repoRoot, 'server/src/database.js')));
const monitor = await import(pathToFileURL(path.join(repoRoot, 'server/src/services/errorMonitor.js')));

await prepareTestDatabase();
await getDb();

const { app } = await import(pathToFileURL(path.join(repoRoot, 'server/src/index.js')));
const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;
const admin = { Authorization: `Basic ${Buffer.from('admin@example.com:password123').toString('base64')}` };
const settle = () => new Promise(resolve => setTimeout(resolve, 150));
const rows = () => all('SELECT * FROM error_events ORDER BY first_seen_at');

const report = body => fetch(`${baseUrl}/api/client-errors`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'CheckBrowser/1.0' },
  body: JSON.stringify(body),
});

try {
  // --- A browser report is accepted, cleaned and stored -----------------
  const res = await report({
    message: 'TypeError: cannot read total of undefined for buyer@example.com card 4111 1111 1111 1111',
    stack: 'TypeError: x\n    at render (https://booking.example/assets/App-1.js:10:20)',
    page: 'https://booking.wolastoqcasino.ca/tickets/BNG-1?ticketAccessToken=SECRET123&x=1',
  });
  assert.equal(res.status, 204);
  await settle();
  let stored = await rows();
  assert.equal(stored.length, 1);
  const first = stored[0];
  assert.equal(first.source, 'client');
  assert.ok(!first.message.includes('buyer@example.com'), 'email redacted');
  assert.ok(!first.message.includes('4111'), 'card number redacted');
  assert.ok(first.message.includes('[email]') && first.message.includes('[number]'));
  assert.equal(first.page, '/tickets/BNG-1', 'query string (with its token) is never stored');
  assert.equal(first.user_agent, 'CheckBrowser/1.0');
  assert.equal(Number(first.occurrences), 1);

  // --- The same error again groups onto the same row (after the throttle) -
  monitor.resetErrorMonitorThrottleForTests();
  await report({ message: 'TypeError: cannot read total of undefined for other@example.com card 5555 5555 5555 4444', stack: 'TypeError: x\n    at render (https://booking.example/assets/App-1.js:11:5)', page: '/' });
  await settle();
  stored = await rows();
  assert.equal(stored.length, 1, 'repeats group by fingerprint');
  assert.equal(Number(stored[0].occurrences), 2);

  // --- Floods are throttled -------------------------------------------
  for (let i = 0; i < 5; i += 1) await report({ message: 'Flood error', page: '/' });
  await settle();
  const flood = (await rows()).find(r => r.message === 'Flood error');
  assert.equal(Number(flood.occurrences), 1, 'identical errors within 5s are written once');

  // --- Junk is ignored, never a 500 -----------------------------------
  assert.equal((await report({ message: '' })).status, 204);
  // Non-object JSON is refused by the existing body parser (strict mode) before the route.
  assert.equal((await fetch(`${baseUrl}/api/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '"just a string"' })).status, 400);

  // --- Server errors written to the log are captured -------------------
  monitor.installServerErrorCapture();
  const quiet = console.log;
  console.error(new Error('Database timeout while loading sessions for token=abc123'));
  console.log = quiet;
  await settle();
  const serverRow = (await rows()).find(r => r.source === 'server');
  assert.ok(serverRow, 'console.error is mirrored');
  assert.ok(serverRow.message.includes('token=[redacted]'));

  // --- Admins can list and resolve ------------------------------------
  const listRes = await fetch(`${baseUrl}/api/admin/errors`, { headers: admin });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.length, 3);
  assert.ok(list.every(item => item.resolvedAt === null));
  assert.equal((await fetch(`${baseUrl}/api/admin/errors`)).status, 401, 'error list needs an admin login');

  const target = list.find(item => item.message.startsWith('TypeError'));
  const resolveRes = await fetch(`${baseUrl}/api/admin/errors/${target.id}/resolve`, { method: 'POST', headers: admin });
  assert.equal(resolveRes.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/errors/${target.id}/resolve`, { method: 'POST', headers: admin })).status, 404, 'resolving twice is a no-op');
  const open = await (await fetch(`${baseUrl}/api/admin/errors`, { headers: admin })).json();
  assert.equal(open.length, 2);
  const everything = await (await fetch(`${baseUrl}/api/admin/errors?status=all`, { headers: admin })).json();
  assert.equal(everything.length, 3);
  const audit = await all("SELECT * FROM audit_log WHERE action = 'error_resolved'");
  assert.equal(audit.length, 1);

  // --- Digest: emails each open error once ----------------------------
  const sent = [];
  const fakeSend = async ({ groups }) => { sent.push(groups); return { ok: true }; };
  const firstDigest = await monitor.sendErrorDigest({ send: fakeSend });
  assert.equal(firstDigest.sent, true);
  assert.equal(firstDigest.count, 2);
  const secondDigest = await monitor.sendErrorDigest({ send: fakeSend });
  assert.equal(secondDigest.sent, false, 'nothing new, no second email');
  assert.equal(sent.length, 1);

  // A failed send leaves errors un-notified so the next digest retries.
  monitor.resetErrorMonitorThrottleForTests();
  await report({ message: 'Brand new failure', page: '/admin/dashboard' });
  await settle();
  const failed = await monitor.sendErrorDigest({ send: async () => ({ ok: false, error: 'down' }) });
  assert.equal(failed.sent, false);
  const retried = await monitor.sendErrorDigest({ send: fakeSend });
  assert.equal(retried.count, 1);

  // --- A resolved error that happens again reopens and re-alerts --------
  monitor.resetErrorMonitorThrottleForTests();
  await report({ message: 'TypeError: cannot read total of undefined for x@example.com card 4000 0000 0000 0002', stack: 'TypeError: x\n    at render (https://booking.example/assets/App-1.js:1:1)', page: '/' });
  await settle();
  const reopened = (await rows()).find(r => r.id === target.id);
  assert.equal(reopened.resolved_at, null);
  assert.equal(reopened.notified_at, null);
  assert.equal(Number(reopened.occurrences), 3);
  const again = await monitor.sendErrorDigest({ send: fakeSend });
  assert.equal(again.count, 1);

  // --- Monitoring off records nothing ---------------------------------
  process.env.ERROR_MONITORING = 'off';
  monitor.resetErrorMonitorThrottleForTests();
  const before = (await rows()).length;
  await report({ message: 'Should not be stored', page: '/' });
  await settle();
  assert.equal((await rows()).length, before);

  console.log('Error monitoring check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
