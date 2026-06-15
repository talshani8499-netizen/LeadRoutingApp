"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PollingState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastUpdated: number | null;
  refresh: () => void;
}

/**
 * Fetch a JSON endpoint immediately and then on an interval. Used to power the
 * live dashboard views — and, for the simulator, the act of polling
 * /api/calls/active also advances the call flow.
 */
export function usePolling<T = unknown>(url: string, intervalMs = 2000): PollingState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const active = useRef(true);

  const fetchOnce = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (active.current) {
        setData(json);
        setError(null);
        setLastUpdated(Date.now());
      }
    } catch (e) {
      if (active.current) setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (active.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    active.current = true;
    fetchOnce();
    const id = setInterval(fetchOnce, intervalMs);
    return () => {
      active.current = false;
      clearInterval(id);
    };
  }, [fetchOnce, intervalMs]);

  return { data, error, loading, lastUpdated, refresh: fetchOnce };
}
