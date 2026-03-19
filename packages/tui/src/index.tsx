import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export function startTui(): void {
  // Enter alternate screen buffer — preserves terminal history on exit
  process.stdout.write('\x1b[?1049h');

  const instance = render(React.createElement(App));

  // Leave alternate screen buffer when the render instance unmounts/exits
  instance.waitUntilExit().finally(() => {
    process.stdout.write('\x1b[?1049l');
  });
}
