import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wolastoq-anet-webhook-'));
const dbPath = path.join(tmpDir, 'bingo.db');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = dbPath;
process.env.SKIP_LEGACY_DB_COPY = '1';
process.env.SKIP_RENDER_DISK_CHECK = '1';
process.env.RATE_LIMIT_GENERAL = '1';
process.env.RATE_LIMIT_WEBHOOK = '1';

const appUrl = pathToFileURL(path.join(repoRoot, 'server/src/index.js'));
const { app } = await import(appUrl);

const listener = await new Promise(resolve => {
  const server = app.listen(0, '127.0.0.1', () => resolve(server));
});
const baseUrl = `http://127.0.0.1:${listener.address().port}`;

async function postWebhook(body) {
  return fetch(`${baseUrl}/api/webhooks/authorize-net`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

try {
  for (let i = 0; i < 3; i += 1) {
    const response = await postWebhook({
      eventType: 'net.authorize.payment.authcapture.created',
      notificationId: `ack-check-${i}`,
      payload: {},
    });

    assert.equal(response.status, 200);
  }

  console.log('Authorize.Net webhook acknowledgement check passed.');
} finally {
  await new Promise(resolve => listener.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
