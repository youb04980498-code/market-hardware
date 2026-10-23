import { useCallback, useEffect, useState } from "react";
export function useResource<T>(
  load: () => Promise<T>,
  key: string,
  interval = 0,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    setData(undefined);
    setError("");
    setLoading(true);
    async function run() {
      if (inFlight || !active) return;
      inFlight = true;
      try {
        const value = await load();
        if (active) {
          setData(value);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Service indisponible");
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }
    void run();
    const timer = interval
      ? setInterval(() => void run(), interval)
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    }; /* load is deliberately keyed by serialized request identity */
  }, [key, revision, interval]);
  return { data, error, loading, retry };
}
