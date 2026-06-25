import { useQueryParams, StringParam } from "use-query-params";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  rangeToString,
  resolveTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";

/**
 * localStorage key prefix for the persisted global time range. The active key
 * is scoped per project so a tightly-zoomed debugging range in one project does
 * not leak into another.
 */
export const GLOBAL_DATE_RANGE_STORAGE_KEY = "langfuse-global-date-range";

export interface UseGlobalDateRangeOutput {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
}

/** Reads the persisted meta-format token for a project-scoped key. */
function readStoredRange(storageKey: string | null): string | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as string) : null;
  } catch {
    return null;
  }
}

/**
 * Shared foundation for the global time filter (LFE-10497).
 *
 * The time range has two persistence layers, reconciled by a presence-XOR rule
 * (no merging — that is the column-saga trap we explicitly avoid):
 *
 *   - **URL** (`?dateRange=`) is authoritative when present, so deep/shared
 *     links reproduce exactly what the sharer sees.
 *   - **localStorage** holds the per-user default in relative meta-format
 *     (`7d`, `yesterday..now` style) so the filter survives navigation between
 *     views (Home ↔ Trace …) within a session.
 *
 * The default is **never auto-written into the URL**: a clean navigation lands
 * on a URL with no `dateRange`, reads the stored default, and leaves the URL
 * clean — so a link shared from that page carries only explicitly-set params,
 * not the sharer's personal default.
 *
 * Relative ranges are stored as meta-format and re-evaluated to "now" on every
 * read; absolute timestamps are stored only when the user picks a custom range.
 * Both the dashboard and table date-range hooks delegate here so the views
 * share a single contract.
 *
 * Storage is managed directly (rather than via `useLocalStorage`) so the
 * project-scoped key is handled safely: we never read/write before the project
 * is known, and we re-read on key change instead of clobbering the new key with
 * the previous project's value when switching projects without a remount.
 */
export function useGlobalDateRange<T extends string>({
  allowedRanges,
  fallback,
}: {
  allowedRanges: readonly T[];
  fallback: T;
}): UseGlobalDateRangeOutput {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;

  // Per-project key. `null` until the project is known (e.g. before the router
  // is ready) so we never touch an unscoped key that two projects could collide
  // on.
  const storageKey = projectId
    ? `${GLOBAL_DATE_RANGE_STORAGE_KEY}-${projectId}`
    : null;

  // Per-user default in relative meta-format. Seeded synchronously on mount when
  // the project is already known, and re-read whenever the scoped key changes
  // (router becoming ready, or an in-app project switch without a remount) so we
  // adopt the new project's value instead of overwriting it with the old one.
  const [storedValue, setStoredValue] = useState<string | null>(() =>
    readStoredRange(storageKey),
  );

  useEffect(() => {
    setStoredValue(readStoredRange(storageKey));
  }, [storageKey]);

  // Read the param WITHOUT a default: presence is what distinguishes
  // "URL carries an explicit range" from "URL has none" for the XOR rule.
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: StringParam,
  });

  const persist = useCallback(
    (encoded: string) => {
      setStoredValue(encoded);
      if (!storageKey || typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(encoded));
      } catch {
        // Ignore storage write failures (private mode, quota, …).
      }
    },
    [storageKey],
  );

  return useMemo(() => {
    const timeRange = resolveTimeRange(
      { urlValue: queryParams.dateRange, storedValue },
      allowedRanges,
      fallback,
    );

    const setTimeRange = (next: TimeRange) => {
      const encoded = rangeToString(next);
      // An explicit pick makes the URL authoritative (shareable) and becomes
      // the persisted per-user default for subsequent clean navigations.
      setQueryParams({ dateRange: encoded });
      persist(encoded);
    };

    return { timeRange, setTimeRange };
  }, [
    queryParams.dateRange,
    storedValue,
    allowedRanges,
    fallback,
    setQueryParams,
    persist,
  ]);
}
