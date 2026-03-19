/**
 * useWebSocket — WebSocket connection hook for real-time events.
 * Features: message buffer cap (500), exponential backoff reconnect.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_MESSAGES = 500;

interface UseWebSocketResult {
  messages: unknown[];
  connected: boolean;
  send: (data: string) => void;
}

export function useWebSocket(path: string): UseWebSocketResult {
  const [messages, setMessages] = useState<unknown[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const unmountedRef = useRef(false);

  const send = useCallback((data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    attemptRef.current = 0;

    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect(): void {
      if (unmountedRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}${path}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmountedRef.current) {
          setConnected(true);
          attemptRef.current = 0;
        }
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed: unknown = JSON.parse(event.data as string);
          setMessages((prev) => {
            const next = [...prev, parsed];
            return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
          });
        } catch {
          // Ignore unparseable messages
        }
      };

      ws.onclose = () => {
        if (unmountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        // Exponential backoff: 1s → 2s → 4s → … → max 30s
        const delay = Math.min(1000 * Math.pow(2, attemptRef.current), 30000);
        attemptRef.current += 1;
        reconnectTimeout = setTimeout(() => connect(), delay);
      };

      ws.onerror = () => {
        if (!unmountedRef.current) {
          setConnected(false);
        }
        // onclose will fire after onerror and handle reconnect
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [path]);

  return { messages, connected, send };
}
