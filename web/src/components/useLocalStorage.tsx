import { useState, useEffect } from "react";

/**
 * useLocalStorage is a hook for managing data with the localStorage API.
 *
 * @param {string} localStorageKey - The key under which the value is stored in localStorage.
 * @param {T} initialValue - The initial value of the data to be stored.
 *
 * Note: The object T should be able to be stringified, as it will be stored in localStorage as a string.
 *
 * @return An array with three elements:
 *     value: Current value
 *     setValue: Function to update the value
 *     clearValue: Function to remove value from the local storage.
 *                This function will also reset the value to initial value
 *
 * @template T - The type of the data to be stored in localStorage. It should be a type that can be stringified.
 *
 * @throws Will throw an error if the stringifying the value or accessing local storage fails.
 */
function useLocalStorage<T>(
  localStorageKey: string,
  initialValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") {
      return initialValue;
    }
    try {
      const storedValue = localStorage.getItem(localStorageKey);
      return storedValue ? (JSON.parse(storedValue) as T) : initialValue;
    } catch (error) {
      console.error("Error reading from local storage", error);
      return initialValue;
    }
  });

  const clearValue = () => {
    try {
      localStorage.removeItem(localStorageKey);
      setValue(initialValue);
    } catch (error) {
      console.error("Error clearing local storage", error);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(localStorageKey, JSON.stringify(value));
    } catch (error) {
      console.error("Error writing to local storage", error);
    }
  }, [localStorageKey, value]);

  return [value, setValue, clearValue] as const;
}

export default useLocalStorage;
