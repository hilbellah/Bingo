import crypto from 'crypto';

export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function generateRef() {
  return 'BNG-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

export function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}

export function formatCurrency(cents) {
  return 'CA$' + formatPrice(cents);
}
