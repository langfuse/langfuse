import { useState, useEffect } from "react";
import { type ColumnSizingState } from "@tanstack/react-table";

function useColumnSizing(localStorageKey: string) {
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
