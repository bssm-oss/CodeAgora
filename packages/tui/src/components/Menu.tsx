import React from 'react';
import SelectInput from 'ink-select-input';

interface MenuItem {
  label: string;
  value: string;
}

interface MenuProps {
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}

export function Menu({ items, onSelect }: MenuProps): React.JSX.Element {
  return <SelectInput items={items} onSelect={onSelect} />;
}
