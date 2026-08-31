/* eslint-disable @repo/no-design-system-external-components */
import { type CellContext, type RowData } from "@tanstack/react-table";
import { type LucideIcon } from "lucide-react";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type LinkTableColumnProps = Pick<
  React.ComponentProps<typeof TextLink>,
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

      const { icon: Icon, path, value: linkValue, title, onClick } = cell.props;
      return (
        <TextLink
          path={path}
          value={linkValue}
          title={title ?? linkValue}
          onClick={onClick}
          icon={Icon}
        />
      );
    },
  });
}
