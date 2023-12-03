import React, { useCallback, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import { type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { ChevronDownIcon } from "lucide-react";

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
}

export function DataTableColumnVisibilityFilter<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
}: DataTableColumnVisibilityFilterProps<TData, TValue>) {
  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumnVisibility((old) => ({
        ...old,
        [columnId]: !old[columnId],
      }));
    },
    [setColumnVisibility],
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto">
          Columns
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {columns.map(
          (column, index) =>
            "accessorKey" in column && (
              <DropdownMenuCheckboxItem
                key={index}
                className="capitalize"
                checked={columnVisibility[column.accessorKey]}
                onCheckedChange={() =>
                  toggleColumn(column.accessorKey.toString())
                }
              >
                {column.accessorKey.toString()}
              </DropdownMenuCheckboxItem>
            ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
