import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(repoRoot, 'server', 'migrations', 'postgres');

// These migrations have already been applied in production. Their content is
// immutable; schema changes must be made in a new, numbered migration instead.
const appliedMigrationHashes = {
  '001_initial_schema.sql': '3dea8e59fbc120deec344839e107dc19c7944cf3c96c5b548f8a6f234c5157c0',
  '002_allow_session_package_bookings.sql': '3bb32b0a5e44d3e4450e91526327a0bc15e621a10eb6f31f8c3bc5bcbea86041',
  '002_paper_card_independent_limits.sql': 'c4585bc69369151d33debe4ec27e03e8a93b479943726ef12b756b7f694fb83f',
  '003_phd_credit_package.sql': '0b3dfee139d9c793686a5fd0375aadd3a0ecc2c16c5dbdf8cee2f3f45164fe14',
  '004_remove_test_phd_credits.sql': '5dd7e15872639dd94c15f1c92e25438fe4ce13457a027346511ce43adadc82a0',
  '005_add_live_event_sales_cutoff.sql': '48b9d3cf165e25496286e5309c6f2f66e99fa49e244d0ffcf2d23fe35fdffb7f',
  '006_special_bingo_phd_addon.sql': 'c421d83c02efe9ceda32a25af3f844c5dbaf50acf90d2176f88ec2ba29b55dc4',
  '007_special_bingo_price_defaults.sql': 'd5813116ddaf566a22aac08bef515084921a5eb09a5d14bba0c3f09e13de0476',
  '008_session_event_image_url.sql': '3019d77c5dac2505245fd1307f4653a6df44216ea6208e78daadfc1eeec8357a',
  '009_repair_refund_amounts.sql': '970e7de7bf1b9729bffe09a57ce54d76b19556b5f1eae55384136cd9b12df2be',
  '010_admin_roles_credits_assigned_tickets.sql': '8fb8437c3dbe1c3dbb6ace409abd15197a9513196ddf134ecbf1a421a2d56201',
  '011_session_doors_open_time.sql': 'ac46475cffd904afc7a2cea99ef8bce39101493fc6284a8890f5112fa252307b',
  '012_live_event_ticket_limit.sql': '608fb7a078a4f7c8714e1425a82327158847323a92a3f7ca1e6b2c69b8aaca92',
  '013_checkout_payment_safety.sql': 'b9c8c72363e3bee446f3ac7c385bdfc77cd10416c2c0ca2b5c3012a93cdac477',
  '014_refund_approval_workflow.sql': '8658cf12aec6d05702efde0fdec851115d7ccbd6ff016fe2d51e5b4787eb352d',
};

for (const [filename, expectedHash] of Object.entries(appliedMigrationHashes)) {
  const filepath = path.join(migrationsDir, filename);
  assert.ok(fs.existsSync(filepath), `Applied migration is missing: ${filename}`);
  const normalizedSql = fs.readFileSync(filepath, 'utf8').replace(/\r\n/g, '\n');
  const actualHash = crypto.createHash('sha256').update(normalizedSql).digest('hex');
  assert.equal(
    actualHash,
    expectedHash,
    `${filename} was changed after being applied. Restore it and add a new migration instead.`,
  );
}

console.log(`Migration integrity check passed for ${Object.keys(appliedMigrationHashes).length} applied migration(s).`);
