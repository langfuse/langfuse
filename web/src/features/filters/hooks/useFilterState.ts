import { type FilterState, type TableName } from "@langfuse/shared";
import { useQueryParam, withDefault } from "use-query-params";
import useSessionStorage from "@/src/components/useSessionStorage";
import { getCommaArrayParam } from "@/src/features/filters/lib/v3-filter-query-encoding";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";

// manage state with hook
export const useQueryFilterState = (
  initialState: FilterState = [],
  table: TableName,
  projectId?: string, // Passing projectId is expected as filters might differ across projects. However, we can't call hooks conditionally. There is a case in the prompts table where this will only be used if projectId is defined, but it's not defined in all cases.
) => {
  const peekContext = usePeekTableState();

  const [sessionFilterState, setSessionFilterState] =
    useSessionStorage<FilterState>(
      !!projectId ? `${table}FilterState-${projectId}` : `${table}FilterState`,
      initialState,
    );
  // Merge initial state with session state if filter elements don't exist
  const mergedInitialState = initialState.reduce(
    (acc, filter) => {
      const exists = sessionFilterState.some((f) => f.column === filter.column);
      if (!exists) {
        acc.push(filter);
      }
      return acc;
    },
    [...sessionFilterState],
  );

  // Update session storage with merged state
  if (mergedInitialState.length !== sessionFilterState.length) {
    setSessionFilterState(mergedInitialState);
  }

  // Note: `use-query-params` library does not automatically update the URL with the default value
  const [filterState, setFilterState] = useQueryParam(
    "filter",
    withDefault(getCommaArrayParam(table), sessionFilterState),
  );

  if (peekContext) {
    const setState = (newFilters: FilterState) => {
      peekContext.setTableState({
        ...peekContext.tableState,
        filters: newFilters,
      });
    };
    return [peekContext.tableState.filters, setState] as const;
  }

  const setFilterStateWithSession = (newState: FilterState): void => {
    setFilterState(newState);
    setSessionFilterState(newState);
  };

  return [filterState, setFilterStateWithSession] as const;
};
