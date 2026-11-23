import { useState, type ComponentProps, type ReactNode } from "react";
import {
  ActionButton,
  type ActionButtonProps,
} from "@/src/components/ActionButton";
import {
  PaginationBar,
  type PaginationBarProps,
} from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  Table,
  type TableProps,
} from "@/src/components/design-system/table/Table";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { TableCardContainer } from "@/src/components/layouts/TableCardContainer";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/DataTableColumnVisibilityFilter";
import { DataTableSelectAllBanner } from "@/src/components/table/data-table-multi-select-actions/DataTableSelectAllBanner";
import { isSelectAllBannerVisible } from "@/src/components/table/data-table-multi-select-actions/isSelectAllBannerVisible";
import { type MultiSelect } from "@/src/components/table/data-table-toolbar";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Rows3 } from "@langfuse/icons";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { cn } from "@/src/utils/tailwind";
import { default as useColumnOrder } from "@/src/features/column-visibility/hooks/useColumnOrder";
import { default as useColumnVisibility } from "@/src/features/column-visibility/hooks/useColumnVisibility";

export type TableCardToolbarAction = ActionButtonProps extends infer TAction
  ? TAction extends ActionButtonProps
    ? Omit<TAction, "children" | "size"> & {
        id: string;
        label: string;
        size?: Exclude<NonNullable<ActionButtonProps["size"]>, "icon">;
        dropdown?: Omit<ComponentProps<typeof DropdownMenu>, "children">;
      }
    : never
  : never;

type TableCardFilter =
  | (TableCardFilterBase & {
      type?: "multi-select";
      value: string[];
      onChange: (value: string[]) => void;
    })
  | (TableCardFilterBase & {
      type: "select";
      value: string;
      onChange: (value: string) => void;
      muted?: boolean;
      /** The trigger's minimum width in px; the open menu is as wide as the trigger, so this also widens the menu. */
      minWidth?: number;
    });

type TableCardFilterBase = {
  id: string;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
};

export type TableCardProps<TData extends object> = Omit<
  TableProps<TData>,
  "columns"
> & {
  columns: LangfuseColumnDef<TData>[];
  columnOrderKey?: string;
  columnVisibilityKey?: string;
  search?: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
  };
  filters?: TableCardFilter[];
  emptyState?: ReactNode;
  toolbarContent?: ReactNode;
  toolbarActions?: TableCardToolbarAction[];
  rowHeightControl?: {
    rowHeight: RowHeight;
    onRowHeightChange: (height: RowHeight) => void;
  };
  pagination?: PaginationBarProps;
  /** Offers selecting every matching row across pages once the whole first page is selected. */
  multiSelect?: MultiSelect;
};

export function TableCard<TData extends object>({
  columns,
  columnOrderKey,
  columnVisibilityKey,
  search,
  filters,
  emptyState,
  toolbarContent,
  toolbarActions,
  rowHeightControl,
  pagination,
  multiSelect,
  ...tableProps
}: TableCardProps<TData>) {
  const capture = usePostHogClientCapture();
  const [columnVisibility, setColumnVisibility] = useColumnVisibility(
    columnVisibilityKey ?? `${tableProps.tableName}ColumnVisibility`,
    columns,
  );
  const [columnOrder, setColumnOrder] = useColumnOrder(
    columnOrderKey ?? `${tableProps.tableName}ColumnOrder`,
    columns,
  );
  const [searchDraft, setSearchDraft] = useState(() => ({
    value: search?.value ?? "",
    committedValue: search?.value ?? "",
  }));
  const searchValue =
    search && search.value !== searchDraft.committedValue
      ? search.value
      : searchDraft.value;

  const hasFilters = Boolean(filters?.length);
  const hasToolbar = Boolean(
    search ||
    hasFilters ||
    toolbarContent ||
    columnVisibilityKey ||
    toolbarActions ||
    rowHeightControl,
  );
  const showEmptyState =
    emptyState !== undefined &&
    tableProps.data.status === "success" &&
    tableProps.data.data.length === 0;

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {hasToolbar && (
        <div
          className={cn(
            "flex items-center justify-between gap-2",
            hasFilters && "flex-wrap",
          )}
        >
          <div
            className={cn(
              "flex flex-1 items-center gap-2",
              hasFilters ? "min-w-72" : "min-w-0",
            )}
          >
            {toolbarContent}
            {search && (
              <div className="w-full max-w-sm min-w-0">
                <SearchInput
                  value={searchValue}
                  placeholder={search.placeholder}
                  onChange={(value) => {
                    setSearchDraft({ value, committedValue: search.value });
                    if (value === "") search.onChange("");
                  }}
                  onSubmit={(value) => {
                    setSearchDraft({ value, committedValue: value });
                    search.onChange(value);
                  }}
                />
              </div>
            )}
            {filters?.map((filter) => (
              <TableCardFilterInput key={filter.id} filter={filter} />
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {columnVisibilityKey && (
              <DataTableColumnVisibilityFilter
                columns={columns}
                columnVisibility={columnVisibility}
                setColumnVisibility={setColumnVisibility}
                columnOrder={columnOrder}
                setColumnOrder={setColumnOrder}
                tableName={tableProps.tableName}
                isV4
              />
            )}
            {rowHeightControl && (
              <DropdownMenu
                title="Row height"
                items={(
                  [
                    { id: "s", title: "Small" },
                    { id: "m", title: "Medium" },
                    { id: "l", title: "Large" },
                  ] as const
                ).map(({ id, title }) => ({
                  type: "checkbox" as const,
                  id,
                  title,
                  checked: rowHeightControl.rowHeight === id,
                  closeOnCheckedChange: false,
                  onCheckedChange: () => {
                    capture("table:row_height_switch_select", {
                      rowHeight: id,
                      tableName: tableProps.tableName,
                      isV4: true,
                    });
                    rowHeightControl.onRowHeightChange(id);
                  },
                }))}
              >
                {({ getTriggerProps }) => (
                  <Button
                    {...getTriggerProps()}
                    variant="outline"
                    size="icon"
                    title="Row height"
                    aria-label="Row height"
                  >
                    <Rows3 size="base" color="default" />
                  </Button>
                )}
              </DropdownMenu>
            )}
            {toolbarActions?.map(({ id, label, dropdown, ...action }) => {
              if (dropdown) {
                return (
                  <DropdownMenu key={id} {...dropdown}>
                    {({ getTriggerProps }) => (
                      <ActionButton {...action} {...getTriggerProps()}>
                        {label}
                      </ActionButton>
                    )}
                  </DropdownMenu>
                );
              }

              return (
                <ActionButton key={id} {...action}>
                  {label}
                </ActionButton>
              );
            })}
          </div>
        </div>
      )}

      {multiSelect && isSelectAllBannerVisible(multiSelect) && (
        <DataTableSelectAllBanner {...multiSelect} />
      )}

      {showEmptyState ? (
        emptyState
      ) : (
        <div className="mb-4 flex min-h-0 flex-col">
          <TableCardContainer>
            <Table
              columns={columns}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              columnOrder={columnOrder}
              onColumnOrderChange={setColumnOrder}
              {...tableProps}
            />
            {pagination && <PaginationBar {...pagination} />}
          </TableCardContainer>
        </div>
      )}
    </div>
  );
}

function TableCardFilterInput({ filter }: { filter: TableCardFilter }) {
  const ariaLabel = `Filter by ${filter.label.toLowerCase()}`;

  if (filter.type === "select") {
    return (
      <div className="grid shrink-0" style={{ minWidth: filter.minWidth }}>
        {/* The open menu is as wide as the trigger, so the trigger is sized to
            its longest option rather than to the current selection. */}
        {filter.options.map((option) => (
          <div
            key={option.value}
            inert
            aria-hidden="true"
            className="invisible col-start-1 row-start-1"
          >
            <SelectInput
              value={option.value}
              options={filter.options}
              onValueChange={filter.onChange}
              placeholder={filter.placeholder}
            />
          </div>
        ))}
        <div className="col-start-1 row-start-1">
          <SelectInput
            aria-label={ariaLabel}
            value={filter.value}
            options={filter.options}
            onValueChange={filter.onChange}
            placeholder={filter.placeholder}
            muted={filter.muted}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="w-44 shrink-0">
      <MultiSelectInput
        aria-label={ariaLabel}
        value={filter.value}
        options={filter.options}
        onValueChange={filter.onChange}
        placeholder={filter.placeholder}
        selectedLabel={filter.options
          .filter((option) => filter.value.includes(option.value))
          .map((option) => option.label)
          .join(", ")}
        searchPlaceholder="Search..."
        emptyMessage="No options found."
      />
    </div>
  );
}
