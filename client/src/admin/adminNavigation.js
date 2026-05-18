// Admin sidebar navigation tree.
//
// Top-level entries can be either:
//   - Leaf tabs: { id, label, icon, requiresSuperUser? }
//   - Groups:    { id: 'xxx-group', label, icon, children: [...leaf tabs] }
//
// Leaf tab IDs are the same IDs the tab components check internally
// (`if (tab !== 'sessions') return null`) — keeping them stable means
// nothing inside the tab files had to change when we moved them under groups.
//
// `requiresSuperUser` works on both leaves and groups; a group with all its
// children filtered out by permissions will itself be hidden.
export const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  {
    id: 'sessions-group',
    label: 'Sessions',
    icon: '📅',
    children: [
      { id: 'sessions', label: 'Calendar', icon: '📋' },
      { id: 'recurring', label: 'Recurring', icon: '🔁' },
      { id: 'events', label: 'Live Event / Venue', icon: '🎟' },
    ],
  },
  {
    id: 'venue-group',
    label: 'Venue Resources',
    icon: '🪑',
    children: [
      { id: 'chairs', label: 'Chair Management', icon: '🪑' },
      { id: 'inventory', label: 'PHD Inventory', icon: '📱' },
    ],
  },
  { id: 'packages', label: 'Packages', icon: '📦' },
  { id: 'announcements', label: 'Announcements', icon: '📢' },
  {
    id: 'reports-group',
    label: 'Reports & Activity',
    icon: '📈',
    children: [
      { id: 'bookings', label: 'Sales & Transactions', icon: '💰' },
      { id: 'bulkprint', label: 'Bulk Print', icon: '🖨' },
      { id: 'customers', label: 'Customers', icon: '👥' },
      { id: 'archive', label: 'Archive & Audit', icon: '🗃' },
    ],
  },
  { id: 'settings', label: 'Printing Settings', icon: '🖨' },
  { id: 'users', label: 'Users', icon: '👤', requiresSuperUser: true },
];

// Flattened list of leaves (no group entries). Useful for tab-label lookups,
// breadcrumbs, etc. Order matches sidebar display order.
export const ADMIN_LEAF_TABS = ADMIN_TABS.flatMap(tab =>
  tab.children ? tab.children : [tab]
);

// Resolve a leaf tab's human label for the page header.
export function getAdminTabLabel(tabId) {
  return ADMIN_LEAF_TABS.find(tab => tab.id === tabId)?.label || 'Dashboard';
}

// Find which top-level group (if any) contains a given leaf tab. Returns the
// group object, or null if the tab is itself a top-level leaf.
export function getAdminTabParentGroup(tabId) {
  return ADMIN_TABS.find(tab => tab.children?.some(child => child.id === tabId)) || null;
}
