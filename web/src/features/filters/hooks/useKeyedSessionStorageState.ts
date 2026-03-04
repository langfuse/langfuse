import { useCallback, useEffect, useState } from "react";

function readSessionStorageValue<T>(params: {
  storageKey: string;
  fallback: T;
}): T {
  const { storageKey, fallback } = params;
  if (typeof window === "undefined") return fallback;

  try {
    const storedValue = sessionStorage.getItem(storageKey);
    return storedValue ? (JSON.parse(storedValue) as T) : fallback;
  } catch (error) {
    console.error("Error reading from session storage", error);
    return fallback;
  }
}

/**
 * Session storage state that rehydrates on key changes before writing.
 * This prevents stale values from the previous key from leaking into the new key.
 */
export function useKeyedSessionStorageState<T>(
  storageKey: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key: storageKey,
    value: readSessionStorageValue({ storageKey, fallback: initialValue }),
  }));

  useEffect(() => {
    if (state.key === storageKey) return;

    setState({
      key: storageKey,
      value: readSessionStorageValue({
        storageKey,
        fallback: initialValue,
      }),
    });
  }, [state.key, storageKey, initialValue]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (state.key !== storageKey) return;

    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state.value));
    } catch (error) {
      console.error("Error writing to session storage", error);
    }
  }, [state.key, state.value, storageKey]);

  const setValue: React.Dispatch<React.SetStateAction<T>> = useCallback(
    (next) => {
      setState((previous) => {
        const baseValue =
          previous.key === storageKey ? previous.value : initialValue;
        const resolved =
          typeof next === "function"
            ? (next as (value: T) => T)(baseValue)
            : next;

        return {
          key: storageKey,
          value: resolved,
        };
      });
    },
    [storageKey, initialValue],
  );

  const clearValue = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(storageKey);
      } catch (error) {
        console.error("Error clearing session storage", error);
      }
    }

    setState({
      key: storageKey,
      value: initialValue,
    });
  }, [storageKey, initialValue]);

  return [state.value, setValue, clearValue] as const;
}
