import { useState, useEffect } from "react";
import { type ColumnDef, type VisibilityState } from "@tanstack/react-table";

function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: ColumnDef<TData>[],
) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      const savedVisibility = localStorage.getItem(localStorageKey);
      return savedVisibility
        ? (JSON.parse(savedVisibility) as VisibilityState)
        : {};
    },
  );

  useEffect(() => {
    const localStorageItem = localStorage.getItem(localStorageKey);

    if (!localStorageItem || localStorageItem === "{}") {
      const initialVisibility: VisibilityState = {};
      columns.forEach((column) => {
        if ("accessorKey" in column && typeof column.accessorKey === "string") {
          initialVisibility[column.accessorKey] = true;
        }
      });
      setColumnVisibility(initialVisibility);
    }
  }, [columns, localStorageKey]);

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(columnVisibility));
  }, [columnVisibility, localStorageKey]);

  return [columnVisibility, setColumnVisibility] as const;
}

export default useColumnVisibility;
