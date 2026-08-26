import { getActiveSpan, getRootSpan, setTag } from "@sentry/nextjs";

/**
 * Isolation-scope tag so browser pageload/navigation metric alerts can split
 * v3 vs v4. Boolean only — never user or project IDs (those stay on `setUser`).
 */
export const V4_BETA_ENABLED_SENTRY_TAG = "v4BetaEnabled";

/**
 * Last-known v4 flag for the next hard pageload. Isolation-scope tags are
 * copied onto the pageload transaction at `Sentry.init`, which runs before
 * session hydrate. Not the intro-dialog key (`v4-beta-intro-dialog-seen`).
 */
export const V4_BETA_ENABLED_STORAGE_KEY = "v4BetaEnabled";

function getLocalStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readCachedV4BetaEnabled(): boolean | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(V4_BETA_ENABLED_STORAGE_KEY);
    if (raw === "true") {
      return true;
    }
    if (raw === "false") {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedV4BetaEnabled(enabled: boolean): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(V4_BETA_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // quota / private mode — tagging still proceeds
  }
}

function removeCachedV4BetaEnabled(): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(V4_BETA_ENABLED_STORAGE_KEY);
  } catch {
    // quota / private mode
  }
}

function stampActiveRootSpan(value: boolean | undefined): void {
  const activeSpan = getActiveSpan();
  if (!activeSpan) {
    return;
  }
  // `undefined` removes the attribute so logout does not leave a stale v3/v4
  // label on an in-flight pageload/navigation span.
  getRootSpan(activeSpan).setAttribute(V4_BETA_ENABLED_SENTRY_TAG, value);
}

/**
 * Tag the isolation scope from the last-known cache so the pageload
 * transaction that starts at `Sentry.init` is already labeled. Missing or
 * invalid cache leaves the tag unset rather than guessing false. Does not
 * stamp the root span: none exists yet.
 */
export function applyCachedV4BetaEnabledSentryTag(): void {
  try {
    const cached = readCachedV4BetaEnabled();
    if (cached === null) {
      return;
    }
    setTag(V4_BETA_ENABLED_SENTRY_TAG, cached);
  } catch {
    // Never block Sentry.init
  }
}

/**
 * Apply `v4BetaEnabled` to the current Sentry isolation scope and, when a
 * pageload/navigation span is still open, to that root span. Also persist the
 * last-known flag so the next hard pageload can tag before `Sentry.init`.
 */
export function setV4BetaEnabledSentryTag(enabled: boolean | undefined): void {
  const value = enabled === true;
  writeCachedV4BetaEnabled(value);
  setTag(V4_BETA_ENABLED_SENTRY_TAG, value);
  stampActiveRootSpan(value);
}

/** Drop the tag and cache on logout so anonymous events are not labeled as v3. */
export function clearV4BetaEnabledSentryTag(): void {
  removeCachedV4BetaEnabled();
  setTag(V4_BETA_ENABLED_SENTRY_TAG, undefined);
  stampActiveRootSpan(undefined);
}
