export const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\uD83D\uDCCA' },
  { id: 'sessions', label: 'Sessions', icon: '\uD83D\uDCC5' },
  { id: 'packages', label: 'Packages', icon: '\uD83D\uDCE6' },
  { id: 'announcements', label: 'Announcements', icon: '\uD83D\uDCE2' },
  { id: 'bookings', label: 'Bookings & Reports', icon: '\uD83D\uDCB0' },
  { id: 'bulkprint', label: 'Bulk Print', icon: '\uD83D\uDDA8' },
  { id: 'archive', label: 'Archive & Audit', icon: '\uD83D\uDDC3' },
  { id: 'chairs', label: 'Chair Management', icon: '\uD83E\uDE91' },
  { id: 'inventory', label: 'PHD Inventory', icon: '\uD83D\uDCF1' },
  { id: 'settings', label: 'Printing Settings', icon: '\uD83D\uDDA8' },
];

export function getAdminTabLabel(tabId) {
  return ADMIN_TABS.find(tab => tab.id === tabId)?.label || 'Dashboard';
}
