import { useEffect, useMemo, useRef } from "react";

function debounce(func: (...args: any[]) => void, timeout: number = 250) {
  let timer: NodeJS.Timeout | null = null;
  return (...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
}
export function useDebounce(
  callback: (...args: any[]) => void,
  delay: number = 250,
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useMemo(
    () => debounce((...args: any[]) => callbackRef.current(...args), delay),
    [delay],
  );
}
