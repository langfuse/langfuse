import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
} from "use-query-params";
import { MAX_SELECTED_EXPERIMENTS } from "@/src/features/experiments/constants/comparison";

export function useExperimentResultsState() {
  const [state, setState] = useQueryParams({
    baseline: withDefault(StringParam, undefined),
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, "grid"),
    itemVisibility: withDefault(StringParam, "baseline-only"),
  });

  // The URL keeps the explicit baseline separate from comparison IDs. Internally,
  // the baseline is part of one ordered selection list instead.
  const explicitBaselineId = state.baseline as string | undefined;

  // Parse comparison IDs - filter out null values, cast to strings, and dedupe.
  const rawIds = state.c as (string | null)[] | undefined;
  const urlComparisonIds: string[] = (rawIds ?? [])
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .filter((id, index, ids) => ids.indexOf(id) === index);

  const selectedExperimentIds = [
    ...(explicitBaselineId ? [explicitBaselineId] : []),
    ...urlComparisonIds,
  ]
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, MAX_SELECTED_EXPERIMENTS);

  const comparisonIds = selectedExperimentIds.filter(
    (id) => id !== explicitBaselineId,
  );
  const hasBaseline = Boolean(explicitBaselineId);

  const serializeSelection = (
    selectedIds: string[],
    nextExplicitBaselineId: string | undefined,
  ) => {
    const nextSelectedIds = selectedIds
      .filter((id, index) => selectedIds.indexOf(id) === index)
      .slice(0, MAX_SELECTED_EXPERIMENTS);
    const baseline = nextExplicitBaselineId
      ? nextSelectedIds.includes(nextExplicitBaselineId)
        ? nextExplicitBaselineId
        : undefined
      : undefined;

    setState({
      baseline,
      c: baseline
        ? nextSelectedIds.filter((id) => id !== baseline)
        : nextSelectedIds,
    });
  };

  // Set baseline with reconciliation. Selecting a new baseline adds it to the
  // selection and evicts the last selection when the total limit is reached.
  const setBaseline = (id: string | undefined) => {
    if (!id) {
      clearBaseline();
      return;
    }

    serializeSelection(
      [id, ...selectedExperimentIds.filter((selectedId) => selectedId !== id)],
      id,
    );
  };

  // Clear the explicit baseline while preserving the selected experiments.
  const clearBaseline = () => {
    if (!explicitBaselineId) return;

    serializeSelection([...comparisonIds, explicitBaselineId], undefined);
  };

  // Comparison management. The baseline is excluded from c when explicitly
  // selected; without a baseline, c contains all selected experiments.
  const setComparisonIds = (ids: string[]) => {
    const filtered = ids.filter(
      (id, index) => id !== explicitBaselineId && ids.indexOf(id) === index,
    );
    serializeSelection(
      explicitBaselineId ? [explicitBaselineId, ...filtered] : ids,
      explicitBaselineId,
    );
  };

  const addComparisonId = (id: string) => {
    if (id === explicitBaselineId) return; // Can't compare baseline with itself
    if (selectedExperimentIds.length >= MAX_SELECTED_EXPERIMENTS) return;
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
