// Admin sidebar navigation tree.
//
// Top-level entries can be either:
//   - Leaf tabs: { id, label, icon, requiresSuperUser? }
//   - Groups:    { id, label, icon, description, children: [...leaf tabs] }
//
// Leaf tab IDs are the same IDs the tab components check internally
// (`if (tab !== 'sessions') return null`). Keeping IDs stable lets us move
// tabs under different work-area groups without rewriting the tab bodies.
//
// Some shared tabs intentionally appear under more than one group. Example:
// transactions are useful to the Live Event admin and also belong in the
// combined Shared Operations section.
export const ADMIN_TABS = [
  {
    id: 'bingo-group',
    label: 'Bingo',
    icon: 'B',
    description: 'Regular and special bingo operations',
    children: [
      { id: 'dashboard', label: 'Bingo Dashboard', icon: 'D' },
      { id: 'sessions', label: 'Bingo Sessions', icon: 'S' },
      { id: 'recurring', label: 'Auto Schedule', icon: 'A' },
      { id: 'chairs', label: 'Chair Management', icon: 'C' },
      { id: 'inventory', label: 'PHD Inventory', icon: 'P' },
      { id: 'packages', label: 'Bingo Packages', icon: 'T' },
    ],
  },
  {
    id: 'live-event-group',
    label: 'Live Event / Venue',
    icon: 'L',
    description: 'Live event setup and sales review',
    children: [
      { id: 'events', label: 'Event Setup & Sales', icon: 'E' },
      { id: 'chairs', label: 'Venue Chairs', icon: 'C' },
      { id: 'announcements', label: 'Event Announcements', icon: 'N' },
      { id: 'bookings', label: 'Event Transactions', icon: '$' },
    ],
  },
  {
    id: 'shared-group',
    label: 'Shared Operations',
    icon: 'O',
    description: 'Combined reporting and customer tools',
    children: [
      { id: 'bookings', label: 'All Sales & Transactions', icon: '$' },
      { id: 'bulkprint', label: 'Bulk Print', icon: 'P' },
      { id: 'customers', label: 'Customers', icon: 'U' },
      { id: 'announcements', label: 'Announcements', icon: 'N' },
      { id: 'archive', label: 'Archive & Audit', icon: 'R' },
    ],
  },
  {
    id: 'system-group',
    label: 'System',
    icon: 'G',
    description: 'Settings and access',
    children: [
      { id: 'settings', label: 'Printing Settings', icon: 'P' },
      { id: 'users', label: 'Users', icon: 'U', requiresSuperUser: true },
    ],
  },
];

export const ADMIN_LEAF_TABS = ADMIN_TABS.flatMap(tab =>
  tab.children ? tab.children : [tab]
);

export function getAdminTabLabel(tabId) {
  return ADMIN_LEAF_TABS.find(tab => tab.id === tabId)?.label || 'Dashboard';
}

export function getAdminTabParentGroup(tabId) {
  return ADMIN_TABS.find(tab => tab.children?.some(child => child.id === tabId)) || null;
}
