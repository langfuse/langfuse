import React, {
  useCallback,
  type Dispatch,
  type SetStateAction,
  useState,
  useMemo,
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

const UNGROUPED = "ungrouped";

const calculateColumnCounts = <TData, TValue>(
  groups: { title: string; columns: LangfuseColumnDef<TData, TValue>[] }[],
  columnVisibility: VisibilityState,
) => {
  return groups.reduce(
    (acc, group) => {
      group.columns.forEach((column) => {
        if (column.enableHiding) {
          acc.total++;
          if (
            "accessorKey" in column &&
            column.accessorKey in columnVisibility &&
            columnVisibility[column.accessorKey]
          ) {
            acc.count++;
          }
        }
      });
      return acc;
    },
    { count: 0, total: 0 },
  );
};

const partitionColumnsByGroup = <TData, TValue>(
  columns: LangfuseColumnDef<TData, TValue>[],
) => {
  return columns.reduce(
    (acc, col) => {
      if ("columns" in col && !!col.columns) {
        acc.push({
          title: typeof col.header === "string" ? col.header : col.accessorKey,
          columns: col.columns,
        });
      } else {
        const ungrouped = acc.find((group) => group.title === UNGROUPED);
        if (ungrouped) {
          ungrouped.columns.push(col);
        } else {
          acc.push({ title: UNGROUPED, columns: [col] });
        }
      }
      return acc;
    },
    [] as { title: string; columns: LangfuseColumnDef<TData, TValue>[] }[],
  );
};

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

  const columnsByGroup = useMemo(
    () => partitionColumnsByGroup(columns),
    [columns],
  );

  const { count, total } = calculateColumnCounts(
    columnsByGroup,
    columnVisibility,
  );

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
        {columnsByGroup.map(({ title, columns }, index) => {
          if (title === UNGROUPED) {
            return columns.map(
              (column) =>
                "accessorKey" in column &&
                column.enableHiding && (
                  <DropdownMenuCheckboxItem
                    key={column.accessorKey}
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
                ),
            );
          }

          if (!Boolean(columns.length)) return null;
          return (
            <div key={index}>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{title}</DropdownMenuLabel>
              {columns.map((column) => {
                if ("accessorKey" in column && column.enableHiding) {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.accessorKey}
                      className="capitalize"
                      checked={columnVisibility[column.accessorKey]}
                      onCheckedChange={() =>
                        toggleColumn(column.accessorKey.toString())
                      }
                    >
                      <span className="capitalize" title={column.accessorKey}>
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
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
