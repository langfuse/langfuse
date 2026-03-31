import {
  useQueryParams,
  withDefault,
  ArrayParam,
  StringParam,
} from "use-query-params";

const MAX_COMPARISONS = 4;

export function useExperimentComparisonState() {
  const [state, setState] = useQueryParams({
    c: withDefault(ArrayParam, []),
    layout: withDefault(StringParam, "grid"),
  });

  // Filter out null values and cast to string[]
  const rawIds = state.c as (string | null)[] | undefined;
  const comparisonIds: string[] = (rawIds ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );

  const setComparisonIds = (ids: string[]) => {
    setState({ c: ids.slice(0, MAX_COMPARISONS) });
  };

  const addComparisonId = (id: string) => {
    if (comparisonIds.length >= MAX_COMPARISONS) return;
    if (comparisonIds.includes(id)) return;
    setComparisonIds([...comparisonIds, id]);
  };

  const removeComparisonId = (id: string) => {
    setComparisonIds(comparisonIds.filter((existingId) => existingId !== id));
  };

  const layout = state.layout as "grid" | "list";

  const setLayout = (newLayout: "grid" | "list") => {
    setState({ layout: newLayout });
  };

  return {
    comparisonIds,
    setComparisonIds,
    addComparisonId,
    removeComparisonId,
    layout,
    setLayout,
    maxComparisons: MAX_COMPARISONS,
    canAddMore: comparisonIds.length < MAX_COMPARISONS,
  };
}
