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
 *
 * Staleness gate + persisted suppression (LFE-14765): the banner exists so a
 * long-lived stale tab does not 404 on code-split chunks — but dismiss and the
 * seen-build set lived in memory, so back-to-back deploys re-prompted every tab
 * on every release (a customer reported the banner reappearing after every
 * reload). Prompting minutes after each deploy adds work for thousands of users
 * without addressing chunk breakage, so the banner only appears at all once the
 * running bundle has been superseded for at least
 * {@link VERSION_UPDATE_MIN_STALENESS_MS} — measured from the FIRST observed
 * differing build id for the running build, persisted across reloads and tabs.
 * On top of that, two persisted suppression windows apply: at most one
 * appearance per {@link VERSION_UPDATE_SHOW_THROTTLE_MS}, and an explicit
 * dismiss stays quiet for {@link VERSION_UPDATE_DISMISS_SUPPRESSION_MS}, even
 * for genuinely new build ids. All three gate only the hidden→shown transition
 * (a banner already on screen never hides itself) and degrade to in-memory
 * behavior when storage is unavailable. Keeping old bundles servable — the root
 * cause of chunk 404s — is tracked separately.
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

/**
 * Show throttle (LFE-14765): once the banner has actually appeared, a NEW
 * appearance is blocked until this much time has passed since that appearance —
 * persisted, so it spans reloads and tabs. Sized so a burst of releases (three
 * deploys in an hour) prompts each user once, not once per release.
 */
export const VERSION_UPDATE_SHOW_THROTTLE_MS = 2 * 60 * 60 * 1000;

/**
 * Dismiss suppression (LFE-14765): an explicit dismiss (X) means "not now" —
 * suppress the banner for this long, including for build ids never seen before.
 * Persisted, so a dismiss survives reloads and covers all tabs.
 */
export const VERSION_UPDATE_DISMISS_SUPPRESSION_MS = 24 * 60 * 60 * 1000;

/**
 * Minimum staleness (LFE-14765): the banner only appears at all once the
 * running bundle has been superseded for at least this long. Measured from the
 * first observed differing build id for the running build — "how long has this
 * frontend been superseded", which is what actually breaks code-split chunks —
 * not from a build timestamp (which would need deploy-pipeline support and
 * measures age, not supersession).
 */
export const VERSION_UPDATE_MIN_STALENESS_MS = 48 * 60 * 60 * 1000;

/** localStorage key: epoch ms of the banner's last actual appearance. */
export const VERSION_UPDATE_LAST_SHOWN_AT_KEY = "version-update-last-shown-at";
/** localStorage key: epoch ms until which an explicit dismiss suppresses the banner. */
export const VERSION_UPDATE_SUPPRESSED_UNTIL_KEY =
  "version-update-suppressed-until";
/**
 * localStorage key: JSON `{ buildId, ts }` — when the RUNNING build (`buildId`)
 * was first observed superseded. A single overwritten entry, not one key per
 * build, so storage never accumulates.
 */
export const VERSION_UPDATE_STALE_SINCE_KEY = "version-update-stale-since";

export type VersionUpdateStore = {
  /** Subscribe to snapshot changes (for `useSyncExternalStore`). */
  subscribe: (listener: () => void) => () => void;
  /**
   * Current snapshot: is an update available, not yet dismissed, AND has the
   * new-version debounce ({@link VERSION_UPDATE_DEBOUNCE_MS}) elapsed? A
   * hidden→shown transition additionally requires the running build to have
   * been superseded for at least {@link VERSION_UPDATE_MIN_STALENESS_MS} and
   * the persisted suppression windows (show throttle / dismiss suppression,
   * LFE-14765) to have expired.
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
   * already-seen build (an old pod during a rolling deploy). Also persists a
   * {@link VERSION_UPDATE_DISMISS_SUPPRESSION_MS} suppression window
   * (LFE-14765), so even genuinely new builds stay quiet for that long.
   */
  dismiss: () => void;
  /**
   * Returns `true` exactly once per appearance, `false` afterwards; the flag
   * resets when a genuinely new build id arrives (a fresh appearance). Kept in
   * the store — not in component state — so the `banner_shown` analytics event
   * fires once per logical appearance even if the banner component unmounts and
   * remounts in between (e.g. AppLayout switching between AuthenticatedLayout
   * and MinimalLayout), and once (not twice) under a StrictMode double-invoked
   * effect. A `true` return is the store's "the banner actually showed" signal,
   * so it also records the persisted last-shown timestamp for the show throttle
   * (LFE-14765).
   */
  markShownReported: () => boolean;
};

/**
 * Injection points for {@link createVersionUpdateStore} — everything
 * time/persistence-related, so tests are deterministic. The app singleton uses
 * the defaults.
 */
export type VersionUpdateStoreOptions = {
  /**
   * New-version settling window (default {@link VERSION_UPDATE_DEBOUNCE_MS}).
   * A value ≤ 0 disables the debounce (the update is eligible as soon as it is
   * available) and stays synchronous — no timer — which keeps the
   * detection/stickiness tests free of fake timers.
   */
  debounceMs?: number;
  /**
   * How long the running build must have been superseded before the banner may
   * appear (default {@link VERSION_UPDATE_MIN_STALENESS_MS}); ≤ 0 disables the
   * staleness gate.
   */
  minStalenessMs?: number;
  /** Clock backing the persisted gates (default `Date.now`). */
  now?: () => number;
  /**
   * Lazy storage accessor — lazy because module scope must not touch `window`
   * (SSR). May return `undefined` or throw (private mode, hardened contexts,
   * quota): every access is guarded, degrading to in-memory behavior.
   */
  getStorage?: () => Pick<Storage, "getItem" | "setItem"> | undefined;
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
 * All time/persistence inputs are injected via {@link VersionUpdateStoreOptions}
 * for deterministic testing; the app singleton uses the defaults.
 */
export function createVersionUpdateStore(
  getRunningBuildId: () => string | null | undefined,
  {
    debounceMs = VERSION_UPDATE_DEBOUNCE_MS,
    minStalenessMs = VERSION_UPDATE_MIN_STALENESS_MS,
    now = () => Date.now(),
    getStorage = () =>
      typeof window === "undefined" ? undefined : window.localStorage,
  }: VersionUpdateStoreOptions = {},
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
  // When the RUNNING build was first observed superseded (epoch ms). Resolved
  // once, on the first mismatch (see resolveStaleSince); later new builds do
  // not move it — they don't make this tab any less stale.
  let staleSince: number | null = null;

  // Guarded storage access: `getStorage` and Storage methods may throw. On any
  // failure reads yield null and writes are dropped — in-memory behavior only.
  const readTimestamp = (key: string): number | null => {
    try {
      const raw = getStorage()?.getItem(key);
      if (!raw) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };
  const writeTimestamp = (key: string, value: number) => {
    try {
      getStorage()?.setItem(key, String(value));
    } catch {
      // best-effort persistence; the in-memory gates still apply
    }
  };

  // The staleness clock for the running build, shared across tabs/reloads via
  // one JSON `{ buildId, ts }` entry. An entry for a DIFFERENT running build
  // means the tab has since reloaded onto a new bundle → restart at now (and
  // overwrite). A future-dated `ts` (clock moved backward since the write) is
  // likewise restarted rather than honored. Unreadable/garbage → treat as
  // absent; unwritable → the in-memory value still gates this tab.
  const resolveStaleSince = (): number => {
    const t = now();
    const runningBuildId = getRunningBuildId();
    try {
      const raw = getStorage()?.getItem(VERSION_UPDATE_STALE_SINCE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { buildId?: unknown; ts?: unknown };
        if (
          parsed &&
          parsed.buildId === runningBuildId &&
          typeof parsed.ts === "number" &&
          Number.isFinite(parsed.ts) &&
          parsed.ts <= t
        ) {
          return parsed.ts;
        }
      }
    } catch {
      // fall through to a fresh entry
    }
    try {
      getStorage()?.setItem(
        VERSION_UPDATE_STALE_SINCE_KEY,
        JSON.stringify({ buildId: runningBuildId, ts: t }),
      );
    } catch {
      // best-effort persistence; the in-memory value still applies
    }
    return t;
  };

  // Primary gate (LFE-14765): only a frontend superseded at least
  // `minStalenessMs` ago may prompt at all.
  const isStaleEnough = (): boolean =>
    staleSince !== null && now() - staleSince >= minStalenessMs;

  // Persisted suppression (LFE-14765). Checked only on the hidden→shown
  // transition — never hides a banner already on screen. Values written by a
  // clock that has since moved backward (correction, restored VM) are ignored
  // rather than honored — a future-dated timestamp could otherwise suppress
  // until the wall clock catches up, potentially far beyond the window.
  const isSuppressed = (): boolean => {
    const t = now();
    const lastShownAt = readTimestamp(VERSION_UPDATE_LAST_SHOWN_AT_KEY);
    if (
      lastShownAt !== null &&
      lastShownAt <= t && // ignore future-dated
      t < lastShownAt + VERSION_UPDATE_SHOW_THROTTLE_MS
    ) {
      return true;
    }
    const suppressedUntil = readTimestamp(VERSION_UPDATE_SUPPRESSED_UNTIL_KEY);
    return (
      suppressedUntil !== null &&
      t < suppressedUntil &&
      // A valid write is at most one dismiss window ahead of now.
      suppressedUntil <= t + VERSION_UPDATE_DISMISS_SUPPRESSION_MS
    );
  };

  const computeEligible = (): boolean =>
    updateAvailable && !dismissed && debounceElapsed;

  // Cache the snapshot so `getSnapshot` returns a referentially stable value
  // between changes — `useSyncExternalStore` requires this to avoid re-render
  // loops (it compares snapshots with `Object.is`). Starts hidden; every state
  // change funnels through `emitChange`.
  let snapshot = false;

  const emitChange = () => {
    // A visible banner stays visible while eligible (`snapshot ||` — the
    // staleness gate and suppression windows govern new appearances, not the
    // current one).
    const next =
      computeEligible() && (snapshot || (isStaleEnough() && !isSuppressed()));
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
      if (
        observedBuildId &&
        isVersionMismatch(getRunningBuildId(), observedBuildId) &&
        // Already-seen differing build (old pod re-serving it) mutates nothing —
        // re-observation must not flap or reopen a dismiss.
        !seenDifferingBuildIds.has(observedBuildId)
      ) {
        seenDifferingBuildIds.add(observedBuildId);
        updateAvailable = true; // sticky
        // First supersession of the running build → start the staleness clock.
        if (staleSince === null) staleSince = resolveStaleSince();
        // A genuinely new (never-seen) differing build → worth re-prompting even
        // if the user dismissed an earlier one, and worth counting as a fresh
        // appearance for analytics.
        dismissed = false;
        shownReported = false;
        // Arm the settling window on the first new build; a no-op on later ones
        // (the debounce is keyed to the first sighting, not re-armed per build).
        startDebounce();
      }
      // Re-evaluate on EVERY report (not only on new builds): responses are the
      // store's clock ticks, so maturing staleness and expired suppression
      // windows surface a pending update without a dedicated timer. No-op when
      // nothing changed.
      emitChange();
    },
    dismiss() {
      dismissed = true;
      writeTimestamp(
        VERSION_UPDATE_SUPPRESSED_UNTIL_KEY,
        now() + VERSION_UPDATE_DISMISS_SUPPRESSION_MS,
      );
      emitChange();
    },
    markShownReported() {
      if (shownReported) return false;
      shownReported = true;
      // The banner actually showed → start the persisted show throttle.
      writeTimestamp(VERSION_UPDATE_LAST_SHOWN_AT_KEY, now());
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
