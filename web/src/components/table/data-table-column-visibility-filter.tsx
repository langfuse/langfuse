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
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/src/components/ui/dropdown-menu";
import {
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Columns,
  Component,
  Menu,
} from "lucide-react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import DocPopup from "@/src/components/layouts/doc-popup";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/src/utils/tailwind";
import { isString } from "@/src/utils/types";

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: Dispatch<SetStateAction<ColumnOrderState>>;
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
  isOrderable = false,
}: {
  column: LangfuseColumnDef<TData, TValue>;
  toggleColumn: (columnId: string) => void;
  columnVisibility: VisibilityState;
  isOrderable?: boolean;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id: column.accessorKey,
    });

  return (
    <DropdownMenuCheckboxItem
      checked={columnVisibility[column.accessorKey] && column.enableHiding}
      onCheckedChange={() => {
        if (column.enableHiding) toggleColumn(column.accessorKey);
      }}
      ref={setNodeRef}
      className={cn(
        isDragging ? "opacity-80" : "opacity-100",
        "group whitespace-nowrap",
      )}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : "none",
        transition: "width transform 0.2s ease-in-out",
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      {!column.enableHiding && (
        <Check className="absolute left-2 h-4 w-4 opacity-50" />
      )}
      <div className="mr-1">
        <span
          className="capitalize"
          title={
            !column.enableHiding ? "This column may not be hidden" : undefined
          }
        >
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
      </div>
      {isOrderable && (
        <Button
          {...attributes}
          {...listeners}
          variant="ghost"
          size="xs"
          title="Drag and drop to reorder columns"
          className="invisible ml-auto group-hover:visible"
        >
          <Menu className="h-3 w-3" />
        </Button>
      )}
    </DropdownMenuCheckboxItem>
  );
}

function GroupVisibilityDropdownHeader<TData, TValue>({
  column,
}: {
  column: LangfuseColumnDef<TData, TValue>;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id: column.accessorKey,
    });

  return (
    <DropdownMenuSubTrigger
      hasCustomIcon
      ref={setNodeRef}
      className={cn(
        isDragging ? "opacity-80" : "opacity-100",
        "group flex w-full items-center justify-between whitespace-nowrap",
      )}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : "none",
        transition: "width transform 0.2s ease-in-out",
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <div className="flex items-center">
        <Component className="mr-2 h-4 w-4 opacity-50" />
        <span>
          {column.header && typeof column.header === "string"
            ? column.header
            : column.accessorKey}
        </span>
      </div>
      <div className="flex items-center">
        <Button
          {...attributes}
          {...listeners}
          variant="ghost"
          size="xs"
          title="Drag and drop to reorder columns"
          className="invisible group-hover:visible"
        >
          <Menu className="h-3 w-3" />
        </Button>
        <ChevronRight className="h-4 w-4" />
      </div>
    </DropdownMenuSubTrigger>
  );
}

export function DataTableColumnVisibilityFilter<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
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
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  const { count, total } = calculateColumnCounts(columns, columnVisibility);
  const columnIdsOrder = columnOrder ?? columns.map((col) => col.accessorKey);
  const isColumnOrderingEnabled = !!setColumnOrder;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      const overColumn = columns.find((col) => col.accessorKey === over.id);
      if (overColumn?.isPinned) {
        return;
      }
      if (isString(active.id) && isString(over.id)) {
        setColumnOrder!((columnOrder) => {
          const oldIndex = columnOrder.indexOf(active.id as string);
          const newIndex = columnOrder.indexOf(over.id as string);
          return arrayMove(columnOrder, oldIndex, newIndex);
        });
      }
    }
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={isColumnOrderingEnabled ? handleDragEnd : undefined}
      sensors={sensors}
    >
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
          <SortableContext
            items={columnIdsOrder}
            strategy={verticalListSortingStrategy}
          >
            {columnIdsOrder.map((columnId, index) => {
              const column = columns.find(
                (col) => col.accessorKey === columnId,
              );
              if (column) {
                if (!!column.columns && Boolean(column.columns.length)) {
                  return (
                    <DropdownMenuSub key={index}>
                      {isColumnOrderingEnabled ? (
                        <GroupVisibilityDropdownHeader column={column} />
                      ) : (
                        <DropdownMenuSubTrigger hasCustomIcon>
                          <Component className="mr-2 h-4 w-4 opacity-50" />
                          <span>
                            {column.header && typeof column.header === "string"
                              ? column.header
                              : column.accessorKey}
                          </span>
                        </DropdownMenuSubTrigger>
                      )}
                      <DropdownMenuPortal>
                        <DropdownMenuSubContent>
                          {column.columns.map((col) => (
                            <ColumnVisibilityDropdownItem
                              key={col.accessorKey}
                              column={col}
                              columnVisibility={columnVisibility}
                              toggleColumn={toggleColumn}
                              isOrderable={false} // grouped columns are not orderable, group may only be ordered as a whole
                            />
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuPortal>
                    </DropdownMenuSub>
                  );
                } else if (!column.isPinned)
                  return (
                    <ColumnVisibilityDropdownItem
                      key={column.accessorKey}
                      column={column}
                      columnVisibility={columnVisibility}
                      toggleColumn={toggleColumn}
                      isOrderable={isColumnOrderingEnabled}
                    />
                  );
              }
              return null;
            })}
          </SortableContext>
        </DropdownMenuContent>
      </DropdownMenu>
    </DndContext>
  );
}
