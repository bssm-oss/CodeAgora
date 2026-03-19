/**
 * ConfigPreview — JSON preview of the current config state.
 * Syntax-highlighted read-only code block with copy to clipboard.
 */

import React, { useState, useCallback } from 'react';

interface ConfigPreviewProps {
  config: Record<string, unknown>;
}

interface TokenSpan {
  text: string;
  className: string;
}

/**
 * Tokenize a JSON string into spans with syntax class names.
 * Uses safe React elements instead of innerHTML.
 */
function tokenizeLine(line: string): TokenSpan[] {
  const tokens: TokenSpan[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Match leading whitespace
    const wsMatch = remaining.match(/^(\s+)/);
    if (wsMatch) {
      tokens.push({ text: wsMatch[1], className: '' });
      remaining = remaining.slice(wsMatch[1].length);
      continue;
    }

    // Match JSON key (quoted string followed by colon)
    const keyMatch = remaining.match(/^("(?:[^"\\]|\\.)*")(\s*:)/);
    if (keyMatch) {
      tokens.push({ text: keyMatch[1], className: 'json-key' });
      tokens.push({ text: keyMatch[2], className: '' });
      remaining = remaining.slice(keyMatch[0].length);
      continue;
    }

    // Match string value
    const strMatch = remaining.match(/^("(?:[^"\\]|\\.)*")/);
    if (strMatch) {
      tokens.push({ text: strMatch[1], className: 'json-string' });
      remaining = remaining.slice(strMatch[1].length);
      continue;
    }

    // Match number
    const numMatch = remaining.match(/^(-?\d+\.?\d*)/);
    if (numMatch) {
      tokens.push({ text: numMatch[1], className: 'json-number' });
      remaining = remaining.slice(numMatch[1].length);
      continue;
    }

    // Match boolean
    const boolMatch = remaining.match(/^(true|false)/);
    if (boolMatch) {
      tokens.push({ text: boolMatch[1], className: 'json-boolean' });
      remaining = remaining.slice(boolMatch[1].length);
      continue;
    }

    // Match null
    const nullMatch = remaining.match(/^(null)/);
    if (nullMatch) {
      tokens.push({ text: nullMatch[1], className: 'json-null' });
      remaining = remaining.slice(nullMatch[1].length);
      continue;
    }

    // Match structural characters and other text
    tokens.push({ text: remaining[0], className: '' });
    remaining = remaining.slice(1);
  }

  return tokens;
}

export function ConfigPreview({ config }: ConfigPreviewProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const jsonStr = JSON.stringify(config, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  }, [jsonStr]);

  const lines = jsonStr.split('\n');

  return (
    <div className="config-preview">
      <div className="config-preview__header">
        <span className="config-preview__title">JSON Preview</span>
        <button
          className="config-preview__copy"
          onClick={handleCopy}
          type="button"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <div className="config-preview__code">
        {lines.map((line, i) => {
          const tokens = tokenizeLine(line);
          return (
            <div key={i} className="json-line">
              <span className="json-line-number">{i + 1}</span>
              <span>
                {tokens.map((token, j) => (
                  token.className
                    ? <span key={j} className={token.className}>{token.text}</span>
                    : <span key={j}>{token.text}</span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type { ConfigPreviewProps };
