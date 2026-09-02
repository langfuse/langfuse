import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
  type UrlUpdateType,
} from "use-query-params";
import { MAX_SELECTED_EXPERIMENTS } from "@/src/features/experiments/constants/comparison";
import useLocalStorage from "@/src/components/useLocalStorage";

/**
 * How the selected experiments are laid out against each other: one row per item
 * ("list") or one column per experiment ("grid").
 */
export type ExperimentResultsLayout = "grid" | "list";

/** What a diff cell's extra line is measured against. */
export type ExperimentDiffMode = "comparison" | "expected" | "off";

const asLayout = (value: unknown): ExperimentResultsLayout | undefined =>
  value === "grid" || value === "list" ? value : undefined;

const asDiffMode = (value: unknown): ExperimentDiffMode | undefined =>
  value === "comparison" || value === "expected" || value === "off"
    ? value
    : undefined;

// Drop null/empty entries and de-duplicate, preserving first-seen order.
const dedupe = (ids: (string | null | undefined)[]): string[] =>
  Array.from(new Set(ids.filter((id): id is string => Boolean(id))));

export function useExperimentResultsState() {
  const [state, setState] = useQueryParams({
    baseline: withDefault(StringParam, undefined),
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, undefined),
    diff: withDefault(StringParam, undefined),
    itemVisibility: withDefault(StringParam, "baseline-only"),
  });

  // The URL keeps the explicit baseline separate from comparison IDs, but
  // internally they form one ordered selection with the baseline first.
  const explicitBaselineId = state.baseline as string | undefined;
  const selectedExperimentIds = dedupe([
    explicitBaselineId,
    ...((state.c as (string | null)[] | undefined) ?? []),
  ]).slice(0, MAX_SELECTED_EXPERIMENTS);

  const comparisonIds = selectedExperimentIds.filter(
    (id) => id !== explicitBaselineId,
  );
  const hasBaseline = Boolean(explicitBaselineId);

  // Write one ordered selection back to the URL. The baseline is prepended so it
  // is always kept and lands first; anything past the limit is evicted from the
  // end; the baseline is stripped out of `c`.
  const commitSelection = (
    orderedIds: string[],
    baseline: string | undefined,
    updateType?: UrlUpdateType,
  ) => {
    const ids = dedupe([baseline, ...orderedIds]).slice(
      0,
      MAX_SELECTED_EXPERIMENTS,
    );
    setState(
      {
        baseline,
        c: baseline ? ids.filter((id) => id !== baseline) : ids,
      },
      updateType,
    );
  };

  // Selecting a baseline moves it to the front of the selection and marks it,
  // evicting the last selection when the total limit is reached.
  const setBaseline = (id: string | undefined) => {
    if (!id) {
      clearBaseline();
      return;
    }
    commitSelection(selectedExperimentIds, id);
  };

  // Clear the explicit baseline while preserving the selected experiments; the
  // former baseline moves to the end of the comparison list.
  const clearBaseline = () => {
    if (!explicitBaselineId) return;
    commitSelection([...comparisonIds, explicitBaselineId], undefined);
  };

  // `options.updateType` carries the history semantics: a user's own pick keeps
  // the default (a Back-able step), a programmatic default passes `replaceIn` so
  // it does not mint a history entry Back would bounce off.
  const setComparisonIds = (
    ids: string[],
    options?: { updateType?: UrlUpdateType },
  ) => commitSelection(ids, explicitBaselineId, options?.updateType);

  const addComparisonId = (id: string) => {
    if (id === explicitBaselineId) return; // Can't compare baseline with itself
    if (selectedExperimentIds.length >= MAX_SELECTED_EXPERIMENTS) return;
    if (comparisonIds.includes(id)) return;
    setComparisonIds([...comparisonIds, id]);
  };

  const removeComparisonId = (id: string) =>
    setComparisonIds(comparisonIds.filter((existingId) => existingId !== id));

  // Layout and diff mode: the URL wins so a view stays shareable, then the
  // user's remembered pick, then the default for the current selection.
  const [storedLayout, setStoredLayout] =
    useLocalStorage<ExperimentResultsLayout | null>(
      "experiment-results-layout",
      null,
    );
  const [storedDiffMode, setStoredDiffMode] =
    useLocalStorage<ExperimentDiffMode | null>("experiment-results-diff", null);

  // With something to compare against, one row per item beats one wide column
  // per experiment: a three-way comparison pushes the third experiment off a
  // 1512px screen entirely.
  const layout: ExperimentResultsLayout =
    asLayout(state.layout) ??
    storedLayout ??
    (comparisonIds.length > 0 ? "list" : "grid");

  const setLayout = (newLayout: ExperimentResultsLayout) => {
    setStoredLayout(newLayout);
    setState({ layout: newLayout });
  };

  const requestedDiffMode: ExperimentDiffMode =
    asDiffMode(state.diff) ?? storedDiffMode ?? "comparison";

  // Expected → Output is the list layout's two-line cell, and no other layout
  // draws it. A shared URL or a remembered pick that pairs it with another
  // layout would leave the menu promising a comparison the table is not
  // showing, so it reads as the baseline diff until the layout can express it.
  const diffMode: ExperimentDiffMode =
    requestedDiffMode === "expected" && layout !== "list"
      ? "comparison"
      : requestedDiffMode;

  const setDiffMode = (newDiffMode: ExperimentDiffMode) => {
    setStoredDiffMode(newDiffMode);
    // Expected → Output is the diff layout's two-line cell; picking it from the
    // side-by-side layout would otherwise appear to do nothing.
    setState({
      diff: newDiffMode,
      ...(newDiffMode === "expected" ? { layout: "list" } : {}),
    });
    if (newDiffMode === "expected") setStoredLayout("list");
  };

  // Item visibility management
  const itemVisibility =
    (state.itemVisibility as "baseline-only" | "all") ?? "baseline-only";
  const setItemVisibility = (newVisibility: "baseline-only" | "all") => {
    setState({ itemVisibility: newVisibility });
  };

  return {
    // Baseline
    baselineId: explicitBaselineId,
    hasBaseline,
    setBaseline,
    clearBaseline,

    // Comparison
    comparisonIds,
    setComparisonIds,
    addComparisonId,
    removeComparisonId,
    maxSelectedExperiments: MAX_SELECTED_EXPERIMENTS,
    canAddMore: selectedExperimentIds.length < MAX_SELECTED_EXPERIMENTS,

    // All selected experiments, preserving URL order with an explicit baseline first.
    selectedExperimentIds,
    allExperimentIds: selectedExperimentIds,

    // Layout
    layout,
    setLayout,

    // Diff mode
    diffMode,
    setDiffMode,

    // Item visibility
    itemVisibility,
    setItemVisibility,
  };
}
