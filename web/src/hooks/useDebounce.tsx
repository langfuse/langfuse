import { useLayoutEffect, useMemo, useRef } from "react";

function debounce<T extends (...args: any[]) => any>(
  func: T,
  timeout: number,
  executeFirstCall: boolean = false,
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let result: ReturnType<T> | undefined;

  return (...args: Parameters<T>): ReturnType<T> | undefined => {
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
}

export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 600,
  executeFirstCall: boolean = true,
): (...args: Parameters<T>) => ReturnType<T> | undefined {
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
