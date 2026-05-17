import React, { useEffect, useState } from 'react';
import { ADMIN_TABS, getAdminTabLabel, getAdminTabParentGroup } from './adminNavigation';

const EXPANDED_STORAGE_KEY = 'admin_sidebar_expanded_groups_v1';

// Read/write the per-group expanded state from localStorage so the sidebar
// remembers what the admin had open between sessions.
function loadInitialExpanded() {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch { /* ignore unreadable storage */ }
  // Default: every group expanded on first visit so the admin can see the
  // full menu at once and discover the new groupings.
  const defaults = {};
  for (const tab of ADMIN_TABS) {
    if (tab.children) defaults[tab.id] = true;
  }
  return defaults;
}

function saveExpanded(state) {
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota / privacy mode — fall through */ }
}

export default function AdminShell({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  adminDisplayName,
  isSuperUser,
  onLogout,
  rightActions,
  children
}) {
  // Filter top-level tabs by permission. For groups, also drop any children
  // the current admin can't see; if a group ends up with no visible children,
  // hide the whole group.
  const visibleTabs = ADMIN_TABS
    .map(tab => {
      if (!tab.children) return tab;
      const visibleChildren = tab.children.filter(c => !c.requiresSuperUser || isSuperUser);
      if (visibleChildren.length === 0) return null;
      return { ...tab, children: visibleChildren };
    })
    .filter(Boolean)
    .filter(tab => !tab.requiresSuperUser || isSuperUser);

  const [expanded, setExpanded] = useState(loadInitialExpanded);

  // Whenever the user navigates to a child tab, make sure its parent group
  // is expanded so the active item is visible.
  useEffect(() => {
    const parent = getAdminTabParentGroup(activeTab);
    if (parent && !expanded[parent.id]) {
      setExpanded(prev => {
        const next = { ...prev, [parent.id]: true };
        saveExpanded(next);
        return next;
      });
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (groupId) => {
    setExpanded(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      saveExpanded(next);
      return next;
    });
  };

  // Compute the page header label. When the active tab lives inside a group,
  // show "Parent / Child" so the admin knows where they are in the new IA.
  const parentGroup = getAdminTabParentGroup(activeTab);
  const headerLabel = parentGroup
    ? `${parentGroup.label} / ${getAdminTabLabel(activeTab)}`
    : getAdminTabLabel(activeTab);

  const renderLeaf = (tab, { indented = false } = {}) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`w-full flex items-center gap-3 ${indented ? 'pl-10 pr-4' : 'px-4'} py-2.5 text-sm transition-colors ${
          isActive
            ? 'bg-white/20 text-white font-semibold border-r-4 border-brand-gold'
            : 'text-gray-300 hover:bg-white/10 hover:text-white'
        }`}
        title={collapsed ? tab.label : undefined}
      >
        <span className="text-base">{tab.icon}</span>
        {!collapsed && <span>{tab.label}</span>}
      </button>
    );
  };

  const renderGroup = (group) => {
    // Determine if any child of this group is currently active — used to
    // visually emphasise the parent row even when not directly clicked.
    const hasActiveChild = group.children.some(c => c.id === activeTab);
    const isOpen = !!expanded[group.id];

    return (
      <div key={group.id}>
        <button
          onClick={() => toggleGroup(group.id)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
            hasActiveChild
              ? 'text-white font-semibold'
              : 'text-gray-300 hover:bg-white/10 hover:text-white'
          }`}
          title={collapsed ? group.label : undefined}
        >
          <span className="text-lg">{group.icon}</span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{group.label}</span>
              <span className={`text-xs transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
            </>
          )}
        </button>
        {/* When the sidebar is collapsed there's no room to show indented
            children — instead, expose them as a flat list so they're still
            clickable via tooltip. */}
        {isOpen && !collapsed && (
          <div className="bg-black/10">
            {group.children.map(child => renderLeaf(child, { indented: true }))}
          </div>
        )}
        {collapsed && group.children.map(child => renderLeaf(child))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-brand-light flex">
      <aside className={`bg-brand-blue text-white flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-56'} min-h-screen`}>
        <div className="p-4 border-b border-white/10">
          {!collapsed && (
            <>
              <h1 className="text-lg font-bold leading-tight">SMEC</h1>
              <p className="text-xs text-gray-300 mt-0.5">Admin Panel</p>
              <p className="text-xs text-brand-gold mt-1 truncate" title={adminDisplayName}>Logged in as {adminDisplayName}</p>
            </>
          )}
          <button onClick={onToggleCollapsed} className="mt-2 text-xs text-gray-300 hover:text-white">
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {visibleTabs.map(tab => tab.children ? renderGroup(tab) : renderLeaf(tab))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          {!collapsed && (
            <>
              <a href="/tickets" className="block text-xs text-gray-300 hover:text-white">Reprint Tickets</a>
              <a href="/" className="block text-xs text-gray-300 hover:text-white">View Booking Page</a>
            </>
          )}
          <button onClick={onLogout} className={`w-full text-xs bg-white/10 py-2 rounded hover:bg-white/20 ${collapsed ? 'px-1' : 'px-3'}`}>
            {collapsed ? '🚪' : 'Logout'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-blue">{headerLabel}</h2>
          {rightActions}
        </header>

        {children}
      </div>
    </div>
  );
}
