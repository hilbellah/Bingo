import React, { useEffect, useState } from 'react';
import { ADMIN_TABS, getAdminTabLabel, getAdminTabParentGroup } from './adminNavigation';

const EXPANDED_STORAGE_KEY = 'admin_sidebar_expanded_groups_v1';

function loadInitialExpanded() {
  const defaults = {};
  for (const tab of ADMIN_TABS) {
    if (tab.children) defaults[tab.id] = true;
  }

  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...defaults, ...parsed };
    }
  } catch {
    // Ignore unreadable storage.
  }

  return defaults;
}

function saveExpanded(state) {
  try {
    window.localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota or privacy-mode errors.
  }
}

const GROUP_THEME_CLASSES = {
  amber: {
    activeGroup: 'bg-amber-500/20 text-amber-50 ring-1 ring-amber-300/35',
    groupHover: 'hover:bg-amber-500/10 hover:text-amber-100',
    icon: 'bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/35',
    childActive: 'bg-amber-500/20 text-white font-semibold border-r-4 border-amber-300',
    childHover: 'hover:bg-amber-500/10 hover:text-amber-100',
    childIcon: 'bg-amber-400/20 text-amber-100',
  },
  blue: {
    activeGroup: 'bg-sky-500/20 text-sky-50 ring-1 ring-sky-300/35',
    groupHover: 'hover:bg-sky-500/10 hover:text-sky-100',
    icon: 'bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/35',
    childActive: 'bg-sky-500/20 text-white font-semibold border-r-4 border-sky-300',
    childHover: 'hover:bg-sky-500/10 hover:text-sky-100',
    childIcon: 'bg-sky-400/20 text-sky-100',
  },
  neutral: {
    activeGroup: 'bg-white/15 text-white ring-1 ring-white/15',
    groupHover: 'hover:bg-white/10 hover:text-white',
    icon: 'bg-white/10 text-white',
    childActive: 'bg-white/20 text-white font-semibold border-r-4 border-brand-gold',
    childHover: 'hover:bg-white/10 hover:text-white',
    childIcon: 'bg-white/10 text-white',
  },
};

function getGroupTheme(groupId) {
  const group = ADMIN_TABS.find(tab => tab.id === groupId);
  return GROUP_THEME_CLASSES[group?.theme] || GROUP_THEME_CLASSES.neutral;
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
  const [activeGroupId, setActiveGroupId] = useState(null);

  useEffect(() => {
    const parent = ADMIN_TABS.find(tab => tab.id === activeGroupId && tab.children?.some(child => child.id === activeTab))
      || getAdminTabParentGroup(activeTab);
    if (parent && !expanded[parent.id]) {
      setExpanded(prev => {
        const next = { ...prev, [parent.id]: true };
        saveExpanded(next);
        return next;
      });
    }
  }, [activeTab, activeGroupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (groupId) => {
    setExpanded(prev => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      saveExpanded(next);
      return next;
    });
  };

  const parentGroup = ADMIN_TABS.find(tab => tab.id === activeGroupId && tab.children?.some(child => child.id === activeTab))
    || getAdminTabParentGroup(activeTab);
  const activeLeafLabel = parentGroup?.children?.find(child => child.id === activeTab)?.label
    || getAdminTabLabel(activeTab);
  const headerLabel = parentGroup
    ? `${parentGroup.label} / ${activeLeafLabel}`
    : activeLeafLabel;

  const renderLeaf = (tab, { indented = false, parentGroupId = null } = {}) => {
    const isActive = activeTab === tab.id && (!activeGroupId || !parentGroupId || parentGroupId === activeGroupId);
    const theme = getGroupTheme(parentGroupId);
    return (
      <button
        key={`${parentGroupId || 'root'}-${tab.id}`}
        onClick={() => {
          setActiveGroupId(parentGroupId);
          onTabChange(tab.id);
        }}
        className={`w-full flex items-center gap-3 ${indented ? 'pl-10 pr-4' : 'px-4'} py-2.5 text-sm transition-colors ${
          isActive
            ? theme.childActive
            : `text-gray-300 ${theme.childHover}`
        }`}
        title={collapsed ? tab.label : undefined}
      >
        <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${isActive ? theme.childIcon : 'bg-white/10'}`}>
          {tab.icon}
        </span>
        {!collapsed && <span>{tab.label}</span>}
      </button>
    );
  };

  const renderGroup = (group) => {
    const hasActiveChild = group.children.some(c => c.id === activeTab) && (!activeGroupId || activeGroupId === group.id);
    const isOpen = !!expanded[group.id];
    const theme = GROUP_THEME_CLASSES[group.theme] || GROUP_THEME_CLASSES.neutral;

    return (
      <div key={group.id} className="px-2 py-1">
        <button
          onClick={() => toggleGroup(group.id)}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors ${
            hasActiveChild
              ? theme.activeGroup
              : `text-gray-300 ${theme.groupHover}`
          }`}
          title={collapsed ? group.label : undefined}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${theme.icon}`}>
            {group.icon}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">
                <span className="block">{group.label}</span>
                {group.description && (
                  <span className="block text-[10px] font-normal text-white/40 leading-tight">
                    {group.description}
                  </span>
                )}
              </span>
              <span className="text-base font-bold">{isOpen ? '-' : '+'}</span>
            </>
          )}
        </button>

        {isOpen && !collapsed && (
          <div className="mt-1 overflow-hidden rounded-lg bg-black/10">
            {group.children.map(child => renderLeaf(child, { indented: true, parentGroupId: group.id }))}
          </div>
        )}
        {collapsed && group.children.map(child => renderLeaf(child, { parentGroupId: group.id }))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-brand-light flex">
      <aside className={`bg-brand-blue text-white flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'} min-h-screen`}>
        <div className="p-4 border-b border-white/10">
          {!collapsed && (
            <>
              <h1 className="text-lg font-bold leading-tight">SMEC</h1>
              <p className="text-xs text-gray-300 mt-0.5">Admin Panel</p>
              <p className="text-xs text-brand-gold mt-1 truncate" title={adminDisplayName}>Logged in as {adminDisplayName}</p>
            </>
          )}
          <button onClick={onToggleCollapsed} className="mt-2 text-xs text-gray-300 hover:text-white">
            {collapsed ? '>' : '<'}
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
            {collapsed ? 'X' : 'Logout'}
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
