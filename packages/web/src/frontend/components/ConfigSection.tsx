/**
 * ConfigSection — Collapsible config section with title and description.
 * Used to organize the config form into logical groups.
 */

import React, { useState } from 'react';

interface ConfigSectionProps {
  title: string;
  description: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function ConfigSection({
  title,
  description,
  defaultExpanded = false,
  children,
}: ConfigSectionProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`config-section ${expanded ? 'config-section--expanded' : ''}`}>
      <button
        className="config-section__header"
        onClick={() => setExpanded(!expanded)}
        type="button"
        aria-expanded={expanded}
      >
        <div className="config-section__header-left">
          <span className="config-section__toggle">{expanded ? '\u25BC' : '\u25B6'}</span>
          <div>
            <h3 className="config-section__title">{title}</h3>
            <p className="config-section__description">{description}</p>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="config-section__body">
          {children}
        </div>
      )}
    </div>
  );
}

export type { ConfigSectionProps };
