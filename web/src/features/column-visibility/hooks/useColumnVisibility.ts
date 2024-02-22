import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useEffect } from "react";

function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const initialVisibilityState = () => {
    const visibilityState: VisibilityState = {};
    columns.forEach((column) => {
      if ("accessorKey" in column && typeof column.accessorKey === "string") {
        visibilityState[column.accessorKey] =
          column.defaultHidden === true ? false : true;
      }
    });
    return visibilityState;
  };

  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(localStorageKey, initialVisibilityState());

  useEffect(() => {
    if (Object.keys(columnVisibility).length === 0) {
      const initialVisibility: VisibilityState = {};
      columns.forEach((column) => {
        if ("accessorKey" in column && typeof column.accessorKey === "string") {
          initialVisibility[column.accessorKey] =
            column.defaultHidden === true ? false : true;
        }
      });
      setColumnVisibility(initialVisibility);
    }
  }, [columnVisibility, columns, setColumnVisibility]);

  return [columnVisibility, setColumnVisibility] as const;
}

export default useColumnVisibility;
