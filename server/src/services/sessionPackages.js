import { get } from '../database.js';

export const DEFAULT_SPECIAL_BINGO_CONFIG = {
  admissionName: 'Special Bingo Admission',
  admissionPrice: 7500,
  additionalPhdName: 'PHD Unit',
  additionalPhdPrice: 5000,
  additionalPhdMaxQuantity: 1,
};

export const DEFAULT_BOOKING_CONFIG = {
  maxOptionalPackagesPerPlayer: 3,
};

export const PHD_CREDIT_PACKAGE_ID = 'pkg-regular-optional-phd-credit';

export const REGULAR_BINGO_PACKAGE_DEFINITIONS = [
  { id: 'pkg-regular-required-9-up', name: '9 up', price: 3000, type: 'required', max_quantity: 1, sort_order: 0, is_phd: 0, description: 'Main admission book included for each player.' },
  { id: 'pkg-regular-required-toonie-ball', name: 'Toonie Ball', price: 200, type: 'required', max_quantity: 1, sort_order: 1, is_phd: 0, description: 'Required Toonie Ball entry for each player.' },
  { id: 'pkg-regular-optional-9-up', name: '9 up', price: 3000, type: 'optional', max_quantity: 2, sort_order: 10, is_phd: 0, description: 'Additional 9-up paper package.' },
  { id: 'pkg-regular-optional-6-up', name: '6 up', price: 2000, type: 'optional', max_quantity: 3, sort_order: 11, is_phd: 0, description: 'Additional 6-up paper package.' },
  { id: 'pkg-regular-optional-3-up', name: '3 up', price: 1000, type: 'optional', max_quantity: 3, sort_order: 12, is_phd: 0, description: 'Additional 3-up paper package.' },
  { id: 'pkg-regular-optional-mp-early-bird', name: 'MP Early Bird', price: 500, type: 'optional', max_quantity: 6, sort_order: 13, is_phd: 0, description: 'Extra early bird package.' },
  { id: 'pkg-regular-optional-phd-1', name: 'PHD #1', price: 3000, type: 'optional', max_quantity: 2, sort_order: 20, is_phd: 1, description: 'Handheld device package level 1.' },
  { id: 'pkg-regular-optional-phd-2', name: 'PHD #2', price: 3500, type: 'optional', max_quantity: 2, sort_order: 21, is_phd: 1, description: 'Handheld device package level 2.' },
  { id: 'pkg-regular-optional-phd-3', name: 'PHD #3', price: 4000, type: 'optional', max_quantity: 2, sort_order: 22, is_phd: 1, description: 'Handheld device package level 3.' },
  { id: 'pkg-regular-optional-phd-4', name: 'PHD #4', price: 5000, type: 'optional', max_quantity: 2, sort_order: 23, is_phd: 1, description: 'Handheld device package level 4.' },
  { id: 'pkg-regular-optional-phd-5', name: 'PHD #5', price: 6000, type: 'optional', max_quantity: 2, sort_order: 24, is_phd: 1, description: 'Handheld device package level 5.' },
  { id: 'pkg-regular-optional-phd-6', name: 'PHD #6', price: 8000, type: 'optional', max_quantity: 2, sort_order: 25, is_phd: 1, description: 'Handheld device package level 6.' },
  { id: PHD_CREDIT_PACKAGE_ID, name: '$1 Credit', price: 100, type: 'optional', max_quantity: 50, sort_order: 26, is_phd: 0, description: 'PHD credit. Available only when this player purchases a PHD package.' },
];

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
        description: String(pkg?.description || '').trim(),
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

  if (required[0].is_phd) {
    return { ok: false, error: 'Special bingo admission does not include a PHD unit. Add the PHD unit as an optional add-on.' };
  }

  const nonPhdOptional = optional.filter(pkg => !pkg.is_phd);
  if (nonPhdOptional.length > 0) {
    return { ok: false, error: 'Special bingo optional add-ons are limited to PHD units.' };
  }

  const phdOptional = optional.filter(pkg => pkg.is_phd);
  if (phdOptional.length !== 1) {
    return { ok: false, error: 'Special bingo requires one optional PHD unit add-on.' };
  }

  if (phdOptional[0].max_quantity !== 1) {
    return { ok: false, error: 'Special bingo PHD add-on quantity must be 1 per player.' };
  }

  return { ok: true, packages: normalized };
}

export async function getSpecialBingoConfig() {
  const row = await get("SELECT value FROM settings WHERE key = 'special_bingo_config'");
  if (!row) return DEFAULT_SPECIAL_BINGO_CONFIG;
  try {
    const parsed = { ...DEFAULT_SPECIAL_BINGO_CONFIG, ...JSON.parse(row.value) };
    return {
      ...parsed,
      admissionName: String(parsed.admissionName || DEFAULT_SPECIAL_BINGO_CONFIG.admissionName)
        .replace(/\s*\(includes 1 PHD\)\s*/i, '')
        .trim(),
      additionalPhdName: String(parsed.additionalPhdName || DEFAULT_SPECIAL_BINGO_CONFIG.additionalPhdName)
        .replace(/^Additional\s+/i, '')
        .trim(),
      additionalPhdMaxQuantity: 1,
    };
  } catch {
    return DEFAULT_SPECIAL_BINGO_CONFIG;
  }
}

export function normalizeBookingConfig(rawConfig = {}) {
  const maxOptionalPackagesPerPlayer = Number(rawConfig?.maxOptionalPackagesPerPlayer);
  return {
    maxOptionalPackagesPerPlayer: Number.isFinite(maxOptionalPackagesPerPlayer) && maxOptionalPackagesPerPlayer >= 0
      ? Math.floor(maxOptionalPackagesPerPlayer)
      : DEFAULT_BOOKING_CONFIG.maxOptionalPackagesPerPlayer,
  };
}

export async function getBookingConfig() {
  const row = await get("SELECT value FROM settings WHERE key = 'booking_config'");
  if (!row) return { ...DEFAULT_BOOKING_CONFIG };
  try {
    return normalizeBookingConfig(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_BOOKING_CONFIG };
  }
}

export async function getDefaultSpecialBingoPackages() {
  const config = await getSpecialBingoConfig();
  return [
    {
      name: config.admissionName,
      price: Number(config.admissionPrice || DEFAULT_SPECIAL_BINGO_CONFIG.admissionPrice),
      type: 'required',
      max_quantity: 1,
      sort_order: 0,
      is_phd: false,
    },
    {
      name: config.additionalPhdName,
      price: Number(config.additionalPhdPrice || 0),
      type: 'optional',
      max_quantity: 1,
      sort_order: 1,
      is_phd: true,
      description: 'Handheld device for special bingo.',
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

export function getSessionConflictGroup(sessionType) {
  return sessionType === 'event' ? 'event' : 'bingo';
}

export function sessionConflictGroupSql(alias = 's') {
  return `CASE WHEN ${sessionTypeSql(alias)} = 'event' THEN 'event' ELSE 'bingo' END`;
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
