import { get, run, saveDb } from '../database.js';

export const SALES_REPORT_CUTOFF_KEY = 'sales_report_cutoff_at';

export async function getSalesReportCutoff() {
  const row = await get('SELECT value FROM settings WHERE key = ?', [SALES_REPORT_CUTOFF_KEY]);
  const value = String(row?.value || '').trim();
  return value || null;
}

export async function setSalesReportCutoff(value = new Date().toISOString()) {
  const existing = await get('SELECT key FROM settings WHERE key = ?', [SALES_REPORT_CUTOFF_KEY]);
  if (existing) {
    await run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?", [value, SALES_REPORT_CUTOFF_KEY]);
  } else {
    await run('INSERT INTO settings (key, value) VALUES (?, ?)', [SALES_REPORT_CUTOFF_KEY, value]);
  }
  await saveDb();
  return value;
}

export async function ensureGoLiveSalesReportCutoff() {
  if (await getSalesReportCutoff()) return null;
  return await setSalesReportCutoff();
}
