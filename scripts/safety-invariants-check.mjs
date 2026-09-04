import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const routeFiles = fs.readdirSync(path.join(repoRoot, 'server', 'src', 'routes'))
  .filter(name => name.endsWith('.js'))
  .map(name => ({ name, source: read(path.join('server', 'src', 'routes', name)) }));

function filesContaining(fragment) {
  return routeFiles.filter(file => file.source.includes(fragment)).map(file => file.name);
}

assert.deepEqual(
  filesContaining("app.post('/api/admin/bookings/:id/refund'"),
  ['adminRefundApprovalRoutes.js'],
  'The real full-booking refund route must exist only in the approval workflow.',
);
assert.deepEqual(
  filesContaining("app.post('/api/admin/booking-items/:id/refund'"),
  ['adminRefundApprovalRoutes.js'],
  'The real ticket refund route must exist only in the approval workflow.',
);

const adminBookingRoutes = read('server/src/routes/adminBookingRoutes.js');
assert.equal(adminBookingRoutes.includes("from '../services/payments.js'"), false, 'Admin booking routes must never call the gateway directly.');
assert.match(adminBookingRoutes, /bulk_cleanup_disabled/, 'The destructive bulk cleanup route must remain disabled.');
assert.match(adminBookingRoutes, /requireSuperUser, async \(req, res\) => \{\s*try \{\s*const identifier = req\.params\.id/s, 'Booking deletion must remain super-user-only.');

const dashboard = read('client/src/admin/AdminDashboard.jsx');
const bookingsTab = read('client/src/admin/BookingsTab.jsx');
assert.equal(dashboard.includes('handleClearTestBookings'), false, 'The destructive bulk cleanup control must not return to the dashboard.');
assert.equal(bookingsTab.includes('Go-Live Cleanup'), false, 'The destructive bulk cleanup button must not return.');

// Postgres lower-cases unquoted column aliases. An unquoted camelCase alias
// silently renames the JSON key in production (isMyHold -> ismyhold), which
// on 2026-09-04 made every live-event checkout drop its own seat hold. Every
// camelCase alias in server SQL must be double-quoted.
const serverDir = path.join(repoRoot, 'server', 'src');
const sqlFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) sqlFiles.push(full);
  }
})(serverDir);
const unquotedCamelAlias = /\b[Aa][Ss]\s+([a-z]+[A-Z][A-Za-z0-9]*)\b(?=\s*[,\n)]|\s+FROM\b)/g;
for (const file of sqlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const codeOnly = source.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
  const matches = [...codeOnly.matchAll(unquotedCamelAlias)].map(m => m[1]);
  assert.deepEqual(matches, [], `${path.relative(repoRoot, file)} has unquoted camelCase SQL alias(es): ${matches.join(', ')}. Quote them: AS "aliasName".`);
}
assert.match(read('server/src/index.js'), /AS "isMyHold"/, 'The seat map must return isMyHold with its case preserved on Postgres.');

// The Postgres adapter rewrites every `?` to a positional `$n`, including one
// inside a quoted SQL literal, which would silently corrupt the query on
// production only. Flag any `'...?...'` literal inside a SQL-looking string.
// A SQL string literal is a single-quoted segment INSIDE the JS string. When
// the JS string is backtick- or double-quoted the literal appears as '...';
// when the JS string is single-quoted it appears escaped as \'...\'.
function hasQuestionMarkInsideSqlLiteral(line) {
  // Walk the literals in order so the gap between two literals ('a' ... 'b')
  // is never mistaken for a literal itself.
  const jsStrings = [...line.matchAll(/`[^`]*`|"[^"]*"/g)].map(m => m[0]);
  for (const segment of jsStrings) {
    for (const literal of segment.matchAll(/'([^']*)'/g)) {
      if (literal[1].includes('?')) return true;
    }
  }
  for (const literal of line.matchAll(/\\'([^'\\]*)\\'/g)) {
    if (literal[1].includes('?')) return true;
  }
  return false;
}
for (const file of sqlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const suspects = source.split('\n')
    .map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|LIKE)\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
    .filter(({ line }) => hasQuestionMarkInsideSqlLiteral(line));
  assert.deepEqual(
    suspects.map(({ number }) => number),
    [],
    `${path.relative(repoRoot, file)} has a literal ? inside a quoted SQL string on line(s) ${suspects.map(s => s.number).join(', ')} — the Postgres placeholder translator would corrupt it.`
  );
}

const seatRoutes = read('server/src/routes/seatRoutes.js');
assert.match(seatRoutes, /WHERE id = \? AND status = 'held' AND held_by = \?/, 'Seat unlock must remain conditional on current held state and holder.');

console.log('Safety invariant check passed.');
