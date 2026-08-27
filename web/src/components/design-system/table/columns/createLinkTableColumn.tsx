import { type CellContext, type RowData } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import TableLink, {
  type TableLinkProps,
} from "@/src/components/table/table-link";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type LinkTableColumnProps = Pick<
  TableLinkProps,
  "path" | "value" | "title" | "onClick"
> & {
  icon?: LucideIcon;
};

export function createLinkTableColumn<TData extends RowData, TValue = string>({
  getCell,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getCell: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) =>
    | { type: "loading" }
    | { type: "link"; props: LinkTableColumnProps }
    | undefined;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value, context) => {
      const cell = getCell(value, context);
      if (!cell) return null;
      if (cell.type === "loading") return <TableTextLoadingCell />;

      const { icon: Icon, ...tableLinkProps } = cell.props;
      return (
        <TableLink
          {...tableLinkProps}
          icon={Icon ? <Icon className="h-4 w-4" /> : undefined}
        />
      );
    },
  });
}
