import { useMemo } from "react";
import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
} from "use-query-params";
import { MAX_EXPERIMENT_COMPARISONS } from "@/src/features/experiments/constants/comparison";

export function useExperimentResultsState() {
  const [state, setState] = useQueryParams({
    baseline: withDefault(StringParam, undefined),
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, "grid"),
    itemVisibility: withDefault(StringParam, "baseline-only"),
  });

  // Parse baseline ID
  const baselineId = state.baseline as string | undefined;
  const hasBaseline = Boolean(baselineId);

  // Parse comparison IDs - filter out null values and cast to string[]
  const rawIds = state.c as (string | null)[] | undefined;
  const comparisonIds: string[] = (rawIds ?? [])
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, MAX_EXPERIMENT_COMPARISONS);

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

    // Keep the former baseline selected while respecting the comparison cap.
    const newComparisonIds = comparisonIds.includes(baselineId)
      ? comparisonIds
      : [...comparisonIds.slice(0, MAX_EXPERIMENT_COMPARISONS - 1), baselineId];

    setState({
      baseline: undefined,
      c: newComparisonIds,
    });
  };

  // Comparison management
  const setComparisonIds = (ids: string[]) => {
    // Filter out baseline if present
    const filtered = baselineId ? ids.filter((id) => id !== baselineId) : ids;
    setState({ c: filtered.slice(0, MAX_EXPERIMENT_COMPARISONS) });
  };

  const addComparisonId = (id: string) => {
    if (id === baselineId) return; // Can't compare baseline with itself
    if (comparisonIds.length >= MAX_EXPERIMENT_COMPARISONS) return;
    if (comparisonIds.includes(id)) return;
    setComparisonIds([...comparisonIds, id]);
  };

  const removeComparisonId = (id: string) => {
    setComparisonIds(comparisonIds.filter((existingId) => existingId !== id));
  };

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
    maxComparisons: MAX_EXPERIMENT_COMPARISONS,
    canAddMore: comparisonIds.length < MAX_EXPERIMENT_COMPARISONS,

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
