import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

/**
 * Detects whether the current page arrival is a *revisit* of a browser
 * history entry (Back/Forward) rather than a fresh navigation (LFE-10715).
 *
 * The session-detail page auto-applies a default view when the URL carries no
 * `viewId`. That is only correct on a fresh arrival: when the user reaches a
 * param-less URL through Back/Forward, the entry's state — including "no view
 * selected" — was already decided when the entry was live, and re-applying
 * the default would overwrite it (pre-fix it even *pushed*, so Back bounced
 * forward and was unusable).
 *
 * Mechanism: the Next.js Pages Router stamps every history entry with a
 * stable per-entry `key` in `window.history.state` (`replaceState` keeps the
 * current key, `pushState` mints a new one). An entry's key is recorded in
 * sessionStorage when the entry is *left* — in-page query navigation,
 * page-leave unmount — never on arrival, so a StrictMode double-mount cannot
 * poison a fresh arrival, and a reload (same key, never left) still counts as
 * fresh. Arriving on a recorded key ⇒ revisit.
 *
 * The decision is snapshotted per arrival (mount, or `scopeKey` change for
 * in-place detail navigation like prev/next session) and stays stable for
 * that arrival's lifetime; same-mount pops are the caller's concern. Missing
 * key or unavailable sessionStorage degrades to "fresh".
 */

const STORAGE_KEY = "lf-visited-history-entries";
const MAX_TRACKED_ENTRIES = 100;

const readHistoryEntryKey = (): string | null => {
  if (typeof window === "undefined") return null;
  const state: unknown = window.history.state;
  if (typeof state !== "object" || state === null) return null;
  const key = (state as { key?: unknown }).key;
  return typeof key === "string" ? key : null;
};

const readVisitedKeys = (): string[] => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === "string")
      : [];
  } catch {
    return [];
  }
};

const wasHistoryEntryVisited = (key: string): boolean =>
  readVisitedKeys().includes(key);

const markHistoryEntryVisited = (key: string): void => {
  try {
    const keys = readVisitedKeys().filter((visited) => visited !== key);
    keys.push(key);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(keys.slice(-MAX_TRACKED_ENTRIES)),
    );
  } catch {
    // sessionStorage unavailable → every arrival counts as fresh.
  }
};

export function useHistoryEntryRevisit(scopeKey: string): boolean {
  const router = useRouter();

  // Guarded render-phase snapshot (same pattern as the session page's
  // initialViewIdSessionRef): computed once per arrival, before any effect
  // can record the entry, and preserved across StrictMode remounts.
  const decisionRef = useRef<{ scope: string; revisit: boolean } | null>(null);
  if (decisionRef.current === null || decisionRef.current.scope !== scopeKey) {
    const entryKey = readHistoryEntryKey();
    decisionRef.current = {
      scope: scopeKey,
      revisit: entryKey !== null && wasHistoryEntryVisited(entryKey),
    };
  }

  // Record the active entry as visited when it is left: cleanup fires on
  // every asPath change (in-page pushes/pops included) and on unmount.
  const asPath = router.asPath;
  useEffect(() => {
    const entryKey = readHistoryEntryKey();
    if (entryKey === null) return;
    return () => markHistoryEntryVisited(entryKey);
  }, [asPath]);

  return decisionRef.current.revisit;
}
