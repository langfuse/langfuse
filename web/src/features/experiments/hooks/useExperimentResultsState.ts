import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
} from "use-query-params";
import { MAX_SELECTED_EXPERIMENTS } from "@/src/features/experiments/constants/comparison";

// Drop null/empty entries and de-duplicate, preserving first-seen order.
const dedupe = (ids: (string | null | undefined)[]): string[] =>
  Array.from(new Set(ids.filter((id): id is string => Boolean(id))));

export function useExperimentResultsState() {
  const [state, setState] = useQueryParams({
    baseline: withDefault(StringParam, undefined),
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, "grid"),
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
  ) => {
    const ids = dedupe([baseline, ...orderedIds]).slice(
      0,
      MAX_SELECTED_EXPERIMENTS,
    );
    setState({
      baseline,
      c: baseline ? ids.filter((id) => id !== baseline) : ids,
    });
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

  const setComparisonIds = (ids: string[]) =>
    commitSelection(ids, explicitBaselineId);

  const addComparisonId = (id: string) => {
    if (id === explicitBaselineId) return; // Can't compare baseline with itself
    if (selectedExperimentIds.length >= MAX_SELECTED_EXPERIMENTS) return;
    if (comparisonIds.includes(id)) return;
    setComparisonIds([...comparisonIds, id]);
  };

  const removeComparisonId = (id: string) =>
    setComparisonIds(comparisonIds.filter((existingId) => existingId !== id));

  // Layout management
  const layout = (state.layout as "grid" | "list") ?? "list";
  const setLayout = (newLayout: "grid" | "list") => {
    setState({ layout: newLayout });
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

    // Item visibility
    itemVisibility,
    setItemVisibility,
  };
}
