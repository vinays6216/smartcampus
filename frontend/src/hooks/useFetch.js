import { useCallback, useEffect, useState } from 'react';
import { errMsg } from '../utils/helpers';

// const f = useFetch(() => get('/materials'), [deps]);
// f.body = whole response body, f.data = body.data, f.loading, f.error, f.reload()
export default function useFetch(fn, deps = []) {
  const [state, setState] = useState({ body: null, loading: true, error: null });

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const body = await fn();
      setState({ body, loading: false, error: null });
    } catch (e) {
      setState({ body: null, loading: false, error: errMsg(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { run(); }, [run]);

  return { ...state, data: state.body ? state.body.data : undefined, reload: run };
}
