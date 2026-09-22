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
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  useColumnOrder,
  useColumnVisibility,
} from "@/src/features/column-visibility";

type SettingsTableToolbarAction = ActionButtonProps extends infer TAction
  ? TAction extends ActionButtonProps
    ? Omit<TAction, "children"> & { id: string; label: string }
    : never
  : never;

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
  toolbarActions?: SettingsTableToolbarAction[];
  pagination?: PaginationBarProps;
};

export function SettingsTable<TData extends object>({
  columns,
  columnOrderKey,
  columnVisibilityKey,
  search,
  toolbarActions,
  pagination,
  ...tableProps
}: SettingsTableProps<TData>) {
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

  const hasToolbar = Boolean(search || columnVisibilityKey || toolbarActions);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {hasToolbar && (
        <div className="flex items-center justify-between gap-2">
          {search ? (
            <div className="w-full max-w-sm">
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
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
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
            {toolbarActions?.map(({ id, label, ...action }) => (
              <ActionButton key={id} {...action}>
                {label}
              </ActionButton>
            ))}
          </div>
        </div>
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
