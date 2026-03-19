/**
 * Toast — Notification component for success/error messages.
 * Auto-dismisses after 3 seconds. Fixed position bottom-right with slide-in animation.
 */

import React, { useEffect } from 'react';

type ToastType = 'success' | 'error';

interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss: () => void;
}

export function Toast({ message, type, onDismiss }: ToastProps): React.JSX.Element {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`toast toast--${type}`} role="alert">
      <span className="toast__icon">{type === 'success' ? '\u2713' : '\u2717'}</span>
      <span className="toast__message">{message}</span>
      <button className="toast__close" onClick={onDismiss} type="button" aria-label="Dismiss">
        \u00D7
      </button>
    </div>
  );
}

export type { ToastType, ToastProps };
