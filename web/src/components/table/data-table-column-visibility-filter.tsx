import React, {
  useCallback,
  useMemo,
  type ComponentProps,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@/src/components/ui/button";
import {
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight, Component, Menu, X } from "lucide-react";
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
import { cn } from "@/src/utils/tailwind";
import { isString } from "@/src/utils/types";
import {
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  Drawer,
  DrawerClose,
} from "@/src/components/ui/drawer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/src/components/ui/collapsible";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Separator } from "@/src/components/ui/separator";

export type ColumnGroupTogglePayload = {
  groupId: string;
  enabledCount: number;
  totalCount: number;
};

interface DataTableColumnVisibilityFilterProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  columnVisibility: VisibilityState;
  setColumnVisibility: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: Dispatch<SetStateAction<ColumnOrderState>>;
  triggerSize?: ComponentProps<typeof Button>["size"];
  tableName?: string;
  isV4?: boolean;
  onColumnGroupToggle?: (payload: ColumnGroupTogglePayload) => void;
}

/**
 * A column's name for the picker: its own label before its rendered header, so
 * a column whose header carries more than its name still reads here.
 */
const getColumnLabel = <TData, TValue>(
  column: LangfuseColumnDef<TData, TValue>,
) =>
  column.headerLabel ??
  (typeof column.header === "string" && column.header
    ? column.header
    : column.accessorKey);

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
      } else {
        acc.total++;
        if (
          (column.accessorKey in columnVisibility &&
            columnVisibility[column.accessorKey]) ||
          !column.enableHiding
        ) {
          acc.count++;
        }
      }
      return acc;
    },
    { count: 0, total: 0 },
  );
};

function ColumnVisibilityListItem<TData, TValue>({
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
  const isFixedPosition = column.isFixedPosition ?? false;
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id: column.accessorKey,
      disabled: !isOrderable || isFixedPosition,
    });

  const isChecked = columnVisibility[column.accessorKey] && column.enableHiding;
  const isLocked = !column.enableHiding || isFixedPosition;
  const checkboxId = `col-${column.accessorKey}`;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-full items-center justify-between rounded-md p-2",
        isDragging ? "opacity-80" : "opacity-100",
        "hover:bg-muted/50 group transition-colors",
      )}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition: isDragging ? "none" : "transform 0.15s ease-in-out",
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={isChecked || isLocked}
          onCheckedChange={() => {
            if (!isLocked) toggleColumn(column.accessorKey);
          }}
          disabled={isLocked}
        />
        <label
          htmlFor={checkboxId}
          className={cn(
            "text-sm capitalize",
            isLocked ? "opacity-50" : "cursor-pointer",
          )}
          title={
            !column.enableHiding
              ? "This column may not be hidden"
              : isFixedPosition
                ? "This column is fixed in position and cannot be hidden"
                : undefined
          }
        >
          {getColumnLabel(column)}
        </label>
        {column.headerTooltip && (
          <DocPopup
            description={column.headerTooltip.description}
            href={column.headerTooltip.href}
          />
        )}
      </div>

      {isOrderable && !isFixedPosition && (
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
      )}
    </div>
  );
}

function GroupVisibilityHeader<TData, TValue>({
  column,
  groupTotalCount,
  groupVisibleCount,
  isOpen,
  onToggle,
  children,
  toggleAll,
}: {
  column: LangfuseColumnDef<TData, TValue>;
  groupTotalCount: number;
  groupVisibleCount: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  toggleAll: () => void;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({
      id: column.accessorKey,
    });

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <div
          ref={setNodeRef}
          className={cn(
            "bg-muted/30 flex w-full items-center justify-between gap-2 rounded-md p-2",
            isDragging ? "opacity-80" : "opacity-100",
            "hover:bg-muted group cursor-pointer",
          )}
          style={{
            transform: transform
              ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
              : undefined,
            transition: isDragging ? "none" : "transform 0.15s ease-in-out",
            zIndex: isDragging ? 1 : undefined,
          }}
        >
          <div className="flex items-center gap-2">
            <Component className="h-4 w-4 opacity-50" />
            <span className="text-sm font-bold">{getColumnLabel(column)}</span>
            <span className="text-muted-foreground text-xs">
              ({groupVisibleCount}/{groupTotalCount})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {attributes && listeners && (
              <Button
                {...attributes}
                {...listeners}
                variant="ghost"
                size="xs"
                title="Drag and drop to reorder columns"
                className="opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Menu className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 py-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                toggleAll();
              }}
            >
              {groupVisibleCount === groupTotalCount
                ? "Deselect All"
                : "Select All"}
            </Button>
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1 pl-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function setAllColumns<TData, TValue>(
  columns: LangfuseColumnDef<TData, TValue>[],
  visible: boolean,
  groupName?: string,
) {
  return (oldVisibility: VisibilityState) => {
    const newColumnVisibility: VisibilityState = { ...oldVisibility };
    columns.forEach((col) => {
      if (groupName && col.header === groupName && col.columns) {
        col.columns.forEach((subCol) => {
          if (subCol.enableHiding)
            newColumnVisibility[subCol.accessorKey] = visible;
        });
      } else if (!groupName && col.enableHiding) {
        newColumnVisibility[col.accessorKey] = visible;
        if (col.columns) {
          col.columns.forEach((subCol) => {
            newColumnVisibility[subCol.accessorKey] = visible;
          });
        }
      }
    });
    return newColumnVisibility;
  };
}

export function DataTableColumnVisibilityFilter<TData, TValue>({
  columns,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  triggerSize,
  tableName = "unknown",
  isV4 = false,
  onColumnGroupToggle,
}: DataTableColumnVisibilityFilterProps<TData, TValue>) {
  const capture = usePostHogClientCapture();
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    {},
  );

  const { defaultColumnOrder, defaultColumnVisibility } = useMemo(() => {
    return {
      defaultColumnOrder: columns.map((col) => col.accessorKey),
      defaultColumnVisibility: columns.reduce((acc, col) => {
        acc[col.accessorKey] = !col.defaultHidden;
        return acc;
      }, {} as VisibilityState),
    };
  }, [columns]);

  const toggleColumn = useCallback(
    (columnId: string) => {
      // calculate target state outside of setState to make it idempotent
      const currentValue = columnVisibility[columnId];
      const targetValue = !currentValue;
      // The event belongs to the click, not to the state updater: an updater
      // must be pure, and React invokes it twice under StrictMode — which
      // double-counted every toggle. Same payload, emitted once.
      const nextVisibility = { ...columnVisibility, [columnId]: targetValue };
      capture("table:column_visibility_changed", {
        selectedColumns: Object.keys(nextVisibility).filter(
          (key) => nextVisibility[key],
        ),
        tableName,
        isV4,
      });
      setColumnVisibility((old: any) => ({
        ...old,
        [columnId]: targetValue,
      }));
    },
    // eslint disable is because we don't want the posthog capture as deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setColumnVisibility, columnVisibility, tableName, isV4],
  );

  const toggleAllColumns = useCallback(
    (count: number, total: number, groupName?: string) => {
      if (count === total) {
        setColumnVisibility(setAllColumns(columns, false, groupName));
      } else {
        setColumnVisibility(setAllColumns(columns, true, groupName));
      }
    },
    [setColumnVisibility, columns],
  );

  const toggleGroup = (columnId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  };

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
      const activeColumn = columns.find((col) => col.accessorKey === active.id);
      const overColumn = columns.find((col) => col.accessorKey === over.id);

      // Prevent reordering if either active or over column is fixed position
      if (activeColumn?.isFixedPosition || overColumn?.isFixedPosition) {
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
      <Drawer modal={false}>
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            size={triggerSize}
            title="Show/hide columns"
          >
            <span>Columns</span>
            <div className="bg-input ml-1 rounded-sm px-1 text-xs">{`${count}/${total}`}</div>
          </Button>
        </DrawerTrigger>
        <DrawerContent portalLayer="popover" overlayClassName="bg-primary/10">
          <div className="mx-auto w-full overflow-y-auto md:max-h-full">
            <div className="sticky top-0 z-10">
              <DrawerHeader className="bg-modal flex flex-row items-center justify-between rounded-sm px-3 py-2">
                <DrawerTitle>Column Visibility</DrawerTitle>
                <div className="flex flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (setColumnOrder) {
                        setColumnOrder(defaultColumnOrder);
                      }
                      setColumnVisibility(defaultColumnVisibility);
                    }}
                  >
                    Restore Defaults
                  </Button>
                  <DrawerClose asChild>
                    <Button variant="outline" size="icon">
                      <X className="h-4 w-4" />
                    </Button>
                  </DrawerClose>
                </div>
              </DrawerHeader>
              <Separator />
            </div>
            <div>
              <div
                className="hover:bg-muted/50 my-1 flex w-full cursor-pointer items-center justify-between rounded-md p-2"
                onClick={() => toggleAllColumns(count, total)}
              >
                <div className="flex items-center gap-2">
                  <Button
                    id="toggle-all-columns"
                    variant="ghost"
                    size="sm"
                    className="hover:bg-transparent!"
                    onClick={() => toggleAllColumns(count, total)}
                  >
                    <span className="text-sm font-bold">
                      {count === total
                        ? "Deselect All Columns"
                        : "Select All Columns"}
                    </span>
                    <div className="bg-input ml-1 rounded-sm px-1 text-xs">{`${count}/${total}`}</div>
                  </Button>
                </div>
              </div>
            </div>
            <Separator />
            <div data-vaul-no-drag className="px-3 py-2">
              <SortableContext
                items={columnIdsOrder}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {columnIdsOrder.map((columnId) => {
                    const column = columns.find(
                      (col) => col.accessorKey === columnId,
                    );
                    if (!column) return null;

                    if (!!column.columns && column.columns.length > 0) {
                      // Column groups
                      const groupTotalCount = column.columns.length;
                      const groupVisibleCount = column.columns.filter(
                        (col) => columnVisibility[col.accessorKey],
                      ).length;

                      return (
                        <GroupVisibilityHeader
                          key={column.accessorKey}
                          column={column}
                          groupTotalCount={groupTotalCount}
                          groupVisibleCount={groupVisibleCount}
                          isOpen={!!openGroups[column.accessorKey]}
                          onToggle={() => toggleGroup(column.accessorKey)}
                          toggleAll={() => {
                            if (
                              column.header &&
                              typeof column.header === "string"
                            ) {
                              const enabling =
                                groupVisibleCount !== groupTotalCount;
                              toggleAllColumns(
                                groupVisibleCount,
                                groupTotalCount,
                                column.header,
                              );
                              onColumnGroupToggle?.({
                                groupId: column.accessorKey,
                                enabledCount: enabling ? groupTotalCount : 0,
                                totalCount: groupTotalCount,
                              });
                            }
                          }}
                        >
                          <div className="mt-1 space-y-1">
                            {column.columns.map((col) => (
                              <ColumnVisibilityListItem
                                key={col.accessorKey}
                                column={col}
                                columnVisibility={columnVisibility}
                                toggleColumn={toggleColumn}
                                isOrderable={false}
                              />
                            ))}
                          </div>
                        </GroupVisibilityHeader>
                      );
                    }
                    // Single columns
                    return (
                      <ColumnVisibilityListItem
                        key={column.accessorKey}
                        column={column}
                        columnVisibility={columnVisibility}
                        toggleColumn={toggleColumn}
                        isOrderable={isColumnOrderingEnabled}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </DndContext>
  );
}
