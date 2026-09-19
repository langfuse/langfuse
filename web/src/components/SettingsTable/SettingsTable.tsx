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
import { useColumnVisibility } from "@/src/features/column-visibility";

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
  columnVisibilityKey?: string;
  search?: {
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
  };
  toolbarActions?: SettingsTableToolbarAction[];
  pagination: PaginationBarProps;
};

export function SettingsTable<TData extends object>({
  columns,
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

  const hasToolbar = Boolean(search || columnVisibilityKey || toolbarActions);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      {hasToolbar && (
        <div className="flex items-center justify-between gap-2">
          {search ? (
            <div className="w-full max-w-sm">
              <SearchInput
                value={search.value}
                placeholder={search.placeholder}
                onChange={search.onChange}
                onSubmit={search.onChange}
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
          {...tableProps}
        />
        <PaginationBar {...pagination} />
      </SettingsTableCard>
    </div>
  );
}
