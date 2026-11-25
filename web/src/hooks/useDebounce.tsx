import { useLayoutEffect, useMemo, useRef } from "react";

type Debounced<T extends (...args: any[]) => any> = ((
  ...args: Parameters<T>
) => ReturnType<T> | undefined) & { cancel: () => void };

function debounce<T extends (...args: any[]) => any>(
  func: T,
  timeout: number,
  executeFirstCall = false,
): Debounced<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let result: ReturnType<T> | undefined;

  const debounced = (...args: Parameters<T>): ReturnType<T> | undefined => {
    const callNow = executeFirstCall && !timer;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      result = func(...args);
    }, timeout);

    if (callNow) {
      result = func(...args);
    }

    return result;
  };

  debounced.cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  return debounced;
}

export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay = 600,
  executeFirstCall = true,
): Debounced<T> {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useMemo(
    () =>
      debounce(
        (...args: Parameters<T>) => callbackRef.current(...args),
        delay,
        executeFirstCall,
      ),
    [delay, executeFirstCall],
  );
}
