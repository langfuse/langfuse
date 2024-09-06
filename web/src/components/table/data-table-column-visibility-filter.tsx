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
import {
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, Columns, Menu, Pin } from "lucide-react";
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

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder: string[];
  setColumnOrder: Dispatch<SetStateAction<ColumnOrderState>>;
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
        "whitespace-nowrap",
      )}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : "none",
        transition: "width transform 0.2s ease-in-out",
        zIndex: isDragging ? 1 : 0,
      }}
    >
      {!column.enableHiding && <Pin className="absolute left-2 h-3 w-3" />}
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
      {isOrderable && (
        <Button
          {...attributes}
          {...listeners}
          variant="ghost"
          size="xs"
          title="Drag and drop to reorder columns"
          className="ml-auto"
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
    <DropdownMenuLabel
      ref={setNodeRef}
      className={cn(
        isDragging ? "opacity-80" : "opacity-100",
        "flex whitespace-nowrap",
      )}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : "none",
        transition: "width transform 0.2s ease-in-out",
        zIndex: isDragging ? 1 : 0,
      }}
    >
      {column.header && typeof column.header === "string"
        ? column.header
        : column.accessorKey}
      <Button
        {...attributes}
        {...listeners}
        variant="ghost"
        size="xs"
        title="Drag and drop to reorder columns"
        className="ml-auto"
      >
        <Menu className="h-3 w-3" />
      </Button>
    </DropdownMenuLabel>
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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      const overColumn = columns.find(
        (col) => col.accessorKey === (over.id as string),
      );
      if (overColumn?.isPinned) return; // also send toast message to user
      setColumnOrder!((columnOrder) => {
        const oldIndex = columnOrder.indexOf(active.id as string);
        const newIndex = columnOrder.indexOf(over.id as string);
        return arrayMove(columnOrder, oldIndex, newIndex);
      });
    }
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
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
            items={columnOrder}
            strategy={verticalListSortingStrategy}
          >
            {columnOrder.map((columnId, index) => {
              const column = columns.find(
                (col) => col.accessorKey === columnId,
              );
              if (column) {
                if (!!column.columns && Boolean(column.columns.length)) {
                  const isFollowingGroup =
                    "columns" in (columns[index - 1] ?? {});
                  return (
                    <div key={index}>
                      {!isFollowingGroup && <DropdownMenuSeparator />}
                      <GroupVisibilityDropdownHeader column={column} />
                      {column.columns.map((column) => (
                        <ColumnVisibilityDropdownItem
                          key={column.accessorKey}
                          column={column}
                          columnVisibility={columnVisibility}
                          toggleColumn={toggleColumn}
                          isOrderable={false} // grouped columns are not orderable, group may only be ordered as a whole
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
                      isOrderable={!column.isPinned}
                    />
                  );
              }
            })}
          </SortableContext>
        </DropdownMenuContent>
      </DropdownMenu>
    </DndContext>
  );
}
