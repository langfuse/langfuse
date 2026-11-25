import { type ComponentProps, useCallback, useMemo, useState } from "react";
import { type MultiSelectTagOption } from "@/src/components/design-system/AsyncMultiSelectTagInput/AsyncMultiSelectTagInput";
import { ExperimentComparisonSelect } from "./ExperimentComparisonSelect";
import { useExperimentSearch } from "@/src/features/experiments/hooks/useExperimentSearch";
import { type ExperimentNameOption } from "@/src/features/experiments/hooks/useExperimentNames";
import { formatRunRecency } from "@/src/features/experiments/fns/formatRunRecency";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  comparisonChangedProps,
  comparisonPickerOpenedProps,
} from "@/src/features/experiments/lib/analytics";
import {
  MAX_SELECTED_EXPERIMENTS,
  NO_DATASET_KEY,
  NO_DATASET_LABEL,
  UNNAMED_DATASET_LABEL,
} from "@/src/features/experiments/constants/comparison";
import { getExperimentColorStyles } from "./table/types";

export type ExperimentOption = Omit<ExperimentNameOption, "startTime"> & {
  /** null when an id in the URL no longer resolves to a run. */
  startTime: Date | null;
};

const datasetKeyOf = (option: { datasetId: string | null }) =>
  option.datasetId ?? NO_DATASET_KEY;

const datasetLabelOf = (option: ExperimentOption) =>
  option.datasetId === null
    ? NO_DATASET_LABEL
    : (option.datasetName ?? UNNAMED_DATASET_LABEL);

type ConnectedExperimentComparisonSelectProps = {
  projectId: string;
  baselineExperimentId?: string;
  selectedIds: string[];
  /** The run order the table's cells colour by. See `useExperimentResultsState`. */
  colorExperimentIds: string[];
  selectedExperimentCount: number;
  onSelectedIdsChange: (ids: string[]) => void;
};

export function ConnectedExperimentComparisonSelect({
  projectId,
  baselineExperimentId,
  selectedIds,
  colorExperimentIds,
  selectedExperimentCount,
  onSelectedIdsChange,
}: ConnectedExperimentComparisonSelectProps) {
  const {
    searchResults,
    searchQuery,
    setSearchQuery,
    isSearchActive,
    isLoading,
    availableExperimentNames,
  } = useExperimentSearch({
    projectId,
  });

  const [expandedOverrides, setExpandedOverrides] = useState<
    Record<string, boolean>
  >({});
  const capture = usePostHogClientCapture();

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) return;

      // Counted over the whole available list rather than the filtered rows, so
      // it describes the pool the user chooses from; the baseline is not one of
      // its options. The query itself is never sent — only whether there is one
      // and how long it is.
      const options = availableExperimentNames.filter(
        (experiment) => experiment.experimentId !== baselineExperimentId,
      );
      capture(
        "experiment:comparison_picker_opened",
        comparisonPickerOpenedProps({
          tableName: "experiment-items",
          optionCount: options.length,
          datasetIds: options.map((experiment) => experiment.datasetId),
          queryLength: searchQuery.length,
        }),
      );
    },
    [capture, availableExperimentNames, baselineExperimentId, searchQuery],
  );

  const baselineDatasetKey = useMemo(() => {
    const baseline = availableExperimentNames.find(
      (experiment) => experiment.experimentId === baselineExperimentId,
    );
    return baseline ? datasetKeyOf(baseline) : null;
  }, [availableExperimentNames, baselineExperimentId]);

  // The newest run on the baseline's dataset, taken from the full list rather
  // than the search results so the badge does not move when filtering. Absent
  // when the baseline is itself the newest run.
  const latestExperimentId = useMemo(
    () =>
      baselineDatasetKey
        ? availableExperimentNames.find(
            (experiment) => datasetKeyOf(experiment) === baselineDatasetKey,
          )?.experimentId
        : undefined,
    [availableExperimentNames, baselineDatasetKey],
  );

  const groups = useMemo(() => {
    const byDataset = new Map<
      string,
      { datasetKey: string; label: string; options: ExperimentNameOption[] }
    >();

    // searchResults arrive newest-first, so the runs inside a group already are.
    for (const option of searchResults) {
      const datasetKey = datasetKeyOf(option);
      const group = byDataset.get(datasetKey) ?? {
        datasetKey,
        label: datasetLabelOf(option),
        options: [],
      };
      group.options.push(option);
      byDataset.set(datasetKey, group);
    }

    // The baseline's dataset first: comparing across datasets compares
    // different items, so it must never be what the list offers first.
    return [...byDataset.values()].sort((a, b) => {
      if (a.datasetKey === baselineDatasetKey) return -1;
      if (b.datasetKey === baselineDatasetKey) return 1;
      return (
        (b.options[0]?.startTime.getTime() ?? 0) -
        (a.options[0]?.startTime.getTime() ?? 0)
      );
    });
  }, [searchResults, baselineDatasetKey]);

  const markerColorsById = new Map(
    colorExperimentIds.map((id) => [
      id,
      getExperimentColorStyles(id, colorExperimentIds).markerColor,
    ]),
  );
  const selectedOptions = selectedIds.map((id) => {
    const run = availableExperimentNames.find(
      (experiment) => experiment.experimentId === id,
    );
    const otherDataset =
      run &&
      baselineDatasetKey !== null &&
      datasetKeyOf(run) !== baselineDatasetKey
        ? datasetLabelOf(run)
        : undefined;
    return {
      value: id,
      label: run?.experimentName ?? id,
      secondaryLabel: otherDataset,
      showSecondaryLabelInTag: true,
      color: markerColorsById.get(id),
    };
  });

  const handleItemsChange = (items: MultiSelectTagOption<string>[]) => {
    const newIds = items
      .map((item) => item.value)
      .slice(
        0,
        Math.max(
          0,
          MAX_SELECTED_EXPERIMENTS -
            (selectedExperimentCount - selectedIds.length),
        ),
      );
    if (
      newIds.length === selectedIds.length &&
      newIds.every((id, index) => id === selectedIds[index])
    ) {
      return;
    }
    const baselineDatasetId = availableExperimentNames.find(
      (exp) => exp.experimentId === baselineExperimentId,
    )?.datasetId;
    capture(
      "experiment:comparison_changed",
      comparisonChangedProps({
        tableName: "experiment-items",
        comparisonCount: newIds.length,
        datasetIds: [
          baselineDatasetId,
          ...newIds.map(
            (id) =>
              availableExperimentNames.find((exp) => exp.experimentId === id)
                ?.datasetId,
          ),
        ],
        source: "picker",
      }),
    );
    onSelectedIdsChange(newIds);
  };

  const isMaxReached = selectedExperimentCount >= MAX_SELECTED_EXPERIMENTS;

  const groupProps: ComponentProps<
    typeof ExperimentComparisonSelect
  >["groups"] = groups.map((group) => ({
    id: group.datasetKey,
    label: group.label,
    caption:
      group.datasetKey === baselineDatasetKey
        ? undefined
        : {
            text: "other dataset",
            description:
              "Runs on another dataset scored different items, so their values are not comparable.",
          },
    expanded:
      isSearchActive ||
      (expandedOverrides[group.datasetKey] ??
        group.datasetKey === (baselineDatasetKey ?? groups[0]?.datasetKey)),
    onExpandedChange: isSearchActive
      ? undefined
      : (expanded) =>
          setExpandedOverrides((previous) => ({
            ...previous,
            [group.datasetKey]: expanded,
          })),
    options: group.options.map((option) => {
      const id = option.experimentId;
      const badges: string[] = [];
      if (id === baselineExperimentId) badges.push("BASELINE");
      if (id === latestExperimentId) badges.push("LATEST");
      return {
        value: id,
        label: option.experimentName,
        color: markerColorsById.get(id),
        secondaryLabel: formatRunRecency(option.startTime),
        description: option.startTime.toLocaleString(),
        badges,
        disabled:
          isLoading ||
          id === baselineExperimentId ||
          (isMaxReached && !selectedIds.includes(id)),
      };
    }),
  }));

  return (
    <ExperimentComparisonSelect
      value={selectedOptions}
      onValueChange={handleItemsChange}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isLoading={isLoading}
      onAfterOpenChange={handleOpenChange}
      selectionLimitReached={isMaxReached}
      groups={groupProps}
    />
  );
}
