import { type CellContext, type RowData } from "@tanstack/react-table";
import { Folder } from "lucide-react";

import { TableTextLoadingCell } from "@/src/components/table/loading-cells";
import TableLink, {
  type TableLinkProps,
} from "@/src/components/table/table-link";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

type LinkProps = Pick<TableLinkProps, "path" | "value" | "title" | "onClick">;

export function createFolderKeyTableColumn<
  TData extends RowData,
  TValue = string,
>({
  getCell,
  ...options
}: TableColumnOptions<TData, TValue> & {
  getCell: (
    value: TValue | null | undefined,
    context: CellContext<TData, TValue | null | undefined>,
  ) =>
    | { type: "folder"; name: string; onClick: () => void }
    | { type: "link"; props: LinkProps }
    | undefined;
}) {
  return createTableColumn<TData, TValue>({
    ...options,
    loadingCell: <TableTextLoadingCell />,
    renderCell: (value, context) => {
      const cell = getCell(value, context);
      if (!cell) return null;

      if (cell.type === "folder") {
        return (
          <TableLink
            path=""
            value={cell.name}
            icon={
              <div className="flex flex-row items-center gap-1">
                <Folder className="h-3.5 w-3.5 shrink-0" />
                {cell.name}
              </div>
            }
            onClick={cell.onClick}
            title={cell.name}
          />
        );
      }

      return <TableLink {...cell.props} />;
    },
  });
}
