import React, {
  useCallback,
  type Dispatch,
  type SetStateAction,
  useState,
} from "react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import { type VisibilityState } from "@tanstack/react-table";
import { ChevronDownIcon } from "lucide-react";
import { type LangfuseColumnDef } from "@/src/components/table/types";

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
}

export function DataTableColumnVisibilityFilter<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
}: DataTableColumnVisibilityFilterProps<TData, TValue>) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumnVisibility((old) => ({
        ...old,
        [columnId]: !old[columnId],
      }));
    },
    [setColumnVisibility],
  );

  const calculateColumnCounts = (
    columns: LangfuseColumnDef<TData, TValue>[],
    columnVisibility: VisibilityState,
  ) => {
    return columns.reduce(
      (acc, column) => {
        if (column.enableHiding) {
          acc.total++;
          if (
            column.accessorKey in columnVisibility &&
            columnVisibility[column.accessorKey]
          ) {
            acc.count++;
          }
        }
        return acc;
      },
      { count: 0, total: 0 },
    );
  };

  const { count, total } = calculateColumnCounts(columns, columnVisibility);

  return (
    <DropdownMenu open={isOpen}>
      <DropdownMenuTrigger
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        className="select-none"
        asChild
      >
        <Button variant="outline" className="ml-auto">
          Columns {count <= total ? `${count}/${total}` : ""}
          <ChevronDownIcon className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onPointerDownOutside={() => setIsOpen(false)}
      >
        {columns.map(
          (column, index) =>
            "accessorKey" in column &&
            column.enableHiding && (
              <DropdownMenuCheckboxItem
                key={index}
                className="capitalize"
                checked={columnVisibility[column.accessorKey]}
                onCheckedChange={() =>
                  toggleColumn(column.accessorKey.toString())
                }
              >
                {column.header?.toString() ?? column.accessorKey.toString()}
              </DropdownMenuCheckboxItem>
            ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
