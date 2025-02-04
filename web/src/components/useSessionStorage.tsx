import { useState, useEffect, useCallback } from "react";

function isClient() {
  return typeof window !== "undefined";
}

/**
 * useSessionStorage is a hook for managing data with the sessionStorage API.
 *
 * @param {string} sessionStorageKey - The key under which the value is stored in sessionStorage.
 * @param {T} initialValue - The initial value of the data to be stored.
 *
 * Note: The object T should be able to be stringified, as it will be stored in sessionStorage as a string.
 *
 * @return An array with three elements:
 *     value: Current value
 *     setValue: Function to update the value
 *     clearValue: Function to remove value from the session storage.
 *                This function will also reset the value to initial value
 *
 * @template T - The type of the data to be stored in sessionStorage. It should be a type that can be stringified.
 *
 * @throws Will throw an error if the stringifying the value or accessing session storage fails.
 */
function useSessionStorage<T>(
  sessionStorageKey: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const readValue = useCallback((): T => {
    if (!isClient()) return initialValue; // Fallback for SSR
    try {
      const storedValue = sessionStorage.getItem(sessionStorageKey);
      return storedValue ? JSON.parse(storedValue) : initialValue;
    } catch (error) {
      console.error("Error reading from session storage", error);
      return initialValue;
    }
  }, [sessionStorageKey, initialValue]);

  const [storedValue, setStoredValue] = useState<T>(readValue);

  const clearValue = () => {
    try {
      sessionStorage.removeItem(sessionStorageKey);
      setValue(initialValue);
    } catch (error) {
      console.error("Error clearing session storage", error);
    }
  };

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const newValue = value instanceof Function ? value(storedValue) : value;
        setStoredValue(newValue);
        if (isClient()) {
          sessionStorage.setItem(sessionStorageKey, JSON.stringify(newValue));
          window.dispatchEvent(new Event("session-storage"));
        }
      } catch (error) {
        console.error("Error reading from session storage", error);
      }
    },
    [sessionStorageKey, storedValue],
  );

  // Sync state with sessionStorage changes across tabs
  useEffect(() => {
    const handleStorageChange = () => {
      setStoredValue(readValue());
    };

    window.addEventListener("session-storage", handleStorageChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("session-storage", handleStorageChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [readValue]);

  return [storedValue, setValue, clearValue] as const;
}

export default useSessionStorage;
