export function confirmAdminAction({ action, details = [], warning = '' }) {
  const lines = [`${action}?`];

  const visibleDetails = details.filter(Boolean);
  if (visibleDetails.length > 0) {
    lines.push('', ...visibleDetails);
  }

  if (warning) {
    lines.push('', warning);
  }

  lines.push('', 'Continue?');
  return window.confirm(lines.join('\n'));
}
