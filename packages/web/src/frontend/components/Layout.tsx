import React, { useState, useCallback } from 'react';
import { Sidebar } from './Sidebar.js';
import { NotificationCenter } from './NotificationCenter.js';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps): React.JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="layout">
      <button
        className="menu-toggle"
        onClick={toggleSidebar}
        aria-label="Toggle menu"
      >
        {sidebarOpen ? '\u2715' : '\u2630'}
      </button>
      <Sidebar className={sidebarOpen ? 'sidebar--open' : ''} />
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}
      <div className="layout__body">
        <header className="layout__header">
          <NotificationCenter />
        </header>
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
