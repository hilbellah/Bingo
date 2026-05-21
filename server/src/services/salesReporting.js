import { get, run, saveDb } from '../database.js';

export const SALES_REPORT_CUTOFF_KEY = 'sales_report_cutoff_at';

export function getSalesReportCutoff() {
  const row = get('SELECT value FROM settings WHERE key = ?', [SALES_REPORT_CUTOFF_KEY]);
  const value = String(row?.value || '').trim();
  return value || null;
}

export function setSalesReportCutoff(value = new Date().toISOString()) {
  const existing = get('SELECT key FROM settings WHERE key = ?', [SALES_REPORT_CUTOFF_KEY]);
  if (existing) {
    run("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?", [value, SALES_REPORT_CUTOFF_KEY]);
  } else {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', [SALES_REPORT_CUTOFF_KEY, value]);
  }
  saveDb();
  return value;
}

export function ensureGoLiveSalesReportCutoff() {
  if (getSalesReportCutoff()) return null;
  return setSalesReportCutoff();
}
