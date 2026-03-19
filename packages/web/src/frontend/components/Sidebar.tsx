import React from 'react';
import { NavLink } from 'react-router-dom';

interface NavItem {
  path: string;
  label: string;
}

const navItems: NavItem[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/sessions', label: 'Sessions' },
  { path: '/models', label: 'Models' },
  { path: '/costs', label: 'Costs' },
  { path: '/discussions', label: 'Discussions' },
  { path: '/config', label: 'Config' },
  { path: '/pipeline', label: 'Pipeline' },
];

export function Sidebar(): React.JSX.Element {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">CodeAgora</h1>
      </div>
      <ul className="sidebar-nav">
        {navItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
              }
              end={item.path === '/'}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
