import { describe, it, expect } from 'vitest';
import {
  reasonField,
  formatPrice,
  packageSummary,
  splitSalesCutoffAt,
  buildSalesCutoffAt,
  DEFAULT_SPECIAL_BINGO_CONFIG,
  normalizeSpecialBingoConfig,
  defaultSpecialEventPackages,
  defaultEventPackages,
} from './adminDashboardHelpers';

describe('admin dashboard helpers', () => {
  it('formats integer cents as Canadian dollars', () => {
    expect(formatPrice(0)).toBe('CA$0.00');
    expect(formatPrice(3000)).toBe('CA$30.00');
    expect(formatPrice(26257575)).toBe('CA$262575.75');
  });

  it('summarises named packages only', () => {
    expect(packageSummary([{ name: 'Admission', price: 2500 }, { name: '', price: 100 }, null, { name: 'PHD', price: 5000 }]))
      .toBe('Admission (CA$25.00), PHD (CA$50.00)');
    expect(packageSummary()).toBe('');
  });

  it('round-trips a sales cutoff between date/time fields and the stored value', () => {
    const stored = buildSalesCutoffAt('2026-10-17', '12:00');
    expect(stored).toBe('2026-10-17T12:00');
    expect(splitSalesCutoffAt(stored)).toEqual({ date: '2026-10-17', time: '12:00' });
    expect(buildSalesCutoffAt('', '12:00')).toBeNull();
    expect(buildSalesCutoffAt('2026-10-17', '')).toBeNull();
  });

  it('falls back to the given date and noon when no cutoff is stored', () => {
    expect(splitSalesCutoffAt(null, '2026-11-05')).toEqual({ date: '2026-11-05', time: '12:00' });
    expect(splitSalesCutoffAt('', '', '18:00')).toEqual({ date: '', time: '18:00' });
  });

  it('keeps special bingo prices fixed whatever the saved config says', () => {
    const normalized = normalizeSpecialBingoConfig({
      admissionName: 'Big Bank Admission (includes 1 PHD)',
      admissionPrice: 1,
      additionalPhdName: 'Additional PHD Unit',
      additionalPhdPrice: 1,
      additionalPhdMaxQuantity: 9,
    });
    expect(normalized.admissionName).toBe('Big Bank Admission');
    expect(normalized.additionalPhdName).toBe('PHD Unit');
    expect(normalized.admissionPrice).toBe(DEFAULT_SPECIAL_BINGO_CONFIG.admissionPrice);
    expect(normalized.additionalPhdPrice).toBe(DEFAULT_SPECIAL_BINGO_CONFIG.additionalPhdPrice);
    expect(normalized.additionalPhdMaxQuantity).toBe(1);
  });

  it('builds the default special bingo and live event packages', () => {
    const special = defaultSpecialEventPackages();
    expect(special.map(pkg => [pkg.type, pkg.price, pkg.is_phd])).toEqual([
      ['required', 7500, false],
      ['optional', 5000, true],
    ]);
    const event = defaultEventPackages();
    expect(event).toHaveLength(1);
    expect(event[0]).toMatchObject({ type: 'required', price: 0, max_quantity: 1 });
  });

  it('requires a 3-character reason, matching the server', () => {
    expect(reasonField('Reason for refund')).toMatchObject({ name: 'reason', required: true, minLength: 3 });
  });
});
