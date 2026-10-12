import { describe, it, expect } from 'vitest';
import { buildSpecialPaperPrintBody } from './bulkPrintDocuments';

const bingo = { sessionId: 's1', sessionType: 'regular_bingo', sessionDate: '2026-10-13', sessionTime: '18:30' };
const event = { sessionId: 'e1', sessionType: 'event', eventTitle: 'Coldplay Experience', sessionDate: '2026-11-05', sessionTime: '19:00' };
const ticket = (n, sessionId = 's1', extra = {}) => ({
  id: `t${n}`, sessionId, firstName: `First${n}`, lastName: `Last${n}`,
  tableNumber: 6, chairNumber: n, packageName: '9 up', packagePrice: 3000, referenceNumber: `BNG-${n}`, ...extra,
});
const pages = html => (html.match(/<section class="[^"]+">/g) || []).length;

describe('bulk print documents', () => {
  it('prints customer text as text, never as HTML', () => {
    const evil = ticket(1, 's1', { firstName: '<img src=x onerror=alert(1)>', lastName: '"Bob" & \'Co\'' });
    const html = buildSpecialPaperPrintBody([bingo], [evil], { nameCopy: true, seatCopy: true });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&quot;Bob&quot; &amp; &#39;Co&#39;');
  });

  it('puts 3 two-copy bingo tickets per sheet and 6 single-copy ones', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ticket(i + 1));
    expect(pages(buildSpecialPaperPrintBody([bingo], seven, { nameCopy: true, seatCopy: true }))).toBe(3);
    expect(pages(buildSpecialPaperPrintBody([bingo], seven, { singleCopy: true }))).toBe(2);
  });

  it('puts 6 live-event tickets per sheet on event paper', () => {
    const seven = Array.from({ length: 7 }, (_, i) => ticket(i + 1, 'e1'));
    const html = buildSpecialPaperPrintBody([event], seven, {});
    expect(pages(html)).toBe(2);
    expect(html).toContain('class="event-ticket-page"');
  });

  it('prints nothing when no copy is chosen or no ticket belongs to the session', () => {
    expect(buildSpecialPaperPrintBody([bingo], [ticket(1)], {})).toBe('');
    expect(buildSpecialPaperPrintBody([bingo], [ticket(1, 'other')], { nameCopy: true })).toBe('');
  });
});
