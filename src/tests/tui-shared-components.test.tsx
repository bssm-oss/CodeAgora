/**
 * Tests for new shared TUI components (Step 2 of Config redesign)
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { Panel } from '@codeagora/tui/components/Panel.js';
import { ScrollableList } from '@codeagora/tui/components/ScrollableList.js';
import { TextInput } from '@codeagora/tui/components/TextInput.js';
import { Toast } from '@codeagora/tui/components/Toast.js';
import { TabBar } from '@codeagora/tui/components/TabBar.js';
import { HelpOverlay } from '@codeagora/tui/components/HelpOverlay.js';

// ============================================================================
// Panel
// ============================================================================

describe('Panel', () => {
  it('renders children inside a bordered box', () => {
    const { lastFrame, unmount } = render(
      <Panel>
        <Text>Hello Panel</Text>
      </Panel>
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Hello Panel');
    // Round border characters
    expect(frame).toContain('\u256d'); // ╭
    unmount();
  });

  it('renders title when provided', () => {
    const { lastFrame, unmount } = render(
      <Panel title="My Title">
        <Text>content</Text>
      </Panel>
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('My Title');
    unmount();
  });
});

// ============================================================================
// ScrollableList
// ============================================================================

describe('ScrollableList', () => {
  it('renders items with selection indicator', () => {
    const items = ['Apple', 'Banana', 'Cherry'];
    const { lastFrame, unmount } = render(
      <ScrollableList
        items={items}
        selectedIndex={1}
        renderItem={(item, _i, isSelected) => (
          <Text>{isSelected ? `[${item}]` : item}</Text>
        )}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[Banana]');
    expect(frame).toContain('Apple');
    expect(frame).toContain('Cherry');
    unmount();
  });

  it('shows empty message when no items', () => {
    const { lastFrame, unmount } = render(
      <ScrollableList
        items={[]}
        selectedIndex={0}
        emptyMessage="Nothing here"
        renderItem={() => <Text>x</Text>}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Nothing here');
    unmount();
  });

  it('shows scroll indicator when items exceed viewport', () => {
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`);
    const { lastFrame, unmount } = render(
      <ScrollableList
        items={items}
        selectedIndex={0}
        height={5}
        renderItem={(item) => <Text>{item}</Text>}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('more below');
    unmount();
  });

  it('shows "more above" indicator when scrolled past top', () => {
    const items = Array.from({ length: 20 }, (_, i) => `Item ${i}`);
    const { lastFrame, unmount } = render(
      <ScrollableList
        items={items}
        selectedIndex={15}
        height={5}
        renderItem={(item) => <Text>{item}</Text>}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('more above');
    unmount();
  });

  it('clamps selectedIndex to last item when out of bounds', () => {
    const items = ['Alpha', 'Beta', 'Gamma'];
    // selectedIndex 10 is well beyond the 3-item list
    const { lastFrame, unmount } = render(
      <ScrollableList
        items={items}
        selectedIndex={10}
        renderItem={(item, _i, isSelected) => (
          <Text>{isSelected ? `[${item}]` : item}</Text>
        )}
      />
    );
    const frame = lastFrame() ?? '';
    // Should render without crashing and the last item should be selected
    expect(frame).toContain('[Gamma]');
    unmount();
  });
});

// ============================================================================
// TextInput
// ============================================================================

describe('TextInput', () => {
  it('renders value with cursor', () => {
    const { lastFrame, unmount } = render(
      <TextInput value="hello" isActive={true} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('hello');
    expect(frame).toContain('_'); // cursor
    unmount();
  });

  it('renders placeholder when value is empty', () => {
    const { lastFrame, unmount } = render(
      <TextInput value="" placeholder="Type here..." isActive={true} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Type here...');
    unmount();
  });

  it('masks value when mask is true', () => {
    const { lastFrame, unmount } = render(
      <TextInput value="secret12345" mask={true} isActive={true} />
    );
    const frame = lastFrame() ?? '';
    // Should show bullets except last 4 chars
    expect(frame).toContain('2345');
    expect(frame).toContain('\u2022'); // bullet char
    expect(frame).not.toContain('secret1');
    unmount();
  });

  it('renders label when provided', () => {
    const { lastFrame, unmount } = render(
      <TextInput value="val" label="Name" isActive={true} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Name');
    expect(frame).toContain('val');
    unmount();
  });
});

// ============================================================================
// Toast
// ============================================================================

describe('Toast', () => {
  it('renders message when visible', () => {
    const { lastFrame, unmount } = render(
      <Toast message="Saved!" type="success" visible={true} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Saved!');
    expect(frame).toContain('\u2713'); // ✓
    unmount();
  });

  it('renders nothing when not visible', () => {
    const { lastFrame, unmount } = render(
      <Toast message="Saved!" type="success" visible={false} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toBe('');
    unmount();
  });

  it('shows error icon for error type', () => {
    const { lastFrame, unmount } = render(
      <Toast message="Failed!" type="error" visible={true} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('\u2717'); // ✗
    expect(frame).toContain('Failed!');
    unmount();
  });
});

// ============================================================================
// TabBar
// ============================================================================

describe('TabBar', () => {
  const tabs = [
    { id: 'tab1', label: 'First' },
    { id: 'tab2', label: 'Second' },
    { id: 'tab3', label: 'Third' },
  ];

  it('renders all tab labels', () => {
    const { lastFrame, unmount } = render(
      <TabBar tabs={tabs} activeTab="tab1" />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('1.First');
    expect(frame).toContain('2.Second');
    expect(frame).toContain('3.Third');
    unmount();
  });

  it('highlights active tab', () => {
    const { lastFrame, unmount } = render(
      <TabBar tabs={tabs} activeTab="tab2" />
    );
    const frame = lastFrame() ?? '';
    // Active tab should contain '2.Second'
    expect(frame).toContain('2.Second');
    unmount();
  });
});

// ============================================================================
// HelpOverlay
// ============================================================================

describe('HelpOverlay', () => {
  const bindings = [
    { key: 'j/k', description: 'Navigate' },
    { key: 'Enter', description: 'Select' },
    { key: 'q', description: 'Quit' },
  ];

  it('renders bindings when visible', () => {
    const { lastFrame, unmount } = render(
      <HelpOverlay bindings={bindings} visible={true} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('j/k');
    expect(frame).toContain('Navigate');
    expect(frame).toContain('Enter');
    expect(frame).toContain('Select');
    expect(frame).toContain('q');
    expect(frame).toContain('Quit');
    unmount();
  });

  it('renders nothing when not visible', () => {
    const { lastFrame, unmount } = render(
      <HelpOverlay bindings={bindings} visible={false} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toBe('');
    unmount();
  });

  it('shows custom title', () => {
    const { lastFrame, unmount } = render(
      <HelpOverlay bindings={bindings} visible={true} title="Help Menu" />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Help Menu');
    unmount();
  });
});
