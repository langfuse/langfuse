import { useState, useEffect } from "react";

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
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const storedValue = sessionStorage.getItem(sessionStorageKey);
      return storedValue ? (JSON.parse(storedValue) as T) : initialValue;
    } catch (error) {
      console.error("Error reading from session storage", error);
      return initialValue;
    }
  });

  const clearValue = () => {
    try {
      sessionStorage.removeItem(sessionStorageKey);
      setValue(initialValue);
    } catch (error) {
      console.error("Error clearing session storage", error);
    }
  };

  // Sync state with sessionStorage changes across tabs
  useEffect(() => {
    try {
      sessionStorage.setItem(sessionStorageKey, JSON.stringify(value));
    } catch (error) {
      console.error("Error writing to session storage", error);
    }
  }, [sessionStorageKey, value]);

  return [value, setValue, clearValue] as const;
}

export default useSessionStorage;
