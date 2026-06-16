import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const printUtilsUrl = pathToFileURL(path.join(repoRoot, 'client/src/admin/adminPrintUtils.js'));

const {
  buildAutoBookingReceiptBody,
  buildAutoBookingReceiptLines,
  buildBulkBookingReceiptsBody,
  buildDailySalesReceiptBody,
  buildDailySalesReceiptLines,
  getReceiptTotals,
} = await import(printUtilsUrl);

const booking = {
  referenceNumber: 'BNG-TEST-001',
  totalAmount: 3400,
  totalFormatted: 'CA$34.00',
  sessionDate: '2026-06-04',
  sessionTime: '18:30',
  sessionTitle: 'Regular Bingo',
  createdAt: '2026-06-04T18:00:00.000Z',
  items: [
    {
      firstName: 'Test',
      lastName: 'Customer',
      tableNumber: 12,
      chairNumber: 3,
      referenceNumber: 'BNG-TICKET-001',
      packageName: '9 up',
      packagePrice: 3000,
      packagePriceFormatted: 'CA$30.00',
      addons: [
        { packageName: 'Toonie Ball', quantity: 1, price: 200, priceFormatted: 'CA$2.00' },
      ],
    },
  ],
};

const totals = getReceiptTotals(booking);
assert.equal(totals.itemSubtotal, 3200);
assert.equal(totals.serviceChargeAmount, 200);
assert.equal(totals.totalWithService, 3400);
assert.equal(totals.itemSubtotalFormatted, 'CA$32.00');
assert.equal(totals.serviceChargeFormatted, 'CA$2.00');
assert.equal(totals.totalWithServiceFormatted, 'CA$34.00');

const fallbackTotals = getReceiptTotals({
  ...booking,
  totalAmount: undefined,
  totalFormatted: 'CA$35.50',
});
assert.equal(fallbackTotals.serviceChargeAmount, 350);
assert.equal(fallbackTotals.totalWithServiceFormatted, 'CA$35.50');

const receipt = buildAutoBookingReceiptLines(booking, {
  paperWidth: '80mm',
  showAddons: true,
  showTableChair: true,
});
const receiptHtml = receipt.lines.join('');
assert.equal(receipt.paperWidth, '80mm');
assert.match(receiptHtml, /wolastoq-logo-thermal\.png/);
assert.match(receiptHtml, /SUBTOTAL/);
assert.match(receiptHtml, /CA\$32\.00/);
assert.match(receiptHtml, /SERVICE CHARGE/);
assert.match(receiptHtml, /CA\$2\.00/);
assert.match(receiptHtml, /TOTAL AMOUNT : CA\$/);
assert.match(receiptHtml, />34\.00</);
assert.match(receiptHtml, /Toonie Ball/);

const receiptWithCut = buildAutoBookingReceiptBody(booking, {
  paperWidth: '80mm',
  receiptCutPercent: 65,
});
assert.equal(receiptWithCut.paperWidth, '80mm');
assert.equal(receiptWithCut.cutPercent, 65);
assert.match(receiptWithCut.body, /class="receipt-cut-page"/);
assert.match(receiptWithCut.body, /data-cut-percent="65"/);

const bulk = buildBulkBookingReceiptsBody(
  [
    booking,
    { ...booking, referenceNumber: 'BNG-TEST-002', totalAmount: 3600 },
  ],
  { paperWidth: '58mm', showAddons: true }
);
assert.equal(bulk.paperWidth, '58mm');
assert.equal((bulk.body.match(/bulk-receipt-break/g) || []).length, 1);
assert.equal((bulk.body.match(/bulk-receipt-cut-page/g) || []).length, 0);
assert.equal((bulk.body.match(/wolastoq-logo-thermal\.png/g) || []).length, 2);

const bulkWithPartialCut = buildBulkBookingReceiptsBody(
  [
    booking,
    { ...booking, referenceNumber: 'BNG-TEST-002', totalAmount: 3600 },
  ],
  { paperWidth: '80mm', receiptCutPercent: 65 }
);
assert.equal(bulkWithPartialCut.paperWidth, '80mm');
assert.equal(bulkWithPartialCut.cutPercent, 65);
assert.equal((bulkWithPartialCut.body.match(/bulk-receipt-cut-page/g) || []).length, 2);
assert.equal((bulkWithPartialCut.body.match(/data-cut-percent="65"/g) || []).length, 2);
assert.equal((bulkWithPartialCut.body.match(/bulk-receipt-break/g) || []).length, 0);

const legacyBulkWithPartialCut = buildBulkBookingReceiptsBody([booking], { partialCutBetweenReceipts: true });
assert.equal(legacyBulkWithPartialCut.cutPercent, 70);
assert.equal((legacyBulkWithPartialCut.body.match(/data-cut-percent="70"/g) || []).length, 1);

const daily = buildDailySalesReceiptLines({
  date: '2026-06-04',
  items: [
    {
      rowNum: 1,
      firstName: 'Test',
      lastName: 'Customer',
      referenceNumber: 'BNG-TICKET-001',
      tableNumber: 12,
      chairNumber: 3,
      packageName: '9 up',
      itemPrice: 3000,
      addons: [
        { packageName: 'Toonie Ball', quantity: 1, price: 200, priceFormatted: 'CA$2.00' },
      ],
    },
  ],
  addonSubtotal: 200,
  packageSubtotalFormatted: 'CA$30.00',
  addonSubtotalFormatted: 'CA$2.00',
  subtotalWithoutServiceChargesFormatted: 'CA$32.00',
  serviceChargeSubtotalFormatted: 'CA$2.00',
  totalWithServiceChargesFormatted: 'CA$34.00',
  totalTickets: 1,
  totalBookings: 1,
});
const dailyHtml = daily.lines.join('');
assert.equal(daily.paperWidth, '80mm');
assert.match(dailyHtml, /wolastoq-logo-thermal\.png/);
assert.match(dailyHtml, /Subtotal \(no service\)/);
assert.match(dailyHtml, /Service charges/);
assert.match(dailyHtml, /TOTAL \(1 tickets, 1 bookings\)/);
assert.match(dailyHtml, /CA\$34\.00/);

const dailyWithCut = buildDailySalesReceiptBody({
  date: '2026-06-04',
  items: [
    {
      rowNum: 1,
      firstName: 'Test',
      lastName: 'Customer',
      referenceNumber: 'BNG-TICKET-001',
      tableNumber: 12,
      chairNumber: 3,
      packageName: '9 up',
      itemPrice: 3000,
      addons: [],
    },
  ],
  addonSubtotal: 0,
  subtotalWithoutServiceChargesFormatted: '$30.00',
  serviceChargeSubtotalFormatted: '$2.00',
  totalWithServiceChargesFormatted: '$32.00',
  totalTickets: 1,
  totalBookings: 1,
}, { paperWidth: '58mm', partialCutBetweenReceipts: true });
assert.equal(dailyWithCut.paperWidth, '58mm');
assert.equal(dailyWithCut.cutPercent, 70);
assert.match(dailyWithCut.body, /class="thermal-receipt-cut-page"/);
assert.match(dailyWithCut.body, /data-cut-percent="70"/);

const emptyDaily = buildDailySalesReceiptLines(null, { paperWidth: '58mm' });
assert.deepEqual(emptyDaily, { lines: [], paperWidth: '58mm' });

console.log('Receipt rendering check passed.');
