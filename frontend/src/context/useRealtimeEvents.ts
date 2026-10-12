import { useEffect, useState, useRef, useCallback } from 'react';
import { API_BASE_URL } from './AppContext';

export interface RealtimeEvent {
  event: string;
  data: any;
  timestamp?: number;
}

export function useRealtimeEvents(onEvent?: (evt: RealtimeEvent) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const streamUrl = `${API_BASE_URL}/stream/events`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.addEventListener('connected', (e: MessageEvent) => {
      setIsConnected(true);
      try {
        const parsed = JSON.parse(e.data);
        const evtObj = { event: 'connected', data: parsed };
        setLastEvent(evtObj);
        onEventRef.current?.(evtObj);
      } catch {
        // ignore parse error
      }
    });

    es.addEventListener('email_sent', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const evtObj = { event: 'email_sent', data: parsed };
        setLastEvent(evtObj);
        onEventRef.current?.(evtObj);
      } catch {
        // ignore parse error
      }
    });

    es.addEventListener('lead_updated', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const evtObj = { event: 'lead_updated', data: parsed };
        setLastEvent(evtObj);
        onEventRef.current?.(evtObj);
      } catch {
        // ignore parse error
      }
    });

    es.addEventListener('campaign_status_changed', (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const evtObj = { event: 'campaign_status_changed', data: parsed };
        setLastEvent(evtObj);
        onEventRef.current?.(evtObj);
      } catch {
        // ignore parse error
      }
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      // Reconnect with 5s backoff
      setTimeout(() => {
        connect();
      }, 5000);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, lastEvent };
}
