import { useCallback } from "react";
import { type ColumnGroupToggleHandler } from "@/src/components/table/data-table-column-visibility-filter";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  EXPERIMENT_ANALYTICS_DIMENSIONS,
  type ExperimentScoreScope,
} from "@/src/features/experiments/constants/analytics";

/** A table's score column group ids, by the score level each group holds. */
export type ScoreColumnGroupScopes = Record<string, ExperimentScoreScope>;

/**
 * `experiment:score_column_scope_toggled` — which score family people actually
 * want visible, now that all of them are on by default (S3). The intent is the
 * column drawer's per-family "Select All" / "Deselect All"; a single checkbox
 * stays on `table:column_visibility_changed`, which already carries the column.
 *
 * Takes the map from a table's score group column ids to the score level they
 * hold, so the two experiments tables can name their own groups and the generic
 * column picker stays generic. Group toggles for anything else are ignored.
 * Pass a stable (module-level) map. (LFE-15720)
 */
export function useScoreColumnScopeAnalytics(
  scopeByGroupId: ScoreColumnGroupScopes,
): ColumnGroupToggleHandler {
  const capture = usePostHogClientCapture();

  return useCallback(
    ({ groupId, columnCount, willBeVisible }) => {
      const scope = scopeByGroupId[groupId];
      if (!scope) return;
      capture("experiment:score_column_scope_toggled", {
        scope,
        // The family's visible column count after the toggle: all of them, or
        // none. A count, never a score name.
        enabledCount: willBeVisible ? columnCount : 0,
        ...EXPERIMENT_ANALYTICS_DIMENSIONS,
      });
    },
    [capture, scopeByGroupId],
  );
}
