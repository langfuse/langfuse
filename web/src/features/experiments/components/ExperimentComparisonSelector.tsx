import { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { MultiSelectCombobox } from "@/src/components/ui/multi-select-combobox";
import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useExperimentSearch } from "@/src/features/experiments/hooks/useExperimentSearch";
import { type ExperimentNameOption } from "@/src/features/experiments/hooks/useExperimentNames";
import { formatRunRecency } from "@/src/features/experiments/fns/formatRunRecency";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  autoComparisonPreferenceChangedProps,
  comparisonChangedProps,
  comparisonPickerOpenedProps,
} from "@/src/features/experiments/lib/analytics";
import {
  MAX_SELECTED_EXPERIMENTS,
  MAX_VISIBLE_COMPARISON_CHIPS,
  NO_DATASET_KEY,
  NO_DATASET_LABEL,
  UNNAMED_DATASET_LABEL,
} from "@/src/features/experiments/constants/comparison";

export type ExperimentOption = Omit<ExperimentNameOption, "startTime"> & {
  /** null when an id in the URL no longer resolves to a run. */
  startTime: Date | null;
};

/**
 * The dropdown is a flat list of rows so the shared combobox can render it, but
 * the rows carry the dataset grouping: a header per dataset, its runs beneath.
 */
type ComparisonRow =
  | { kind: "preference" }
  | {
      kind: "group";
      datasetKey: string;
      label: string;
      runCount: number;
      isBaselineDataset: boolean;
      isExpanded: boolean;
    }
  | {
      kind: "option";
      option: ExperimentOption;
      isBaseline: boolean;
      isLatest: boolean;
    };

const datasetKeyOf = (option: { datasetId: string | null }) =>
  option.datasetId ?? NO_DATASET_KEY;

const datasetLabelOf = (option: ExperimentOption) =>
  option.datasetId === null
    ? NO_DATASET_LABEL
    : (option.datasetName ?? UNNAMED_DATASET_LABEL);

const rowKeyOf = (row: ComparisonRow) => {
  switch (row.kind) {
    case "preference":
      return "preference";
    case "group":
      return `group:${row.datasetKey}`;
    default:
      return `experiment:${row.option.experimentId}`;
  }
};

type ExperimentComparisonSelectorProps = {
  projectId: string;
  baselineExperimentId?: string;
  selectedIds: string[];
  selectedExperimentCount: number;
  onSelectedIdsChange: (ids: string[]) => void;
  isAutoSelectEnabled: boolean;
  onAutoSelectEnabledChange: (isEnabled: boolean) => void;
};

export function ExperimentComparisonSelector({
  projectId,
  baselineExperimentId,
  selectedIds,
  selectedExperimentCount,
  onSelectedIdsChange,
  isAutoSelectEnabled,
  onAutoSelectEnabledChange,
}: ExperimentComparisonSelectorProps) {
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

  // How long is the list people choose from, and how many datasets are mixed
  // into it? Counted over the whole available list, not the filtered rows, so
  // it describes the picker rather than the current search.
  const isPickerOpenRef = useRef(false);
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      // The combobox re-announces "open" on every input focus, including the
      // refocus after picking a row; only the closed-to-open edge is an open.
      if (!isOpen) {
        isPickerOpenRef.current = false;
        return;
      }
      if (isPickerOpenRef.current) return;
      isPickerOpenRef.current = true;

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

  const rows = useMemo(() => {
    // With no baseline yet there is no "current" dataset, so open the one
    // holding the most recent run instead of showing nothing but headers.
    const defaultExpandedKey = baselineDatasetKey ?? groups[0]?.datasetKey;
    // The preference row is chrome, not a result: seeding it unconditionally
    // would make the list never look empty, and the combobox's "no results"
    // state — which keys off the row count — could never be reached.
    const result: ComparisonRow[] =
      groups.length > 0 ? [{ kind: "preference" }] : [];

    for (const group of groups) {
      // While searching, every group with a match is open: `??` falls through
      // only on nullish, so a group the user collapsed earlier would keep its
      // explicit `false` and swallow the rows the search just found.
      const isExpanded = isSearchActive
        ? true
        : (expandedOverrides[group.datasetKey] ??
          group.datasetKey === defaultExpandedKey);

      result.push({
        kind: "group",
        datasetKey: group.datasetKey,
        label: group.label,
        runCount: group.options.length,
        isBaselineDataset: group.datasetKey === baselineDatasetKey,
        isExpanded,
      });

      if (!isExpanded) continue;

      for (const option of group.options) {
        result.push({
          kind: "option",
          option,
          isBaseline: option.experimentId === baselineExperimentId,
          isLatest: option.experimentId === latestExperimentId,
        });
      }
    }

    return result;
  }, [
    groups,
    expandedOverrides,
    isSearchActive,
    baselineDatasetKey,
    baselineExperimentId,
    latestExperimentId,
  ]);

  const selectedRows = useMemo<ComparisonRow[]>(
    () =>
      selectedIds.map((id) => ({
        kind: "option",
        option: availableExperimentNames.find(
          (experiment) => experiment.experimentId === id,
        ) ?? {
          // An id from the URL that no longer resolves to a run.
          experimentId: id,
          experimentName: id,
          datasetId: null,
          datasetName: null,
          startTime: null,
        },
        isBaseline: false,
        isLatest: false,
      })),
    [selectedIds, availableExperimentNames],
  );

  // Past a few chips the row turns into a horizontal scroll nobody scrolls, so
  // the tail collapses into one "+N" badge that names what it hides.
  const hiddenSelectedOptions = useMemo(
    () =>
      selectedRows
        .flatMap((row) => (row.kind === "option" ? [row.option] : []))
        .slice(MAX_VISIBLE_COMPARISON_CHIPS),
    [selectedRows],
  );

  const handleItemsChange = (items: ComparisonRow[]) => {
    const newIds = items
      .flatMap((item) =>
        item.kind === "option" ? [item.option.experimentId] : [],
      )
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

  return (
    <div className="space-y-2">
      <MultiSelectCombobox<ComparisonRow>
        labelLeft="Compare"
        selectedItems={selectedRows}
        onItemsChange={handleItemsChange}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={rows}
        isLoading={isLoading}
        onOpenChange={handleOpenChange}
        placeholder={
          isMaxReached
            ? `Max ${MAX_SELECTED_EXPERIMENTS} experiments`
            : "Search experiments..."
        }
        disabled={isLoading}
        showSearchIcon={false}
        dropdownClassName="bg-background absolute top-0 z-10 max-h-80 w-full overflow-y-auto rounded-md border shadow-md"
        getItemKey={rowKeyOf}
        renderItem={(row, isSelected, onToggle) => {
          if (row.kind === "preference") {
            return (
              <button
                type="button"
                onClick={() => {
                  capture(
                    "experiment:auto_comparison_preference_changed",
                    autoComparisonPreferenceChangedProps({
                      tableName: "experiment-items",
                      isEnabled: !isAutoSelectEnabled,
                    }),
                  );
                  onAutoSelectEnabledChange(!isAutoSelectEnabled);
                }}
                className="text-muted-foreground hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <div className="border-input flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border">
                  {isAutoSelectEnabled && <Check className="h-3 w-3" />}
                </div>
                <span className="text-xs">
                  Auto-select a comparison experiment by default
                </span>
              </button>
            );
          }

          if (row.kind === "group") {
            return (
              <button
                type="button"
                onClick={() =>
                  setExpandedOverrides((previous) => ({
                    ...previous,
                    [row.datasetKey]: !row.isExpanded,
                  }))
                }
                className="bg-muted/40 hover:bg-muted flex w-full items-center gap-2 px-2 py-1.5 text-left"
              >
                {row.isExpanded ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate text-xs font-bold" title={row.label}>
                  {row.label}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {row.runCount}
                </span>
                {!row.isBaselineDataset && (
                  <span
                    className="text-muted-foreground ml-auto shrink-0 text-xs italic"
                    title="Runs on another dataset scored different items, so their values are not comparable."
                  >
                    other dataset
                  </span>
                )}
              </button>
            );
          }

          const { option } = row;

          return (
            <button
              type="button"
              onClick={row.isBaseline ? undefined : onToggle}
              disabled={row.isBaseline || (!isSelected && isMaxReached)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isSelected && <Check className="text-primary h-4 w-4" />}
              </div>
              <span
                className="min-w-0 flex-1 truncate text-sm font-bold"
                title={option.experimentName}
              >
                {option.experimentName}
              </span>
              {row.isBaseline && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  BASELINE
                </Badge>
              )}
              {row.isLatest && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  LATEST
                </Badge>
              )}
              {option.startTime && (
                <span
                  className="text-muted-foreground shrink-0 text-xs"
                  title={option.startTime.toLocaleString()}
                >
                  {formatRunRecency(option.startTime)}
                </span>
              )}
            </button>
          );
        }}
        renderSelectedItem={(row, onRemove) => {
          if (row.kind !== "option") return null;

          const { option } = row;
          const position = selectedIds.indexOf(option.experimentId);

          if (position >= MAX_VISIBLE_COMPARISON_CHIPS) {
            // One badge stands in for the whole tail; the rest render nothing.
            return position === MAX_VISIBLE_COMPARISON_CHIPS ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className="shrink-0 px-2 py-0.5 text-xs"
                  >
                    +{hiddenSelectedOptions.length}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-[280px]">
                  {hiddenSelectedOptions.map((hidden) => (
                    <p key={hidden.experimentId}>
                      {hidden.experimentName}
                      {hidden.startTime
                        ? ` · ${formatRunRecency(hidden.startTime)}`
                        : ""}
                    </p>
                  ))}
                </TooltipContent>
              </Tooltip>
            ) : null;
          }

          // A comparison should never be on another dataset, but the URL can say
          // anything, so name the dataset rather than leaving it unexplained.
          const isOtherDataset =
            baselineDatasetKey !== null &&
            option.startTime !== null &&
            datasetKeyOf(option) !== baselineDatasetKey;

          const chipTitle = [
            option.experimentName,
            option.startTime
              ? `Started ${option.startTime.toLocaleString()}`
              : "This experiment is no longer available",
            isOtherDataset ? `Dataset: ${datasetLabelOf(option)}` : null,
          ]
            .filter(Boolean)
            .join("\n");

          return (
            <Badge
              variant="secondary"
              className="flex shrink-0 items-center gap-1 px-2 py-0.5"
            >
              <span className="max-w-40 truncate text-xs" title={chipTitle}>
                {option.experimentName}
              </span>
              {isOtherDataset && (
                <span
                  className="text-muted-foreground max-w-24 truncate text-[10px]"
                  title={`Dataset: ${datasetLabelOf(option)}`}
                >
                  {datasetLabelOf(option)}
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="hover:bg-muted ml-0.5 rounded-full"
                aria-label={`Remove ${option.experimentName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        }}
      />
    </div>
  );
}
