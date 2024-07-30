import { useLayoutEffect, useMemo, useRef } from "react";

function debounce(
  func: (...args: any[]) => void,
  timeout: number,
  executeFirstCall: boolean = false,
) {
  let timer: NodeJS.Timeout | null = null;

  return (...args: any[]) => {
    const callNow = executeFirstCall && !timer;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      func(...args);
    }, timeout);

    if (callNow) {
      func(...args);
    }
  };
}
export function useDebounce(
  callback: (...args: any[]) => void,
  delay: number = 400,
  executeFirstCall: boolean = true,
) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useMemo(
    () =>
      debounce(
        (...args: any[]) => callbackRef.current(...args),
        delay,
        executeFirstCall,
      ),
    [delay, executeFirstCall],
  );
}
