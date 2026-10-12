// Pure helpers and defaults used by the admin dashboard. No React, no API
// calls - kept separate so they can be unit tested.
import { formatDateShort, formatTime } from '../utils/formatters';

// Shared field for actions the server only accepts with a written reason.
export const reasonField = label => ({ name: 'reason', label, type: 'textarea', required: true, minLength: 3 });

export function formatPrice(cents) {
  return 'CA$' + (cents / 100).toFixed(2);
}

export function packageSummary(packages = []) {
  return packages
    .filter(pkg => pkg?.name)
    .map(pkg => `${pkg.name} (${formatPrice(pkg.price || 0)})`)
    .join(', ');
}

export function splitSalesCutoffAt(value, fallbackDate = '', fallbackTime = '12:00') {
  const text = String(value || '').trim();
  if (text.length >= 16) {
    return { date: text.slice(0, 10), time: text.slice(11, 16) };
  }
  return { date: fallbackDate || '', time: fallbackTime || '12:00' };
}

export function buildSalesCutoffAt(date, time) {
  return date && time ? `${date}T${time}` : null;
}

export function formatSalesCutoff(value, fallbackTime = '') {
  const split = splitSalesCutoffAt(value, '', fallbackTime || '12:00');
  return split.date ? `${formatDateShort(split.date)} at ${formatTime(split.time)}` : formatTime(split.time);
}

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

export function normalizeSpecialBingoConfig(config = {}) {
  const resolved = { ...DEFAULT_SPECIAL_BINGO_CONFIG, ...(config || {}) };
  return {
    ...resolved,
    admissionName: String(resolved.admissionName || DEFAULT_SPECIAL_BINGO_CONFIG.admissionName)
      .replace(/\s*\(includes 1 PHD\)\s*/i, '')
      .trim(),
    admissionPrice: DEFAULT_SPECIAL_BINGO_CONFIG.admissionPrice,
    additionalPhdName: String(resolved.additionalPhdName || DEFAULT_SPECIAL_BINGO_CONFIG.additionalPhdName)
      .replace(/^Additional\s+/i, '')
      .trim(),
    additionalPhdPrice: DEFAULT_SPECIAL_BINGO_CONFIG.additionalPhdPrice,
    additionalPhdMaxQuantity: 1,
  };
}

export function defaultSpecialEventPackages(config = DEFAULT_SPECIAL_BINGO_CONFIG) {
  const resolved = normalizeSpecialBingoConfig(config);
  return [
    { name: resolved.admissionName, price: resolved.admissionPrice, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false, description: '' },
    { name: resolved.additionalPhdName, price: resolved.additionalPhdPrice, type: 'optional', max_quantity: 1, sort_order: 1, is_phd: true, description: 'Handheld device for special bingo.' },
  ];
}

export function defaultEventPackages() {
  return [
    { name: 'Live Event / Venue Admission', price: 0, type: 'required', max_quantity: 1, sort_order: 0, is_phd: false, description: 'Admission ticket for the live event or venue booking.' },
  ];
}
