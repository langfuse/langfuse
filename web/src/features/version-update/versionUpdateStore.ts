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
 *
 * New-version debounce (LFE-14537): a page loaded while the web container is
 * mid-deploy can see the new build id immediately, and prompting a reload right
 * then reloads the tab into the still-switching pod (a broken loading state). So
 * "update available" only flips the snapshot to `true` once at least
 * {@link VERSION_UPDATE_DEBOUNCE_MS} has elapsed since the FIRST new build id was
 * seen — a settling window for the deploy to finish. This gate is combined at the
 * banner with a post-load grace (see `useAppSettled`); both must pass.
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

/**
 * How long after the FIRST new build id is observed before the banner is allowed
 * to appear — a debounce so a deploy that's still switching pods doesn't
 * immediately prompt a reload into a half-deployed state (LFE-14537). Keyed on
 * the first sighting, not re-armed per response, so it can't be starved by a
 * rolling deploy re-serving build ids.
 */
export const VERSION_UPDATE_DEBOUNCE_MS = 3 * 60 * 1000;

export type VersionUpdateStore = {
  /** Subscribe to snapshot changes (for `useSyncExternalStore`). */
  subscribe: (listener: () => void) => () => void;
  /**
   * Current snapshot: is an update available, not yet dismissed, AND has the
   * new-version debounce ({@link VERSION_UPDATE_DEBOUNCE_MS}) elapsed?
   */
  getSnapshot: () => boolean;
  /** SSR snapshot — always `false`; the mismatch only exists in a live tab. */
  getServerSnapshot: () => boolean;
  /**
   * Record a build id observed from a server response. Safe to call on every
   * tRPC response with any value. Once a build id different from the running one
   * has been seen, "update available" is STICKY — later responses (including an
   * old pod still serving the running build during a rolling deploy) can never
   * clear it.
   */
  reportObservedBuildId: (observedBuildId: string | null | undefined) => void;
  /**
   * Dismiss the banner for the current session. It re-shows only when a build id
   * that has NOT been seen before arrives — never on a re-observation of an
   * already-seen build (an old pod during a rolling deploy).
   */
  dismiss: () => void;
  /**
   * Returns `true` exactly once per appearance, `false` afterwards; the flag
   * resets when a genuinely new build id arrives (a fresh appearance). Kept in
   * the store — not in component state — so the `banner_shown` analytics event
   * fires once per logical appearance even if the banner component unmounts and
   * remounts in between (e.g. AppLayout switching between AuthenticatedLayout
   * and MinimalLayout), and once (not twice) under a StrictMode double-invoked
   * effect.
   */
  markShownReported: () => boolean;
};

/**
 * Builds a version-update store. `getRunningBuildId` returns the build id of the
 * bundle this tab is running; injecting it (rather than reading the module-level
 * env directly) keeps the store deterministic and testable.
 *
 * Rolling-deploy correctness: during a rollout, one tab sees responses from
 * BOTH the old and new pods, in any order, and build ids are opaque hashes with
 * no orderable "newer/older". So the store cannot ask "is the observed build
 * newer?" — it asks only "have we ever seen a build id ≠ ours?". That makes the
 * signal:
 *  - **sticky** — a subsequent old-pod response carrying the running build id
 *    cannot flip the banner back off; and
 *  - **flap-free** — re-observing an already-seen build id does nothing, so the
 *    banner does not blink or reopen as responses alternate between pods.
 * Reloading always converges the tab to whatever build is currently served, so
 * "a build ≠ yours exists → offer reload" is the right action even though we
 * can't prove the other build is strictly newer.
 *
 * `debounceMs` is the new-version settling window (default
 * {@link VERSION_UPDATE_DEBOUNCE_MS}); injected for deterministic testing. A
 * value ≤ 0 disables the debounce (the update shows as soon as it is available)
 * and stays synchronous — no timer — which keeps the detection/stickiness tests
 * free of fake timers.
 */
export function createVersionUpdateStore(
  getRunningBuildId: () => string | null | undefined,
  debounceMs: number = VERSION_UPDATE_DEBOUNCE_MS,
): VersionUpdateStore {
  const listeners = new Set<() => void>();
  // Every build id observed that differs from the running one. Membership is
  // what makes re-observation a no-op (no flapping) and dismiss durable.
  const seenDifferingBuildIds = new Set<string>();
  // Sticky: set true the first time a differing build id is seen, never unset.
  let updateAvailable = false;
  let dismissed = false;
  // `banner_shown` analytics guard — true once the current appearance has been
  // reported. Reset when a genuinely new build id arrives (new appearance).
  let shownReported = false;
  // New-version debounce (LFE-14537). `debounceStarted` guards the one-shot
  // timer so it is armed exactly once — on the FIRST new build id, keyed to that
  // sighting (never re-armed by later responses, so a rolling deploy can't
  // starve it). `debounceElapsed` is sticky: once the window passes the update
  // is eligible forever, and a later genuinely-new build re-prompts immediately.
  let debounceStarted = false;
  let debounceElapsed = false;

  const compute = (): boolean =>
    updateAvailable && !dismissed && debounceElapsed;

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

  // Arm the new-version debounce once, on the first new build id. When it
  // elapses the update becomes eligible; the timer emits so a tab that has been
  // sitting on a settling deploy re-renders the banner in without any further
  // response. A non-positive window elapses synchronously (no timer left
  // running). One-shot and self-completing — nothing to clean up.
  const startDebounce = () => {
    if (debounceStarted) return;
    debounceStarted = true;
    if (debounceMs <= 0) {
      debounceElapsed = true;
      return;
    }
    setTimeout(() => {
      debounceElapsed = true;
      emitChange();
    }, debounceMs);
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
      if (!observedBuildId) return;
      if (!isVersionMismatch(getRunningBuildId(), observedBuildId)) return;
      // A differing build id. If we've already seen this exact one, do nothing —
      // re-observation (old pod re-serving it) must not flap or reopen a dismiss.
      if (seenDifferingBuildIds.has(observedBuildId)) return;
      seenDifferingBuildIds.add(observedBuildId);
      updateAvailable = true; // sticky
      // A genuinely new (never-seen) differing build → worth re-prompting even
      // if the user dismissed an earlier one, and worth counting as a fresh
      // appearance for analytics.
      dismissed = false;
      shownReported = false;
      // Arm the settling window on the first new build; a no-op on later ones
      // (the debounce is keyed to the first sighting, not re-armed per build).
      startDebounce();
      emitChange();
    },
    dismiss() {
      dismissed = true;
      emitChange();
    },
    markShownReported() {
      if (shownReported) return false;
      shownReported = true;
      return true;
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
