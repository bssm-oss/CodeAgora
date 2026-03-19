import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConfigSection } from '../../../src/frontend/components/ConfigSection.js';

describe('ConfigSection', () => {
  it('renders title and description', () => {
    render(
      <ConfigSection title="General Settings" description="Basic configuration options.">
        <span>Child content</span>
      </ConfigSection>,
    );

    expect(screen.getByText('General Settings')).toBeInTheDocument();
    expect(screen.getByText('Basic configuration options.')).toBeInTheDocument();
  });

  it('is collapsed by default (children hidden)', () => {
    render(
      <ConfigSection title="Section" description="Desc">
        <span>Hidden child</span>
      </ConfigSection>,
    );

    expect(screen.queryByText('Hidden child')).not.toBeInTheDocument();
  });

  it('expands when header is clicked', () => {
    render(
      <ConfigSection title="Section" description="Desc">
        <span>Visible child</span>
      </ConfigSection>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Visible child')).toBeInTheDocument();
  });

  it('collapses again when header is clicked a second time', () => {
    render(
      <ConfigSection title="Section" description="Desc">
        <span>Toggle child</span>
      </ConfigSection>,
    );

    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('Toggle child')).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.queryByText('Toggle child')).not.toBeInTheDocument();
  });

  it('renders expanded when defaultExpanded is true', () => {
    render(
      <ConfigSection title="Section" description="Desc" defaultExpanded>
        <span>Default visible</span>
      </ConfigSection>,
    );

    expect(screen.getByText('Default visible')).toBeInTheDocument();
  });

  it('sets aria-expanded correctly', () => {
    render(
      <ConfigSection title="Section" description="Desc">
        <span>Child</span>
      </ConfigSection>,
    );

    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});
