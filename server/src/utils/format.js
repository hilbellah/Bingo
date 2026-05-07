export function formatLocalDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function generateRef() {
  return 'BNG-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function formatPrice(cents) {
  return (cents / 100).toFixed(2);
}
