import { useCallback, useMemo } from "react";
import { useKeyedSessionStorageState } from "./useKeyedSessionStorageState";

export function useFilterExpandedState(params: {
  tableName: string;
  defaultExpanded?: string[];
}) {
  const storageKey = `${params.tableName}-filters-expanded`;
  const defaultExpandedString = useMemo(
    () => (params.defaultExpanded ?? []).join(","),
    [params.defaultExpanded],
  );

  const [expandedString, setExpandedString] = useKeyedSessionStorageState(
    storageKey,
    defaultExpandedString,
  );

  const expandedState = useMemo(
    () => expandedString.split(",").filter(Boolean),
    [expandedString],
  );

  const onExpandedChange = useCallback(
    (value: string[]) => {
      setExpandedString(value.join(","));
    },
    [setExpandedString],
  );

  return {
    expandedState,
    onExpandedChange,
  };
}
