import { useState } from "react";
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
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { DropdownMenu } from "@/src/components/design-system/DropdownMenu/DropdownMenu";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { Rows3 } from "lucide-react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { cn } from "@/src/utils/tailwind";
import {
  useColumnOrder,
  useColumnVisibility,
} from "@/src/features/column-visibility";

export type SettingsTableToolbarAction = ActionButtonProps extends infer TAction
  ? TAction extends ActionButtonProps
    ? Omit<TAction, "children"> & { id: string; label: string }
    : never
  : never;

type SettingsTableFilter = {
  id: string;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (value: string[]) => void;
};

export type SettingsTableProps<TData extends object> = Omit<
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
  filters?: SettingsTableFilter[];
  toolbarActions?: SettingsTableToolbarAction[];
  toolbarNotice?: string;
  rowHeightControl?: {
    rowHeight: RowHeight;
    onRowHeightChange: (height: RowHeight) => void;
  };
  pagination?: PaginationBarProps;
};

export function SettingsTable<TData extends object>({
  columns,
  columnOrderKey,
  columnVisibilityKey,
  search,
  filters,
  toolbarActions,
  toolbarNotice,
  rowHeightControl,
  pagination,
  ...tableProps
}: SettingsTableProps<TData>) {
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
    columnVisibilityKey ||
    toolbarActions ||
    rowHeightControl,
  );

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
              <div key={filter.id} className="w-44 shrink-0">
                <MultiSelectInput
                  aria-label={`Filter by ${filter.label.toLowerCase()}`}
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
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
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
                    <Rows3 className="h-4 w-4" />
                  </Button>
                )}
              </DropdownMenu>
            )}
            {toolbarActions?.map(({ id, label, ...action }) => (
              <ActionButton key={id} {...action}>
                {label}
              </ActionButton>
            ))}
          </div>
        </div>
      )}

      {toolbarNotice && (
        <p className="text-muted-foreground text-xs">{toolbarNotice}</p>
      )}

      <SettingsTableCard>
        <Table
          columns={columns}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          {...tableProps}
        />
        {pagination && <PaginationBar {...pagination} />}
      </SettingsTableCard>
    </div>
  );
}
