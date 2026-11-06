import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type SetStateAction,
} from "react";
import {
  parseMetadataColumnConfigs,
  type MetadataColumnConfig,
} from "./metadata-columns";

const CHANGE_EVENT = "langfuse:metadata-columns-change";
const EMPTY_COLUMNS: MetadataColumnConfig[] = [];
// Storage may be unavailable or full. Keep preferences usable for this page's
// lifetime, shared by every subscriber to the same project.
const memoryFallback = new Map<string, string>();

function readSnapshot(key: string | null): string | null {
  if (key === null || typeof window === "undefined") return null;
  const fallback = memoryFallback.get(key);
  if (fallback !== undefined) return fallback;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseSnapshot(raw: string | null): MetadataColumnConfig[] {
  if (raw === null) return EMPTY_COLUMNS;
  try {
    return parseMetadataColumnConfigs(JSON.parse(raw));
  } catch {
    return EMPTY_COLUMNS;
  }
}

const getServerSnapshot = () => null;

export function useMetadataColumns(projectId: string, enabled: boolean) {
  const key =
    enabled && projectId
      ? `metadataColumns:observations-events:${projectId}`
      : null;

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (key === null || typeof window === "undefined") return () => {};

      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== key) return;
        memoryFallback.delete(key);
        onChange();
      };
      const onLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === key) onChange();
      };
      window.addEventListener("storage", onStorage);
      window.addEventListener(CHANGE_EVENT, onLocalChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(CHANGE_EVENT, onLocalChange);
      };
    },
    [key],
  );
  const getSnapshot = useCallback(() => readSnapshot(key), [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const metadataColumns = useMemo(() => parseSnapshot(raw), [raw]);

  const setMetadataColumns = useCallback(
    (update: SetStateAction<MetadataColumnConfig[]>) => {
      if (key === null || typeof window === "undefined") return;
      const previous = parseSnapshot(readSnapshot(key));
      const next = typeof update === "function" ? update(previous) : update;
      const serialized = JSON.stringify(parseMetadataColumnConfigs(next));
      try {
        window.localStorage.setItem(key, serialized);
        memoryFallback.delete(key);
      } catch {
        // Browser privacy settings and quota limits are expected states. The
        // in-memory preference still works; no error telemetry is actionable.
        memoryFallback.set(key, serialized);
      }
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
    },
    [key],
  );

  return { metadataColumns, setMetadataColumns };
}
