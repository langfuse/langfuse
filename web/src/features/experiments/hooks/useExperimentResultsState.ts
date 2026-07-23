import { useMemo } from "react";
import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
} from "use-query-params";

const MAX_COMPARISONS = 4;

type UseExperimentResultsStateOptions = {
  /**
   * When set, the state is fixed to a single experiment: this id becomes the
   * baseline with no comparisons, a list layout and baseline-only visibility,
   * ignoring the URL compare params. Used by the legacy dataset run-detail
   * route (experiment_id === dataset_run_id) to show a single experiment.
   */
  singleExperimentId?: string;
};

export function useExperimentResultsState(
  options?: UseExperimentResultsStateOptions,
) {
  const singleExperimentId = options?.singleExperimentId;
  const isSingleExperiment = Boolean(singleExperimentId);

  const [state, setState] = useQueryParams({
    baseline: withDefault(StringParam, undefined),
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, "grid"),
    itemVisibility: withDefault(StringParam, "baseline-only"),
  });

  // Parse baseline ID
  const baselineId = isSingleExperiment
    ? singleExperimentId
    : (state.baseline as string | undefined);
  const hasBaseline = Boolean(baselineId);

  // Parse comparison IDs - filter out null values and cast to string[].
  // Memoized so the array keeps a stable identity while the `c` param is
  // unchanged; allExperimentIds below depends on it.
  const rawIds = state.c as (string | null)[] | undefined;
  const comparisonIds: string[] = useMemo(
    () =>
      isSingleExperiment
        ? []
        : (rawIds ?? []).filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
    [rawIds, isSingleExperiment],
  );

  // Set baseline with reconciliation: remove from comparison if present
  const setBaseline = (id: string | undefined) => {
    if (!id) {
      clearBaseline();
      return;
    }

    // Remove new baseline from comparison list if present
    const newComparisonIds = comparisonIds.filter((cid) => cid !== id);

    setState({
      baseline: id,
      ...(newComparisonIds.length !== comparisonIds.length
        ? { c: newComparisonIds }
        : {}),
    });
  };

  // Clear baseline - moves current baseline to compare list.
  const clearBaseline = () => {
    if (!baselineId) return;

    // Move current baseline to compare list (always add, regardless of MAX_COMPARISONS)
    const newComparisonIds = comparisonIds.includes(baselineId)
      ? comparisonIds
      : [...comparisonIds, baselineId];

    setState({
      baseline: undefined,
      c: newComparisonIds,
    });
  };

  // Comparison management
  const setComparisonIds = (ids: string[]) => {
    // Filter out baseline if present
    const filtered = baselineId ? ids.filter((id) => id !== baselineId) : ids;
    setState({ c: filtered.slice(0, MAX_COMPARISONS) });
  };

  const addComparisonId = (id: string) => {
    if (id === baselineId) return; // Can't compare baseline with itself
    if (comparisonIds.length >= MAX_COMPARISONS) return;
    if (comparisonIds.includes(id)) return;
    setComparisonIds([...comparisonIds, id]);
  };

  const removeComparisonId = (id: string) => {
    setComparisonIds(comparisonIds.filter((existingId) => existingId !== id));
  };

  // Layout management
  const layout = isSingleExperiment
    ? "list"
    : ((state.layout as "grid" | "list") ?? "list");
  const setLayout = (newLayout: "grid" | "list") => {
    setState({ layout: newLayout });
  };

  // Item visibility management
  const itemVisibility = isSingleExperiment
    ? "baseline-only"
    : ((state.itemVisibility as "baseline-only" | "all") ?? "baseline-only");
  const setItemVisibility = (newVisibility: "baseline-only" | "all") => {
    setState({ itemVisibility: newVisibility });
  };

  const resolveBaselineOrFirstComparison = () => baselineId ?? comparisonIds[0];

  // All experiment IDs in order: effective baseline first, then comparisons
  // Uses fallback to first comparison if no explicit baseline is set
  const allExperimentIds = useMemo(() => {
    const effectiveBaseline = baselineId ?? comparisonIds[0];
    if (!effectiveBaseline) return [];
    return [
      effectiveBaseline,
      ...comparisonIds.filter((id) => id !== effectiveBaseline),
    ];
  }, [baselineId, comparisonIds]);

  return {
    // Baseline
    baselineId,
    hasBaseline,
    setBaseline,
    clearBaseline,
    resolveBaselineOrFirstComparison,

    // Comparison
    comparisonIds,
    setComparisonIds,
    addComparisonId,
    removeComparisonId,
    maxComparisons: MAX_COMPARISONS,
    canAddMore: comparisonIds.length < MAX_COMPARISONS,

    // All experiments (ordered: effective baseline first, then comparisons)
    allExperimentIds,

    // Layout
    layout,
    setLayout,

    // Item visibility
    itemVisibility,
    setItemVisibility,
  };
}
