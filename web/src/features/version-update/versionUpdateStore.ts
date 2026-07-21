/**
 * External store tracking whether a newer app build has been deployed while the
 * current tab stayed open.
 *
 * Frequent deploys + long-lived tabs leave a tab running a stale JS bundle,
 * which then 404s on code-split chunks and mints stale-fingerprint Sentry noise
 * (LFE-10978, §4.9). This store powers a persistent "reload to update" banner so
 * the user can refresh on their own terms — we NEVER auto-reload (that would
 * throw away unsaved work: open annotations, editors, ...).
 *
 * It is fed imperatively from the tRPC `buildIdLink` (see `src/utils/api.ts`),
 * which captures the `x-build-id` response header on every tRPC response. React
 * reads it via {@link useVersionUpdateAvailable} (a `useSyncExternalStore` hook)
 * — no polling, no effect-driven state sync.
 */

/**
 * True only when both build ids are present and they differ. When either id is
 * missing we cannot conclude anything (a self-hosted build without
 * `NEXT_PUBLIC_BUILD_ID`, or a response that carried no `x-build-id`), so we
 * stay silent rather than nag on a false positive.
 */
export function isVersionMismatch(
  runningBuildId: string | null | undefined,
  observedBuildId: string | null | undefined,
): boolean {
  return (
    !!runningBuildId && !!observedBuildId && runningBuildId !== observedBuildId
  );
}

export type VersionUpdateStore = {
  /** Subscribe to snapshot changes (for `useSyncExternalStore`). */
  subscribe: (listener: () => void) => () => void;
  /** Current snapshot: is an update available and not yet dismissed? */
  getSnapshot: () => boolean;
  /** SSR snapshot — always `false`; the mismatch only exists in a live tab. */
  getServerSnapshot: () => boolean;
  /**
   * Record a build id observed from a server response. Safe to call on every
   * tRPC response with any value; it only changes the snapshot when it reveals a
   * genuinely newer build than the one already seen.
   */
  reportObservedBuildId: (observedBuildId: string | null | undefined) => void;
  /**
   * Dismiss the banner for the current session. It re-shows only if an even
   * newer build id arrives later (the user has already seen this one).
   */
  dismiss: () => void;
};

/**
 * Builds a version-update store. `getRunningBuildId` returns the build id of the
 * bundle this tab is running; injecting it (rather than reading the module-level
 * env directly) keeps the store deterministic and testable.
 */
export function createVersionUpdateStore(
  getRunningBuildId: () => string | null | undefined,
): VersionUpdateStore {
  const listeners = new Set<() => void>();
  let latestBuildId: string | null = null;
  let dismissedBuildId: string | null = null;

  const compute = (): boolean =>
    isVersionMismatch(getRunningBuildId(), latestBuildId) &&
    latestBuildId !== dismissedBuildId;

  // Cache the snapshot so `getSnapshot` returns a referentially stable value
  // between changes — `useSyncExternalStore` requires this to avoid re-render
  // loops (it compares snapshots with `Object.is`).
  let snapshot = compute();

  const emitChange = () => {
    const next = compute();
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    getServerSnapshot() {
      return false;
    },
    reportObservedBuildId(observedBuildId) {
      if (!observedBuildId || observedBuildId === latestBuildId) return;
      latestBuildId = observedBuildId;
      emitChange();
    },
    dismiss() {
      dismissedBuildId = latestBuildId;
      emitChange();
    },
  };
}

/**
 * App-wide singleton, wired to the running build id. `NEXT_PUBLIC_BUILD_ID` is
 * inlined into the client bundle at build time, so this reflects the exact
 * bundle the tab loaded.
 */
export const versionUpdateStore = createVersionUpdateStore(
  () => process.env.NEXT_PUBLIC_BUILD_ID,
);
