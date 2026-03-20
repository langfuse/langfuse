import { useRouter } from "next/router";
import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
} from "use-query-params";

const MAX_COMPARISONS = 4;

export function useExperimentResultsState() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [state, setState] = useQueryParams({
    baseline: withDefault(StringParam, undefined),
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, "list"),
    itemVisibility: withDefault(StringParam, "baseline-only"),
  });

  // Parse baseline ID
  const baselineId = state.baseline as string | undefined;

  // Parse comparison IDs - filter out null values and cast to string[]
  const rawIds = state.c as (string | null)[] | undefined;
  const comparisonIds: string[] = (rawIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
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

  // Clear baseline - moves current baseline to compare list and navigates away
  const clearBaseline = () => {
    if (!baselineId) return;

    // Move current baseline to compare list (if space available)
    const newComparisonIds = comparisonIds.includes(baselineId)
      ? comparisonIds
      : [...comparisonIds, baselineId].slice(0, MAX_COMPARISONS);

    setState({
      baseline: undefined,
      c: newComparisonIds,
    });

    // Navigate back to experiments list
    void router.push(`/project/${projectId}/experiments`);
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
    baselineId,
    setBaseline,
    clearBaseline,

    // Comparison
    comparisonIds,
    setComparisonIds,
    addComparisonId,
    removeComparisonId,
    maxComparisons: MAX_COMPARISONS,
    canAddMore: comparisonIds.length < MAX_COMPARISONS,

    // Layout
    layout,
    setLayout,

    // Item visibility
    itemVisibility,
    setItemVisibility,
  };
}
