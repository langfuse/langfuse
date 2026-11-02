import { useCallback, useSyncExternalStore } from "react";

type BrowserStorage = "localStorage" | "sessionStorage";
const localListeners = new Set<() => void>();

export const appRootPreferenceStorageKey = (projectId: string) =>
  `events-filter-app-root-default:${projectId}`;
export const appRootSavedViewSessionStorageKey = (projectId: string) =>
  `observations-events-${projectId}-viewId`;

const readStorage = (storage: BrowserStorage, key: string) => {
  if (typeof window === "undefined") return null;
  try {
    return window[storage].getItem(key);
  } catch {
    return null;
  }
};

export const writeStorage = (
  storage: BrowserStorage,
  key: string,
  value: string | null,
) => {
  if (typeof window === "undefined") return;
  try {
    value === null
      ? window[storage].removeItem(key)
      : window[storage].setItem(key, value);
    localListeners.forEach((listener) => listener());
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
};

export const useBrowserStorageValue = (
  storage: BrowserStorage,
  key: string,
) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === window[storage] && event.key === key) {
          listener();
        }
      };
      localListeners.add(listener);
      window.addEventListener("storage", onStorage);
      return () => {
        localListeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key, storage],
  );
  const getSnapshot = useCallback(
    () => readStorage(storage, key),
    [key, storage],
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
};
