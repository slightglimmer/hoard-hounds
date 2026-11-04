import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data from the API, again whenever `deps` change or reload() is called.
// Keeps showing the previous data while reloading so the page doesn't flash.
export function useQuery(load, deps) {
  const [state, setState] = useState({ data: undefined, error: null, loading: true });
  const latest = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await load();
      if (id === latest.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === latest.current) setState((s) => ({ ...s, error, loading: false }));
    }
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { ...state, reload: run };
}
