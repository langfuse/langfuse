import { useState, useEffect, useCallback, useMemo, useRef } from "react";

/**
 * useLocalStorage is a hook for managing data with the localStorage API.
 * It provides cross-tab synchronization and safe interaction with localStorage.
 *
 * @param {string} localStorageKey - The key under which the value is stored in localStorage.
 * @param {T} initialValue - The initial value of the data to be stored.
 *
 * Note: The object T should be able to be stringified, as it will be stored in localStorage as a string.
 *
 * @return An array with three elements:
 *     value: Current value
 *     setValue: Function to update the value and sync across tabs
 *     clearValue: Function to remove value from the local storage.
 *                This function will also reset the value to initial value
 *
 * @template T - The type of the data to be stored in localStorage. It should be a type that can be stringified.
 *
 * @throws Will throw an error if the stringifying the value or accessing local storage fails.
 *
 * @example
 * const [theme, setTheme, clearTheme] = useLocalStorage('theme', 'light');
 * // Use theme value
 * // Call setTheme to update
 * // Call clearTheme to reset to 'light'
 */
function useLocalStorage<T>(
  localStorageKey: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  // Initialize state with value from localStorage or initial value
  // This initialization is only run once when the component mounts
  const [value, setValue] = useState<T>(() => {
    // Return initial value if running on server-side
    if (typeof window === "undefined") return initialValue;

    try {
      const stored = localStorage.getItem(localStorageKey);
      // Parse stored value if it exists, otherwise use initial value
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch (error) {
      console.error("Error reading from local storage", error);
      return initialValue;
    }
  });
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Helper object to safely interact with localStorage
  // Handles all error cases and provides consistent interface
  const safeLocalStorage = useMemo(
    () => ({
      set: (value: T) => {
        try {
          const stringified = JSON.stringify(value);
          localStorage.setItem(localStorageKey, stringified);
          return stringified;
        } catch (error) {
          console.error("Error writing to local storage", error);
          return null;
        }
      },
      remove: () => {
        try {
          localStorage.removeItem(localStorageKey);
        } catch (error) {
          console.error("Error clearing local storage", error);
        }
      },
    }),
    [localStorageKey],
  );

  // Function to clear both localStorage and state
  const clearValue = () => {
    safeLocalStorage.remove();
    valueRef.current = initialValue;
    setValue(initialValue);
  };

  // Sync to localStorage whenever value changes
  // This ensures localStorage always has the latest value
  useEffect(() => {
    safeLocalStorage.set(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStorageKey, value]);

  // Handle cross-tab synchronization
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Handler for native localStorage events (triggered by other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === localStorageKey) {
        try {
          const nextValue = e.newValue
            ? (JSON.parse(e.newValue) as T)
            : initialValue;
          valueRef.current = nextValue;
          setValue(nextValue);
        } catch (error) {
          console.error("Error parsing storage change", error);
        }
      }
    };

    // Handler for custom events (triggered within same tab)
    const handleCustomEvent = (
      e: CustomEvent<{ key: string; newValue: string | null }>,
    ) => {
      if (e.detail.key === localStorageKey) {
        try {
          const nextValue = e.detail.newValue
            ? (JSON.parse(e.detail.newValue) as T)
            : initialValue;
          valueRef.current = nextValue;
          setValue(nextValue);
        } catch (error) {
          console.error("Error parsing custom event", error);
        }
      }
    };

    // Listen for both storage events and custom events
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(
      "localStorageChange",
      handleCustomEvent as EventListener,
    );

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(
        "localStorageChange",
        handleCustomEvent as EventListener,
      );
    };
  }, [localStorageKey, initialValue]);

  // Enhanced setValue function that also notifies other tabs
  const notifySameTabListeners = useCallback(
    (newValue: string | null) => {
      if (typeof window === "undefined") return;

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("localStorageChange", {
            detail: { key: localStorageKey, newValue },
          }),
        );
      }, 0);
    },
    [localStorageKey],
  );

  const setValueAndNotify: React.Dispatch<React.SetStateAction<T>> =
    useCallback(
      (newValue) => {
        const resolvedValue =
          newValue instanceof Function ? newValue(valueRef.current) : newValue;
        valueRef.current = resolvedValue;
        setValue(resolvedValue);

        const stringified = safeLocalStorage.set(resolvedValue);
        if (stringified) {
          notifySameTabListeners(stringified);
        }
      },
      [notifySameTabListeners, safeLocalStorage],
    );

  return [value, setValueAndNotify, clearValue] as const;
}

export default useLocalStorage;
