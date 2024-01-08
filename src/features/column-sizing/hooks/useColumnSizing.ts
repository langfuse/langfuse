import { useState, useEffect } from "react";
import { type ColumnSizingState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";

function useColumnSizing<TData>(
  localStorageKey: string,
  // We currently do not examine passed columns, but we might in the future.
  _columns: LangfuseColumnDef<TData>[],
) {
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const savedSizing = localStorage.getItem(localStorageKey);
      const sizingState: ColumnSizingState = savedSizing
        ? (JSON.parse(savedSizing) as ColumnSizingState)
        : {};
      return sizingState;
    } catch (e) {
      console.error("Error while loading saved column sizing", e);
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(columnSizing));
  }, [columnSizing, localStorageKey]);

  return [columnSizing, setColumnSizing] as const;
}

export default useColumnSizing;
