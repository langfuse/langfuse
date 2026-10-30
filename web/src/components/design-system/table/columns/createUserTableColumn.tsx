import { type CellContext, type RowData } from "@tanstack/react-table";

import {
  UserTableCell,
  type UserTableColumnValue,
} from "@/src/components/design-system/table/components/UserTableCell/UserTableCell";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type UserTableColumnPresentation = { variant: "avatar" } | { variant: "text" };
type UserTableColumnCell =
  | { type: "loading" }
  | { type: "user"; user: UserTableColumnValue }
  | undefined;

export function createUserTableColumn<
  TData extends RowData,
  TValue extends UserTableColumnValue = UserTableColumnValue,
>({
  getUser,
  emptyValue,
  nullValue,
  variant,
  ...options
}: TableColumnOptions<TData, TValue> &
  UserTableColumnPresentation & {
    /**
     * A word for a user whose identity is unknown, e.g. "Unknown". Defaults to
     * the shared empty placeholder.
     */
    emptyValue?: string;
    nullValue?: string;
    /**
     * Return undefined when the row has no associated user. Return a user with
     * an empty object when a user exists but their identity is unknown.
     */
    getUser?: (
      value: TValue | null | undefined,
      context: CellContext<TData, TValue | null | undefined>,
    ) => UserTableColumnCell;
  }) {
  const loadingCell = (
    <UserTableCell variant="loading" presentation={variant} />
  );

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      if (!getUser && (value === null || value === undefined)) {
        const placeholder = nullValue ?? emptyValue;
        if (!placeholder) return null;
        return (
          <span className="block w-full truncate" title={placeholder}>
            {placeholder}
          </span>
        );
      }

      let cell: UserTableColumnCell;
      if (getUser) {
        cell = getUser(value, context);
      } else if (value !== null && value !== undefined) {
        cell = { type: "user", user: value };
      }

      if (!cell) {
        const placeholder = nullValue ?? emptyValue;
        if (!placeholder) return null;
        return (
          <span className="block w-full truncate" title={placeholder}>
            {placeholder}
          </span>
        );
      }
      if (cell.type === "loading") return loadingCell;

      return (
        <UserTableCell
          user={cell.user}
          variant={variant}
          emptyValue={emptyValue}
        />
      );
    },
  });
}
