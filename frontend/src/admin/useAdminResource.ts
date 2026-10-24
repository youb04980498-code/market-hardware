import { useCallback, useEffect, useRef, useState } from "react";
/** Key changes discard mismatched payloads; refresh retains the last successful value. */
export function useAdminResource<T>(
  load: () => Promise<T>,
  key: string,
  interval = 0,
) {
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error: string;
    loading: boolean;
    at?: string;
  }>({ key, error: "", loading: true });
  const [revision, setRevision] = useState(0);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const retry = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    let active = true,
      inFlight = false;
    async function run() {
      if (inFlight) return;
      inFlight = true;
      setState((s) => ({
        key,
        data: s.key === key ? s.data : undefined,
        at: s.key === key ? s.at : undefined,
        error: "",
        loading: true,
      }));
      try {
        const data = await loader.current();
        if (active)
          setState({
            key,
            data,
            error: "",
            loading: false,
            at: new Date().toISOString(),
          });
      } catch (e) {
        if (active)
          setState((s) => ({
            ...s,
            loading: false,
            error: e instanceof Error ? e.message : "Service indisponible",
          }));
      } finally {
        inFlight = false;
      }
    }
    void run();
    const timer = interval
      ? setInterval(() => void run(), interval)
      : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, revision, interval]);
  return {
    ...state,
    data: state.key === key ? state.data : undefined,
    loading: state.key !== key || state.loading,
    retry,
  };
}
