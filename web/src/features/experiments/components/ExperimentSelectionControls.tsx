import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { type UrlUpdateType } from "use-query-params";
import { useExperimentComparisonAutoSelect } from "@/src/features/experiments/hooks/useExperimentComparisonAutoSelect";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  comparisonChangedProps,
  type ExperimentComparisonSource,
} from "@/src/features/experiments/lib/analytics";
import { ExperimentBaselineControls } from "./ExperimentBaselineControls";
import { ExperimentComparisonSelector } from "./ExperimentComparisonSelector";

type ExperimentSelectionControlsProps = {
  projectId: string;
  baselineId?: string;
  baselineName?: string;
  comparisonIds: string[];
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
      <div className="flex min-w-0 items-center">
        <div className="border-input bg-muted/30 flex h-8 w-auto shrink-0 items-center rounded-l-md border px-3 text-xs">
          Baseline
        </div>
        <div className="w-full max-w-64 min-w-0 flex-1">
          <ExperimentBaselineControls
            projectId={projectId}
            baselineId={baselineId}
            baselineName={baselineName}
            onBaselineChange={onBaselineChange}
            onBaselineClear={onBaselineClear}
          />
        </div>
      </div>

      <div className="w-full min-w-0 flex-1">
        <ExperimentComparisonSelector
          projectId={projectId}
          baselineExperimentId={baselineId}
          selectedIds={comparisonIds}
          selectedExperimentCount={selectedExperimentCount}
          onSelectedIdsChange={onComparisonIdsChange}
          isAutoSelectEnabled={isAutoSelectEnabled}
          onAutoSelectEnabledChange={setIsAutoSelectEnabled}
        />
      </div>
    </div>
  );
}
