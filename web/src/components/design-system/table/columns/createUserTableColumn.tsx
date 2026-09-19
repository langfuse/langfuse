/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { Avatar } from "@/src/components/design-system/Avatar/Avatar";
import { EMPTY_VALUE_PLACEHOLDER } from "@/src/components/design-system/table/constants";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type UserTableColumnValue = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  id?: string | null;
};

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
  const loadingCell =
    variant === "avatar" ? (
      <div className="flex w-full min-w-0 items-center space-x-2">
        <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
        <Skeleton className="h-4 max-w-24 min-w-12 flex-1" />
      </div>
    ) : (
      <Skeleton className="h-4 w-1/2" />
    );

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      if (!getUser && (value === null || value === undefined)) {
        return nullValue ? (
          <span className="block w-full truncate" title={nullValue}>
            {nullValue}
          </span>
        ) : null;
      }

      let cell: UserTableColumnCell;
      if (getUser) {
        cell = getUser(value, context);
      } else if (value !== null && value !== undefined) {
        cell = { type: "user", user: value };
      }

      if (!cell) return null;
      if (cell.type === "loading") return loadingCell;

      const { name, email, image, id } = cell.user;
      const label =
        name ?? email ?? id ?? emptyValue ?? EMPTY_VALUE_PLACEHOLDER;
      if (variant === "text") {
        return (
          <span className="block truncate" title={label}>
            {label}
          </span>
        );
      }

      return (
        <div className="flex items-center space-x-2">
          <Avatar size="md" src={image ?? undefined} displayName={label} />
          <span>{label}</span>
        </div>
      );
    },
  });
}
