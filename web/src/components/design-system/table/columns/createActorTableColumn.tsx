import { type RowData } from "@tanstack/react-table";
import { KeyRound } from "lucide-react";

import {
  UserTableCell,
  type UserTableColumnValue,
} from "@/src/components/design-system/table/components/UserTableCell/UserTableCell";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export type TableActor =
  | {
      type: "USER";
      body: UserTableColumnValue;
    }
  | {
      type: "API_KEY";
      body: { id?: string | null; publicKey?: string | null };
    };

export function createActorTableColumn<TData extends RowData>({
  variant,
  emptyValue = "—",
  unknownUserValue = "Unknown user",
  ...options
}: TableColumnOptions<TData, TableActor> & {
  variant: "avatar" | "text";
  emptyValue?: string;
  unknownUserValue?: string;
}) {
  return createTableColumn<TData, TableActor>({
    ...options,
    loadingCell: <UserTableCell variant="loading" presentation={variant} />,
    renderCell: (actor) => {
      if (!actor) return <span>{emptyValue}</span>;

      if (actor.type === "API_KEY") {
        const label = actor.body.publicKey ?? actor.body.id ?? emptyValue;
        return (
          <span
            className="flex min-w-0 items-center gap-2"
            title={`API key ${label}`}
          >
            <KeyRound
              className="text-muted-foreground size-4 shrink-0"
              aria-hidden="true"
            />
            <span className="truncate font-mono" title={label}>
              {label}
            </span>
          </span>
        );
      }

      return (
        <UserTableCell
          user={actor.body}
          variant={variant}
          emptyValue={unknownUserValue}
          avatarSize="sm"
        />
      );
    },
  });
}
