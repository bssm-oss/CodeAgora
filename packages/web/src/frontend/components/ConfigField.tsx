/**
 * ConfigField — Generic form field component.
 * Renders appropriate input based on field type: text, number, boolean, select, array.
 * Controlled component pattern with label, description, and validation error display.
 */

import React, { useState, useCallback } from 'react';

type ConfigFieldType = 'text' | 'number' | 'boolean' | 'select' | 'array';

interface ConfigFieldProps {
  label: string;
  description?: string;
  type: ConfigFieldType;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string | null;
  options?: readonly string[];
  placeholder?: string;
  disabled?: boolean;
}

export function ConfigField({
  label,
  description,
  type,
  value,
  onChange,
  error,
  options,
  placeholder,
  disabled = false,
}: ConfigFieldProps): React.JSX.Element {
  return (
    <div className={`config-field ${error ? 'config-field--error' : ''}`}>
      <label className="config-field__label">
        {label}
        {description && <span className="config-field__description">{description}</span>}
      </label>
      <div className="config-field__input-wrapper">
        {renderInput(type, value, onChange, options, placeholder, disabled)}
      </div>
      {error && <span className="config-field__error">{error}</span>}
    </div>
  );
}

function renderInput(
  type: ConfigFieldType,
  value: unknown,
  onChange: (value: unknown) => void,
  options?: readonly string[],
  placeholder?: string,
  disabled?: boolean,
): React.JSX.Element {
  switch (type) {
    case 'boolean':
      return (
        <ToggleSwitch
          checked={Boolean(value)}
          onChange={(checked) => onChange(checked)}
          disabled={disabled}
        />
      );

    case 'number':
      return (
        <input
          className="config-field__input config-field__input--number"
          type="number"
          value={value === undefined || value === null ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          placeholder={placeholder}
          disabled={disabled}
        />
      );

    case 'select':
      return (
        <select
          className="config-field__select"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        >
          {(options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'array':
      return (
        <ArrayField
          items={Array.isArray(value) ? (value as string[]) : []}
          onChange={(items) => onChange(items)}
          placeholder={placeholder}
          disabled={disabled}
        />
      );

    default:
      return (
        <input
          className="config-field__input"
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      );
  }
}

// ============================================================================
// Toggle Switch Sub-component
// ============================================================================

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ checked, onChange, disabled }: ToggleSwitchProps): React.JSX.Element {
  return (
    <button
      className={`toggle-switch ${checked ? 'toggle-switch--on' : ''} ${disabled ? 'toggle-switch--disabled' : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
    >
      <span className="toggle-switch__thumb" />
    </button>
  );
}

// ============================================================================
// Array Field Sub-component
// ============================================================================

interface ArrayFieldProps {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

function ArrayField({ items, onChange, placeholder, disabled }: ArrayFieldProps): React.JSX.Element {
  const [newItem, setNewItem] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setNewItem('');
    }
  }, [newItem, items, onChange]);

  const handleRemove = useCallback((index: number) => {
    onChange(items.filter((_, i) => i !== index));
  }, [items, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }, [handleAdd]);

  return (
    <div className="array-field">
      <div className="array-field__items">
        {items.map((item, index) => (
          <span key={`${item}-${index}`} className="array-field__tag">
            {item}
            {!disabled && (
              <button
                className="array-field__tag-remove"
                onClick={() => handleRemove(index)}
                type="button"
                aria-label={`Remove ${item}`}
              >
                \u00D7
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="array-field__add">
          <input
            className="config-field__input array-field__input"
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? 'Add item...'}
          />
          <button
            className="array-field__add-button"
            onClick={handleAdd}
            type="button"
            disabled={!newItem.trim()}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export type { ConfigFieldType, ConfigFieldProps };
