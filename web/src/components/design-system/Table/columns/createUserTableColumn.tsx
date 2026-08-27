import { type CellContext, type RowData } from "@tanstack/react-table";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
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

export function createUserTableColumn<
  TData extends RowData,
  TValue extends UserTableColumnValue = UserTableColumnValue,
>({
  getUser,
  emptyValue,
  variant,
  ...options
}: TableColumnOptions<TData, TValue> &
  UserTableColumnPresentation & {
    emptyValue: string;
    getUser?: (
      value: TValue | null | undefined,
      context: CellContext<TData, TValue | null | undefined>,
    ) =>
      | { type: "loading" }
      | { type: "user"; user: UserTableColumnValue }
      | undefined;
  }) {
  const loadingCell =
    variant === "avatar" ? (
      <div className="flex items-center space-x-2">
        <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
        <TableTextLoadingCell />
      </div>
    ) : (
      <TableTextLoadingCell />
    );

  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell,
    renderCell: (value, context) => {
      const cell = getUser
        ? getUser(value, context)
        : { type: "user" as const, user: value ?? {} };
      if (cell?.type === "loading") return loadingCell;

      const { name, email, image, id } = cell?.user ?? {};
      const label = name ?? email ?? id ?? emptyValue;
      if (variant === "text") {
        return (
          <span className="block truncate" title={label}>
            {label}
          </span>
        );
      }

      const initials = name
        ?.split(" ")
        .map((word) => word[0])
        .slice(0, 2)
        .join("");

      return (
        <div className="flex items-center space-x-2">
          <Avatar className="h-7 w-7">
            <AvatarImage src={image ?? undefined} alt={name ?? "User Avatar"} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span>{label}</span>
        </div>
      );
    },
  });
}
