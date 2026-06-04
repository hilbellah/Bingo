import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const printUtilsUrl = pathToFileURL(path.join(repoRoot, 'client/src/admin/adminPrintUtils.js'));

const {
  buildAutoBookingReceiptLines,
  buildBulkBookingReceiptsBody,
  buildDailySalesReceiptLines,
  getReceiptTotals,
} = await import(printUtilsUrl);

const booking = {
  referenceNumber: 'BNG-TEST-001',
  totalAmount: 3400,
  totalFormatted: '$34.00',
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
      packagePriceFormatted: '$30.00',
      addons: [
        { packageName: 'Toonie Ball', quantity: 1, price: 200, priceFormatted: '$2.00' },
      ],
    },
  ],
};

const totals = getReceiptTotals(booking);
assert.equal(totals.itemSubtotal, 3200);
assert.equal(totals.serviceChargeAmount, 200);
assert.equal(totals.totalWithService, 3400);
assert.equal(totals.itemSubtotalFormatted, '$32.00');
assert.equal(totals.serviceChargeFormatted, '$2.00');
assert.equal(totals.totalWithServiceFormatted, '$34.00');

const fallbackTotals = getReceiptTotals({
  ...booking,
  totalAmount: undefined,
  totalFormatted: '$35.50',
});
assert.equal(fallbackTotals.serviceChargeAmount, 350);
assert.equal(fallbackTotals.totalWithServiceFormatted, '$35.50');

const receipt = buildAutoBookingReceiptLines(booking, {
  paperWidth: '80mm',
  showAddons: true,
  showTableChair: true,
});
const receiptHtml = receipt.lines.join('');
assert.equal(receipt.paperWidth, '80mm');
assert.match(receiptHtml, /wolastoq-logo-thermal\.png/);
assert.match(receiptHtml, /SUBTOTAL/);
assert.match(receiptHtml, /\$32\.00/);
assert.match(receiptHtml, /SERVICE CHARGE/);
assert.match(receiptHtml, /\$2\.00/);
assert.match(receiptHtml, /TOTAL AMOUNT : \$/);
assert.match(receiptHtml, />34\.00</);
assert.match(receiptHtml, /Toonie Ball/);

const bulk = buildBulkBookingReceiptsBody(
  [
    booking,
    { ...booking, referenceNumber: 'BNG-TEST-002', totalAmount: 3600 },
  ],
  { paperWidth: '58mm', showAddons: true }
);
assert.equal(bulk.paperWidth, '58mm');
assert.equal((bulk.body.match(/bulk-receipt-break/g) || []).length, 1);
assert.equal((bulk.body.match(/wolastoq-logo-thermal\.png/g) || []).length, 2);

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
        { packageName: 'Toonie Ball', quantity: 1, price: 200, priceFormatted: '$2.00' },
      ],
    },
  ],
  addonSubtotal: 200,
  packageSubtotalFormatted: '$30.00',
  addonSubtotalFormatted: '$2.00',
  subtotalWithoutServiceChargesFormatted: '$32.00',
  serviceChargeSubtotalFormatted: '$2.00',
  totalWithServiceChargesFormatted: '$34.00',
  totalTickets: 1,
  totalBookings: 1,
});
const dailyHtml = daily.lines.join('');
assert.equal(daily.paperWidth, '80mm');
assert.match(dailyHtml, /wolastoq-logo-thermal\.png/);
assert.match(dailyHtml, /Subtotal \(no service\)/);
assert.match(dailyHtml, /Service charges/);
assert.match(dailyHtml, /TOTAL \(1 tickets, 1 bookings\)/);
assert.match(dailyHtml, /\$34\.00/);

const emptyDaily = buildDailySalesReceiptLines(null, { paperWidth: '58mm' });
assert.deepEqual(emptyDaily, { lines: [], paperWidth: '58mm' });

console.log('Receipt rendering check passed.');
