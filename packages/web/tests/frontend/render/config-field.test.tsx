import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfigField } from '../../../src/frontend/components/ConfigField.js';

describe('ConfigField', () => {
  it('renders text input for string fields', () => {
    render(
      <ConfigField label="API Key" type="text" value="abc123" onChange={vi.fn()} />,
    );

    expect(screen.getByText('API Key')).toBeInTheDocument();
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('abc123');
  });

  it('renders number input for number fields', () => {
    render(
      <ConfigField label="Timeout" type="number" value={30} onChange={vi.fn()} />,
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveValue(30);
  });

  it('renders toggle switch for boolean fields', () => {
    render(
      <ConfigField label="Enabled" type="boolean" value={true} onChange={vi.fn()} />,
    );

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('renders select for enum fields', () => {
    const options = ['option-a', 'option-b', 'option-c'];
    render(
      <ConfigField
        label="Mode"
        type="select"
        value="option-b"
        onChange={vi.fn()}
        options={options}
      />,
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('option-b');
    expect(screen.getByRole('option', { name: 'option-a' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'option-b' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'option-c' })).toBeInTheDocument();
  });

  it('shows validation error message', () => {
    render(
      <ConfigField
        label="URL"
        type="text"
        value=""
        onChange={vi.fn()}
        error="This field is required."
      />,
    );

    expect(screen.getByText('This field is required.')).toBeInTheDocument();
  });

  it('calls onChange with new value on text input change', () => {
    const onChange = vi.fn();
    render(
      <ConfigField label="Name" type="text" value="old" onChange={onChange} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new-value' } });
    expect(onChange).toHaveBeenCalledWith('new-value');
  });
});
