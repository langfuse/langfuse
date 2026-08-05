/**
 * External store behind the "reload to update" banner (LFE-10978): long-lived
 * tabs on a superseded bundle 404 on code-split chunks, so we offer (never
 * force) a reload. Fed by the tRPC `buildIdLink` (`x-build-id` header on every
 * response); read via `useSyncExternalStore`. Gate chain (LFE-14537, LFE-14765):
 * superseded ≥ 48 h → 3 min deploy debounce → not shown in the last 2 h → not
 * dismissed in the last 24 h. Windows persist in localStorage (shared across
 * tabs/reloads) and degrade to in-memory behavior without storage.
 */

/** True only when both build ids are known and differ; unknown ids prove nothing. */
export function isVersionMismatch(
  runningBuildId: string | null | undefined,
  observedBuildId: string | null | undefined,
): boolean {
  return (
    !!runningBuildId && !!observedBuildId && runningBuildId !== observedBuildId
  );
}

/** Settling window after the FIRST differing build id, so we don't prompt a reload into a mid-rollout deploy (LFE-14537). */
export const VERSION_UPDATE_DEBOUNCE_MS = 3 * 60 * 1000;

/** At most one banner appearance per window, across tabs and reloads. */
export const VERSION_UPDATE_SHOW_THROTTLE_MS = 2 * 60 * 60 * 1000;

/** An explicit dismiss silences the banner this long, even for new build ids. */
export const VERSION_UPDATE_DISMISS_SUPPRESSION_MS = 24 * 60 * 60 * 1000;

/** The running build must have been superseded this long before any prompt. */
export const VERSION_UPDATE_MIN_STALENESS_MS = 48 * 60 * 60 * 1000;

/** localStorage key: epoch ms of the banner's last actual appearance. */
export const VERSION_UPDATE_LAST_SHOWN_AT_KEY = "version-update-last-shown-at";
/** localStorage key: epoch ms until which a dismiss suppresses the banner. */
export const VERSION_UPDATE_SUPPRESSED_UNTIL_KEY =
  "version-update-suppressed-until";
/** localStorage key: JSON `{ buildId, ts }` — when the running build was first seen superseded (single overwritten entry). */
export const VERSION_UPDATE_STALE_SINCE_KEY = "version-update-stale-since";

export type VersionUpdateStore = {
  /** Subscribe to snapshot changes (`useSyncExternalStore`). */
  subscribe: (listener: () => void) => () => void;
  /** Should the banner render right now? */
  getSnapshot: () => boolean;
  /** Always false — the mismatch only exists in a live tab. */
  getServerSnapshot: () => boolean;
  /** Feed a build id from a server response; safe on every response, any value. */
  reportObservedBuildId: (observedBuildId: string | null | undefined) => void;
  /** Hide until a never-seen build id arrives; persists the 24 h suppression. */
  dismiss: () => void;
  /**
   * True exactly once per appearance — store-held so remounts/StrictMode can't
   * double-fire `banner_shown`. A `true` also records the show-throttle stamp.
   */
  markShownReported: () => boolean;
};

/** Injection points for deterministic tests; the app singleton uses the defaults. */
export type VersionUpdateStoreOptions = {
  /** Settling window; ≤ 0 elapses synchronously (no timer). */
  debounceMs?: number;
  /** Required supersession age before the banner may appear; ≤ 0 disables. */
  minStalenessMs?: number;
  now?: () => number;
  /** Lazy (SSR-safe); may return undefined or throw — every access is guarded. */
  getStorage?: () => Pick<Storage, "getItem" | "setItem"> | undefined;
};

/**
 * Build ids are opaque and unorderable, so "update available" is simply "ever
 * saw a build id ≠ ours" — sticky and flap-free while rolling-deploy pods serve
 * mixed responses; reloading converges the tab to whatever is currently served.
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
  // Membership makes re-observation a no-op (no flapping, no dismiss reopen).
  const seenDifferingBuildIds = new Set<string>();
  let updateAvailable = false; // sticky
  let dismissed = false;
  // `banner_shown` once-guard; reset when a genuinely new build id arrives.
  let shownReported = false;
  // One-shot, keyed to the FIRST new build id; `debounceElapsed` stays true.
  let debounceStarted = false;
  let debounceElapsed = false;
  // First-superseded-at for the running build; resolved once, then in-memory.
  let staleSince: number | null = null;

  // Storage may be absent or throw: failed reads → null, writes are dropped.
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
      // best-effort; in-memory gates still apply
    }
  };

  // Adopt a persisted stale-since for the SAME running build; otherwise (other
  // build, future-dated ts, garbage) restart at now and overwrite the entry.
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
      // unreadable → treat as absent
    }
    try {
      getStorage()?.setItem(
        VERSION_UPDATE_STALE_SINCE_KEY,
        JSON.stringify({ buildId: runningBuildId, ts: t }),
      );
    } catch {
      // best-effort; in-memory value still applies
    }
    return t;
  };

  const isStaleEnough = (): boolean =>
    staleSince !== null && now() - staleSince >= minStalenessMs;

  // Future-dated stamps are ignored, not clamped — a clamp floats with `now`
  // and would suppress until the wall clock caught up.
  const isSuppressed = (): boolean => {
    const t = now();
    const lastShownAt = readTimestamp(VERSION_UPDATE_LAST_SHOWN_AT_KEY);
    if (
      lastShownAt !== null &&
      lastShownAt <= t &&
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

  // Cached: `useSyncExternalStore` needs a referentially stable snapshot.
  let snapshot = false;

  const emitChange = () => {
    // Staleness/suppression gate the hidden→shown transition only — a banner
    // already on screen is never hidden by them.
    const next =
      computeEligible() && (snapshot || (isStaleEnough() && !isSuppressed()));
    if (next === snapshot) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  // Armed once, on the first new build id; ≤ 0 elapses synchronously.
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
        !seenDifferingBuildIds.has(observedBuildId) // re-observation = no-op
      ) {
        seenDifferingBuildIds.add(observedBuildId);
        updateAvailable = true;
        if (staleSince === null) staleSince = resolveStaleSince();
        // A never-seen build is a fresh appearance: undo dismiss, re-arm analytics.
        dismissed = false;
        shownReported = false;
        startDebounce();
      }
      // Responses are the clock ticks that mature staleness / expire windows.
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
      writeTimestamp(VERSION_UPDATE_LAST_SHOWN_AT_KEY, now()); // arm the throttle
      return true;
    },
  };
}

/** App singleton; `NEXT_PUBLIC_BUILD_ID` is inlined at build time. */
export const versionUpdateStore = createVersionUpdateStore(
  () => process.env.NEXT_PUBLIC_BUILD_ID,
);
