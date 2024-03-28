import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useEffect } from "react";
import { isEqual } from "lodash";

function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const initialVisibilityState = () => {
    const visibilityState: VisibilityState = {};
    columns.forEach((column) => {
      if (
        "accessorKey" in column &&
        typeof column.accessorKey === "string" &&
        column.enableHiding
      ) {
        visibilityState[column.accessorKey] = !(column.defaultHidden === true);
      }
    });
    return visibilityState;
  };

  const [columnVisibility, setColumnVisibility] =
    useLocalStorage<VisibilityState>(localStorageKey, initialVisibilityState());

  useEffect(() => {
    const initialColumnVisibility = initialVisibilityState();
    Object.keys(initialColumnVisibility).forEach((key) => {
      if (Object.hasOwn(columnVisibility, key)) {
        initialColumnVisibility[key] = columnVisibility[key];
      }
    });

    if (!isEqual(initialColumnVisibility, columnVisibility)) {
      setColumnVisibility(initialColumnVisibility);
    }
  }, [columnVisibility, setColumnVisibility]);

  return [columnVisibility, setColumnVisibility] as const;
}

export default useColumnVisibility;
