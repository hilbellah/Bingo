// Labels and date formatting for the recurring schedule screens.
// JS Date.getDay() convention: Sunday = 0
export const DAY_LABELS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const SESSION_TYPES = [
  { value: 'regular_bingo', label: 'Regular Bingo' },
  { value: 'special_bingo', label: 'Special Bingo' },
];

export function formatTimestamp(iso) {
  if (!iso) return 'Never';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}
