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
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { type VisibilityState } from "@tanstack/react-table";
import { ChevronDown, Columns } from "lucide-react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import DocPopup from "@/src/components/layouts/doc-popup";

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
}

const calculateColumnCounts = <TData, TValue>(
  columns: LangfuseColumnDef<TData, TValue>[],
  columnVisibility: VisibilityState,
) => {
  return columns.reduce(
    (acc, column) => {
      if (column.columns) {
        const groupCounts = calculateColumnCounts(
          column.columns,
          columnVisibility,
        );
        acc.count += groupCounts.count;
        acc.total += groupCounts.total;
      } else if (column.enableHiding) {
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

function ColumnVisibilityDropdownItem<TData, TValue>({
  column,
  toggleColumn,
  columnVisibility,
}: {
  column: LangfuseColumnDef<TData, TValue>;
  toggleColumn: (columnId: string) => void;
  columnVisibility: VisibilityState;
}) {
  if (column.enableHiding) {
    return (
      <DropdownMenuCheckboxItem
        checked={columnVisibility[column.accessorKey]}
        onCheckedChange={() => toggleColumn(column.accessorKey)}
      >
        <span className="capitalize">
          {column.header && typeof column.header === "string"
            ? column.header
            : column.accessorKey}
        </span>
        {column.headerTooltip && (
          <DocPopup
            description={column.headerTooltip.description}
            href={column.headerTooltip.href}
          />
        )}
      </DropdownMenuCheckboxItem>
    );
  }
}

export function DataTableColumnVisibilityFilter<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
}: DataTableColumnVisibilityFilterProps<TData, TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumnVisibility((old) => {
        const newColumnVisibility = {
          ...old,
          [columnId]: !old[columnId],
        };
        const selectedColumns = Object.keys(newColumnVisibility).filter(
          (key) => newColumnVisibility[key],
        );
        capture("table:column_visibility_changed", {
          selectedColumns: selectedColumns,
        });
        return newColumnVisibility;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setColumnVisibility],
  );

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
        <Button variant="outline" title="Show/hide columns">
          <Columns className="mr-2 h-4 w-4" />
          <span className="text-xs text-muted-foreground">{`(${count}/${total})`}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onPointerDownOutside={() => setIsOpen(false)}
        className="max-h-96 overflow-y-auto"
      >
        {columns.map((column, index) => {
          if (!!column.columns && Boolean(column.columns.length)) {
            const isFollowingGroup = "columns" in (columns[index - 1] ?? {});
            return (
              <div key={index}>
                {!isFollowingGroup && <DropdownMenuSeparator />}
                <DropdownMenuLabel>
                  {column.header && typeof column.header === "string"
                    ? column.header
                    : column.accessorKey}
                </DropdownMenuLabel>
                {column.columns.map((column) => (
                  <ColumnVisibilityDropdownItem
                    key={column.accessorKey}
                    column={column}
                    columnVisibility={columnVisibility}
                    toggleColumn={toggleColumn}
                  />
                ))}
                <DropdownMenuSeparator />
              </div>
            );
          } else
            return (
              <ColumnVisibilityDropdownItem
                key={column.accessorKey}
                column={column}
                columnVisibility={columnVisibility}
                toggleColumn={toggleColumn}
              />
            );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
