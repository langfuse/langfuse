import { useQueryParams, StringParam } from "use-query-params";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import {
  rangeToString,
  resolveTimeRange,
  type TimeRange,
} from "@/src/utils/date-range-utils";
import { useGlobalDateRangeStore } from "@/src/features/global-time-range/globalDateRangeStore";

export interface UseGlobalDateRangeOutput {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
}

/**
 * Shared foundation for the global time filter (LFE-10497).
 *
 * One-way data flow, no effects: the displayed `timeRange` is a pure derivation
 * of two independent sources, reconciled by the presence-XOR rule (no merging):
 *
 *   - the URL `?dateRange=` (route source of truth, authoritative when present
 *     so deep/shared links reproduce what the sharer sees); and
 *   - the per-user default in {@link useGlobalDateRangeStore} (cross-route,
 *     persisted to localStorage) used when the URL carries no time param.
 *
 * An explicit pick is the only writer: it sets the URL (shareable) and the
 * store default (the new baseline for clean navigations). Relative presets are
 * stored in meta-format and re-evaluated to "now" on each read; absolute
 * timestamps are stored only for a user-selected custom range. Both the
 * dashboard and table date-range hooks delegate here so the views share one
 * contract.
 *
 * `persistAsDefault` (default true) marks a surface as the shared cross-view
 * session filter. Pass `false` for an authoring/preview surface (e.g. the
 * widget editor) whose picker is transient editor state, not the user's
 * default: it then neither reads nor writes the shared default, and only syncs
 * to the URL — so previewing a range never overwrites the default for
 * Home/Traces/Sessions/etc.
 */
export function useGlobalDateRange<T extends string>({
  allowedRanges,
  fallback,
  persistAsDefault = true,
}: {
  allowedRanges: readonly T[];
  fallback: T;
  persistAsDefault?: boolean;
}): UseGlobalDateRangeOutput {
  const router = useRouter();
  const projectId =
    typeof router.query.projectId === "string"
      ? router.query.projectId
      : undefined;

  // Selector returns a primitive (this project's stored token, or null). Always
  // current — switching projects selects a different field of the same store.
  // Page-local surfaces (persistAsDefault === false) ignore the shared default.
  const storedValue = useGlobalDateRangeStore((state) =>
    persistAsDefault && projectId
      ? (state.defaultsByProject[projectId] ?? null)
      : null,
  );
  const setProjectDefault = useGlobalDateRangeStore(
    (state) => state.actions.setProjectDefault,
  );

  // Route state stays in the router/query hook. Read WITHOUT a default so
  // presence distinguishes "URL carries a range" from "URL has none".
  const [queryParams, setQueryParams] = useQueryParams({
    dateRange: StringParam,
  });

  const setTimeRange = useCallback(
    (next: TimeRange) => {
      const encoded = rangeToString(next);
      // The URL becomes authoritative (shareable); the store default becomes the
      // baseline for subsequent clean navigations — unless this surface is
      // page-local (an authoring/preview picker), which never persists.
      setQueryParams({ dateRange: encoded });
      if (persistAsDefault && projectId) setProjectDefault(projectId, encoded);
    },
    [persistAsDefault, projectId, setProjectDefault, setQueryParams],
  );

  return useMemo(
    () => ({
      timeRange: resolveTimeRange(
        { urlValue: queryParams.dateRange, storedValue },
        allowedRanges,
        fallback,
      ),
      setTimeRange,
    }),
    [queryParams.dateRange, storedValue, allowedRanges, fallback, setTimeRange],
  );
}
