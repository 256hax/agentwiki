'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type EventHandler = (event: { type: string; id?: string; summary?: string }) => void;

export function useEventStream(onEvent: EventHandler) {
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource('/api/events');

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEventRef.current(data);
      } catch {
        // Ignore parse errors (e.g. ping)
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { connected };
}
