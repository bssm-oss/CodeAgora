/**
 * useApi — Fetch wrapper hook with optional schema validation.
 */

import { useState, useEffect, useCallback } from 'react';

// Structural type compatible with ZodType — no Zod import needed
interface ResponseSchema<T> {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { message: string } };
}

interface UseApiOptions<T> {
  schema?: ResponseSchema<T>;
}

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export type { ResponseSchema };

export function useApi<T>(path: string, options?: UseApiOptions<T>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refetch = useCallback(() => {
    setFetchCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData(): Promise<void> {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('codeagora-token') ?? '';
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const response = await fetch(path, {
          headers,
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const json: unknown = await response.json();

        // Validate response against schema if provided
        if (options?.schema) {
          const result = options.schema.safeParse(json);
          if (!result.success) {
            throw new Error(`Response validation failed: ${result.error.message}`);
          }
          if (!cancelled) {
            setData(result.data);
          }
        } else {
          if (!cancelled) {
            setData(json as T);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  // options.schema is stable (passed once), no need in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, fetchCount]);

  return { data, loading, error, refetch };
}
