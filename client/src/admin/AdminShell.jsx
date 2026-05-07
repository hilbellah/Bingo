import React from 'react';
import { ADMIN_TABS, getAdminTabLabel } from './adminNavigation';

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
  const visibleTabs = ADMIN_TABS.filter(tab => !tab.requiresSuperUser || isSuperUser);

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
            {collapsed ? '\u25B6' : '\u25C0'}
          </button>
        </div>

        <nav className="flex-1 py-2">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'bg-white/20 text-white font-semibold border-r-4 border-brand-gold'
                  : 'text-gray-300 hover:bg-white/10 hover:text-white'
              }`}
              title={collapsed ? tab.label : undefined}
            >
              <span className="text-lg">{tab.icon}</span>
              {!collapsed && <span>{tab.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          {!collapsed && (
            <>
              <a href="/tickets" className="block text-xs text-gray-300 hover:text-white">Reprint Tickets</a>
              <a href="/" className="block text-xs text-gray-300 hover:text-white">View Booking Page</a>
            </>
          )}
          <button onClick={onLogout} className={`w-full text-xs bg-white/10 py-2 rounded hover:bg-white/20 ${collapsed ? 'px-1' : 'px-3'}`}>
            {collapsed ? '\uD83D\uDEAA' : 'Logout'}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen overflow-auto">
        <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-brand-blue">{getAdminTabLabel(activeTab)}</h2>
          {rightActions}
        </header>

        {children}
      </div>
    </div>
  );
}
