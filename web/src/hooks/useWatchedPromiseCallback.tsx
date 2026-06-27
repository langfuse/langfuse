import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";

/**
 * Wraps a callback that returns a `Promise` with an in-flight loading state.
 *
 * Mirrors `useCallback` by accepting a dependency list and returning a stable
 * callback, but also exposes whether the wrapped callback currently has an
 * unresolved promise. The provided callback must return a `Promise`. Repeated
 * calls while a promise is in flight reuse the same promise instead of
 * starting duplicate work.
 */
export function useWatchedPromiseCallback<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => Promise<TResult>,
  dependencies: DependencyList,
) {
  const [isLoading, setIsLoading] = useState(false);
  const inFlightPromiseRef = useRef<Promise<TResult> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const watchedCallback = useCallback(
    (...args: TArgs) => {
      if (inFlightPromiseRef.current) {
        return inFlightPromiseRef.current;
      }

      setIsLoading(true);

      const watchedPromise = callback(...args).finally(() => {
        if (inFlightPromiseRef.current === watchedPromise) {
          inFlightPromiseRef.current = null;
        }

        if (isMountedRef.current) {
          setIsLoading(false);
        }
      });

      inFlightPromiseRef.current = watchedPromise;

      return watchedPromise;
    },
    // react-hooks/exhaustive-deps cannot inspect forwarded dependency arrays, so callers
    // are responsible for passing the same dependencies they would give useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencies,
  );

  return [watchedCallback, isLoading] as const;
}
