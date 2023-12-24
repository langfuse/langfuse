import { useState, useEffect } from "react";
import { type VisibilityState } from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";

function useColumnVisibility<TData>(
  localStorageKey: string,
  columns: LangfuseColumnDef<TData>[],
) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      try {
        const savedVisibility = localStorage.getItem(localStorageKey);
        const visibilityState: VisibilityState = savedVisibility
          ? (JSON.parse(savedVisibility) as VisibilityState)
          : {};
        // set default visibility for columns that are not in the saved state
        columns.forEach((column) => {
          if (
            "accessorKey" in column &&
            typeof column.accessorKey === "string"
          ) {
            if (!(column.accessorKey in visibilityState)) {
              visibilityState[column.accessorKey] =
                column.defaultHidden === true ? false : true;
            }
          }
        });
        return visibilityState;
      } catch (e) {
        console.error("Error while loading saved column visibility", e);
        return {};
      }
    },
  );

  useEffect(() => {
    const localStorageItem = localStorage.getItem(localStorageKey);

    if (!localStorageItem || localStorageItem === "{}") {
      const initialVisibility: VisibilityState = {};
      columns.forEach((column) => {
        if ("accessorKey" in column && typeof column.accessorKey === "string") {
          initialVisibility[column.accessorKey] =
            column.defaultHidden === true ? false : true;
        }
      });
      setColumnVisibility(initialVisibility);
    } else {
      // make sure all columns are in the visibility state
      const visibilityState = JSON.parse(localStorageItem) as VisibilityState;
      columns.forEach((column) => {
        if ("accessorKey" in column && typeof column.accessorKey === "string") {
          if (!(column.accessorKey in visibilityState)) {
            visibilityState[column.accessorKey] =
              column.defaultHidden === true ? false : true;
          }
        }
      });
    }
  }, [columns, localStorageKey]);

  useEffect(() => {
    localStorage.setItem(localStorageKey, JSON.stringify(columnVisibility));
  }, [columnVisibility, localStorageKey]);

  return [columnVisibility, setColumnVisibility] as const;
}

export default useColumnVisibility;
