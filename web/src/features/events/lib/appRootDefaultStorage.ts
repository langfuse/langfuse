import { useCallback, useSyncExternalStore } from "react";

const STORAGE_CHANGE_EVENT = "langfuse-app-root-default-storage-change";

export const appRootCapabilityStorageKey = (projectId: string) =>
  `events-app-root-capability:v1:${projectId}`;

export const appRootPreferenceStorageKey = (
  userId: string,
  projectId: string,
) => `events-app-root-default:v1:${userId}:${projectId}`;

export const appRootSavedViewSessionStorageKey = (projectId: string) =>
  `observations-events-${projectId}-viewId`;

type BrowserStorage = "localStorage" | "sessionStorage";

const readStorage = (storage: BrowserStorage, key: string): string | null => {
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
    if (value === null) window[storage].removeItem(key);
    else window[storage].setItem(key, value);
    window.dispatchEvent(
      new CustomEvent(STORAGE_CHANGE_EVENT, { detail: { storage, key } }),
    );
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
};

export const useBrowserStorageValue = (
  storage: BrowserStorage,
  key: string,
) => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.storageArea === window[storage] && event.key === key) {
          onStoreChange();
        }
      };
      const onLocalChange = (event: Event) => {
        const detail = (event as CustomEvent).detail as
          | { storage?: BrowserStorage; key?: string }
          | undefined;
        if (detail?.storage === storage && detail.key === key) onStoreChange();
      };

      window.addEventListener("storage", onStorage);
      window.addEventListener(STORAGE_CHANGE_EVENT, onLocalChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(STORAGE_CHANGE_EVENT, onLocalChange);
      };
    },
    [key, storage],
  );
  const getSnapshot = useCallback(
    () => readStorage(storage, key),
    [key, storage],
  );
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
};
