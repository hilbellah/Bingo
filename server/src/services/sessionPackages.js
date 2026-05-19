import { get } from '../database.js';

export const DEFAULT_SPECIAL_BINGO_CONFIG = {
  admissionName: 'Special Bingo Admission (includes 1 PHD)',
  admissionPrice: 7500,
  additionalPhdName: 'Additional PHD Unit',
  additionalPhdPrice: 5000,
  additionalPhdMaxQuantity: 1,
};

function normalizePackageName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizePackageDrafts(pkgs = []) {
  return Array.isArray(pkgs)
    ? pkgs
      .map((pkg, index) => ({
        ...pkg,
        name: normalizePackageName(pkg?.name),
        price: Number(pkg?.price || 0),
        type: pkg?.type === 'optional' ? 'optional' : 'required',
        max_quantity: Math.max(1, parseInt(pkg?.max_quantity || 1, 10)),
        sort_order: Number.isFinite(Number(pkg?.sort_order)) ? Number(pkg.sort_order) : index,
        is_phd: pkg?.is_phd ? 1 : 0,
      }))
      .filter(pkg => pkg.name && pkg.price > 0)
    : [];
}

export function validateSpecialEventPackageDrafts(pkgs = []) {
  const normalized = normalizePackageDrafts(pkgs);
  const required = normalized.filter(pkg => pkg.type === 'required');
  const optional = normalized.filter(pkg => pkg.type === 'optional');

  if (required.length !== 1) {
    return { ok: false, error: 'Special bingo requires exactly one per-person admission package with a price.' };
  }

  if (!required[0].is_phd) {
    return { ok: false, error: 'Special bingo admission must include 1 PHD unit.' };
  }

  const nonPhdOptional = optional.filter(pkg => !pkg.is_phd);
  if (nonPhdOptional.length > 0) {
    return { ok: false, error: 'Special bingo optional add-ons are limited to PHD units.' };
  }

  const phdOptional = optional.filter(pkg => pkg.is_phd);
  if (phdOptional.length > 1) {
    return { ok: false, error: 'Special bingo can only have one PHD add-on package.' };
  }

  return { ok: true, packages: normalized };
}

export function getSpecialBingoConfig() {
  const row = get("SELECT value FROM settings WHERE key = 'special_bingo_config'");
  if (!row) return DEFAULT_SPECIAL_BINGO_CONFIG;
  try {
    return { ...DEFAULT_SPECIAL_BINGO_CONFIG, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_SPECIAL_BINGO_CONFIG;
  }
}

export function getDefaultSpecialBingoPackages() {
  const config = getSpecialBingoConfig();
  return [
    {
      name: config.admissionName,
      price: Number(config.admissionPrice || DEFAULT_SPECIAL_BINGO_CONFIG.admissionPrice),
      type: 'required',
      max_quantity: 1,
      sort_order: 0,
      is_phd: true,
    },
    {
      name: config.additionalPhdName,
      price: Number(config.additionalPhdPrice || 0),
      type: 'optional',
      max_quantity: Math.max(1, parseInt(config.additionalPhdMaxQuantity || DEFAULT_SPECIAL_BINGO_CONFIG.additionalPhdMaxQuantity, 10)),
      sort_order: 1,
      is_phd: true,
    },
  ];
}

export function normalizeSessionType(value, isSpecialEvent = false) {
  if (value === 'event') return 'event';
  if (value === 'special_bingo' || isSpecialEvent) return 'special_bingo';
  return 'regular_bingo';
}

export function sessionTypeSql(alias = 's') {
  return `COALESCE(NULLIF(${alias}.session_type, ''), CASE WHEN ${alias}.is_special_event = 1 THEN 'special_bingo' ELSE 'regular_bingo' END)`;
}

export function validateEventPackageDrafts(pkgs = []) {
  const normalized = normalizePackageDrafts(pkgs);
  const required = normalized.filter(pkg => pkg.type === 'required');
  const optional = normalized.filter(pkg => pkg.type === 'optional');

  if (required.length !== 1) {
    return { ok: false, error: 'Live Event / Venue requires exactly one per-person admission package with a price.' };
  }

  if (optional.length > 0) {
    return { ok: false, error: 'Live Event / Venue does not allow add-ons.' };
  }

  return { ok: true, packages: normalized };
}

export function validateSessionPackagesForType(sessionType, pkgs = []) {
  if (sessionType === 'event') return validateEventPackageDrafts(pkgs);
  if (sessionType === 'special_bingo') return validateSpecialEventPackageDrafts(pkgs);
  return { ok: true, packages: normalizePackageDrafts(pkgs) };
}
