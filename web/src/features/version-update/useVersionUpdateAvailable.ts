import { useSyncExternalStore } from "react";
import { versionUpdateStore } from "./versionUpdateStore";

/**
 * `true` when a newer app build has been deployed while this tab stayed open and
 * the user has not dismissed the prompt for it. Reads the module-level
 * {@link versionUpdateStore} via `useSyncExternalStore` — no effect, no polling.
 */
export function useVersionUpdateAvailable(): boolean {
  return useSyncExternalStore(
    versionUpdateStore.subscribe,
    versionUpdateStore.getSnapshot,
    versionUpdateStore.getServerSnapshot,
  );
}
