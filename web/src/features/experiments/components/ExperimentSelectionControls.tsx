import { useCallback, useEffect, useId, useRef } from "react";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { useRouter } from "next/router";
import { type UrlUpdateType } from "use-query-params";
import { useExperimentComparisonAutoSelect } from "@/src/features/experiments/hooks/useExperimentComparisonAutoSelect";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  autoComparisonPreferenceChangedProps,
  comparisonChangedProps,
  type ExperimentComparisonSource,
} from "@/src/features/experiments/lib/analytics";
import { ExperimentBaselineControls } from "./ExperimentBaselineControls";
import { ConnectedExperimentComparisonSelect } from "./ConnectedExperimentComparisonSelect";

type ExperimentSelectionControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  comparisonIds: string[];
  /** The run order the table's cells colour by. See `useExperimentResultsState`. */
  colorExperimentIds: string[];
  selectedExperimentCount: number;
  onBaselineChange: (id: string) => void;
  onBaselineClear: () => void;
  onComparisonIdsChange: (
    ids: string[],
    options?: { updateType?: UrlUpdateType },
  ) => void;
};

export function ExperimentSelectionControls({
  projectId,
  baselineId,
  baselineName,
  comparisonIds,
  colorExperimentIds,
  selectedExperimentCount,
  onBaselineChange,
  onBaselineClear,
  onComparisonIdsChange,
}: ExperimentSelectionControlsProps) {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  // The dataset each run belongs to, for `isSameDataset`. The picker reports its
  // own change from the click; the two paths reported here are the ones no
  // control owns — the auto-selected default, and a selection already in the URL.
  const { experimentNames, isLoading: isDatasetContextLoading } =
    useExperimentNames({ projectId });

  const captureComparisonChanged = useCallback(
    ({
      comparisonIds: ids,
      source,
    }: {
      comparisonIds: string[];
      source: ExperimentComparisonSource;
    }) => {
      const datasetOf = (experimentId: string) =>
        experimentNames.find((exp) => exp.experimentId === experimentId)
          ?.datasetId ?? null;
      capture(
        "experiment:comparison_changed",
        comparisonChangedProps({
          tableName: "experiment-items",
          comparisonCount: ids.length,
          datasetIds: [
            baselineId ? datasetOf(baselineId) : null,
            ...ids.map(datasetOf),
          ],
          source,
        }),
      );
    },
    [capture, experimentNames, baselineId],
  );

  const handleAutoSelect = useCallback(
    (ids: string[], options?: { updateType?: UrlUpdateType }) => {
      captureComparisonChanged({ comparisonIds: ids, source: "auto" });
      onComparisonIdsChange(ids, options);
    },
    [captureComparisonChanged, onComparisonIdsChange],
  );

  // Mounted once per results page, so the default comparison is decided here
  // rather than in the state hook that every consumer of the URL calls.
  const autoSelectId = useId();
  const { isAutoSelectEnabled, setIsAutoSelectEnabled } =
    useExperimentComparisonAutoSelect({
      projectId,
      baselineId,
      comparisonIds,
      onComparisonIdsChange: handleAutoSelect,
    });

  // A results page can arrive with a comparison already chosen — a shared link,
  // a Compare from the experiments list, a restored view. That is a real "this
  // view compares" data point but not an action, so it is reported once per
  // page, from the URL as it first reads, and never again. Declared after the
  // auto-select hook so that on the render where auto-select writes its pick
  // this effect still sees the URL's own (empty) selection and stays silent —
  // the auto pick reports itself as `source: "auto"`.
  const hasReportedUrlSelection = useRef(false);
  useEffect(() => {
    if (hasReportedUrlSelection.current) return;
    // `c=` is not readable before the router is ready, and the dataset ids
    // `isSameDataset` needs are not known until the run list has loaded.
    if (!router.isReady || isDatasetContextLoading) return;

    hasReportedUrlSelection.current = true;
    if (comparisonIds.length === 0) return;
    captureComparisonChanged({ comparisonIds, source: "url" });
  }, [
    router.isReady,
    isDatasetContextLoading,
    comparisonIds,
    captureComparisonChanged,
  ]);

  return (
    <div className="flex w-[56dvw] min-w-0 flex-row gap-3">
      <div className="w-full max-w-80 min-w-0 flex-1">
        <ExperimentBaselineControls
          projectId={projectId}
          baselineId={baselineId}
          baselineName={baselineName}
          onBaselineChange={onBaselineChange}
          onBaselineClear={onBaselineClear}
        />
      </div>

      <div className="flex w-full min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <ConnectedExperimentComparisonSelect
            projectId={projectId}
            baselineExperimentId={baselineId}
            selectedIds={comparisonIds}
            colorExperimentIds={colorExperimentIds}
            selectedExperimentCount={selectedExperimentCount}
            onSelectedIdsChange={onComparisonIdsChange}
          />
        </div>
        <label
          htmlFor={autoSelectId}
          className="flex shrink-0 cursor-pointer items-center gap-2 text-xs whitespace-nowrap"
          title="Auto-select a comparison experiment by default"
        >
          <Checkbox
            id={autoSelectId}
            size="sm"
            checked={isAutoSelectEnabled}
            onCheckedChange={(checked) => {
              const isEnabled = checked === true;
              capture(
                "experiment:auto_comparison_preference_changed",
                autoComparisonPreferenceChangedProps({
                  tableName: "experiment-items",
                  isEnabled,
                }),
              );
              setIsAutoSelectEnabled(isEnabled);
            }}
          />
          Auto-select comparison
        </label>
      </div>
    </div>
  );
}
