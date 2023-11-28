import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { type VisibilityState } from "@tanstack/react-table";
import { type Dispatch, type SetStateAction } from "react";

interface DataTableColumnVisibilityProps {
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  allColumns: {
    id: string;
    getIsVisible: () => boolean;
    toggleVisibility: (isVisible: boolean) => void;
    getCanHide: () => boolean;
  }[];
}

export function DataTableColumnVisibility({
  columnVisibility,
  setColumnVisibility,
  allColumns,
}: DataTableColumnVisibilityProps) {
  const handleVisibilityChange = (columnId: string, isVisible: boolean) => {
    setColumnVisibility((prev) => ({
      ...prev,
      [columnId]: isVisible,
    }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="ml-auto">
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allColumns
          .filter((column) => column.getCanHide())
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={columnVisibility[column.id] ?? column.getIsVisible()}
              onCheckedChange={(isVisible) =>
                handleVisibilityChange(column.id, isVisible)
              }
            >
              {column.id}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
