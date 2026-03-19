import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '../../../src/frontend/components/Sidebar.js';

function renderSidebar(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Sidebar />
    </MemoryRouter>
  );
}

describe('Sidebar', () => {
  it('shows the CodeAgora title', () => {
    renderSidebar();
    expect(screen.getByText('CodeAgora')).toBeInTheDocument();
  });

  it('renders all navigation link labels', () => {
    renderSidebar();
    const labels = ['Dashboard', 'Sessions', 'Models', 'Costs', 'Discussions', 'Config', 'Pipeline'];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('renders links with correct hrefs', () => {
    renderSidebar();
    const expectedLinks: [string, string][] = [
      ['Dashboard', '/'],
      ['Sessions', '/sessions'],
      ['Models', '/models'],
      ['Costs', '/costs'],
      ['Discussions', '/discussions'],
      ['Config', '/config'],
      ['Pipeline', '/pipeline'],
    ];
    for (const [label, href] of expectedLinks) {
      const link = screen.getByText(label).closest('a');
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('applies active class to the current route link', () => {
    renderSidebar('/sessions');
    const sessionsLink = screen.getByText('Sessions').closest('a');
    expect(sessionsLink).toHaveClass('sidebar-link--active');
  });

  it('renders inside a nav element', () => {
    renderSidebar();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});
