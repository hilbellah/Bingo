export const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '\uD83D\uDCCA' },
  { id: 'sessions', label: 'Bingo Sessions', icon: '\uD83D\uDCC5' },
  { id: 'events', label: 'Event Sales', icon: '\uD83C\uDF9F' },
  { id: 'packages', label: 'Packages', icon: '\uD83D\uDCE6' },
  { id: 'announcements', label: 'Announcements', icon: '\uD83D\uDCE2' },
  { id: 'bookings', label: 'Bookings & Reports', icon: '\uD83D\uDCB0' },
  { id: 'customers', label: 'Customers', icon: '\uD83D\uDC65' },
  { id: 'bulkprint', label: 'Bulk Print', icon: '\uD83D\uDDA8' },
  { id: 'archive', label: 'Archive & Audit', icon: '\uD83D\uDDC3' },
  { id: 'chairs', label: 'Chair Management', icon: '\uD83E\uDE91' },
  { id: 'inventory', label: 'PHD Inventory', icon: '\uD83D\uDCF1' },
  { id: 'users', label: 'Users', icon: '\uD83D\uDC64', requiresSuperUser: true },
  { id: 'settings', label: 'Printing Settings', icon: '\uD83D\uDDA8' },
];

export function getAdminTabLabel(tabId) {
  return ADMIN_TABS.find(tab => tab.id === tabId)?.label || 'Dashboard';
}
