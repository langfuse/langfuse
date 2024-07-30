import { useEffect, useMemo, useRef } from "react";

function debounce(func: (...args: any[]) => void, timeout = 250) {
  let timer: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func(...args);
    }, timeout);
  };
}
export function useDebounce(
  callback: (...args: any[]) => void,
  delay?: number,
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });
  return useMemo(
    () => debounce((...args: any[]) => callbackRef.current(...args), delay),
    [delay],
  );
}
