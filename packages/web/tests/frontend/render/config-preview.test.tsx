import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigPreview } from '../../../src/frontend/components/ConfigPreview.js';

describe('ConfigPreview', () => {
  it('renders JSON preview title', () => {
    render(<ConfigPreview config={{ key: 'value' }} />);

    expect(screen.getByText('JSON Preview')).toBeInTheDocument();
  });

  it('shows copy button', () => {
    render(<ConfigPreview config={{ key: 'value' }} />);

    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
  });

  it('displays config object keys and values', () => {
    render(<ConfigPreview config={{ apiKey: 'abc', timeout: 30 }} />);

    expect(screen.getByText('"apiKey"')).toBeInTheDocument();
    expect(screen.getByText('"abc"')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('renders line numbers', () => {
    const { container } = render(<ConfigPreview config={{ a: 1 }} />);

    // JSON.stringify({ a: 1 }, null, 2) produces 3 lines so there should be 3 line-number spans
    const lineNumbers = container.querySelectorAll('.json-line-number');
    expect(lineNumbers.length).toBe(3);
    expect(lineNumbers[0].textContent).toBe('1');
    expect(lineNumbers[1].textContent).toBe('2');
    expect(lineNumbers[2].textContent).toBe('3');
  });

  it('shows Copied! after clicking copy (with clipboard mock)', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<ConfigPreview config={{ x: 1 }} />);

    const copyBtn = screen.getByRole('button', { name: /copy/i });
    fireEvent.click(copyBtn);

    await screen.findByText('Copied!');
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });
});
