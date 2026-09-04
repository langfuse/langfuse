/* eslint-disable boundaries/dependencies */
import { type CellContext, type RowData } from "@tanstack/react-table";

import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  createTableColumn,
  type TableColumnOptions,
} from "./utils/createTableColumn";

export function createDateTableColumn<TData extends RowData>(
  options: TableColumnOptions<TData, Date> & {
    getValue?: (
      value: Date | null | undefined,
      context: CellContext<TData, Date | null | undefined>,
    ) => Date | { type: "loading" } | undefined;
  },
) {
  const { getValue } = options;

  return createTableColumn<TData, Date>({
    ...options,
    loadingCell: <Skeleton className="h-4 w-1/2" />,
    renderCell: (value, context) => {
      if (!getValue) {
        if (value === null || value === undefined) return null;

        const preparedDate = buildLocalIsoDatePresentation({ date: value });

        return (
          preparedDate && (
            <span title={preparedDate.title}>{preparedDate.display}</span>
          )
        );
      }

      const resolvedValue = getValue(value, context);

      if (resolvedValue === null || resolvedValue === undefined) return null;

      if ("type" in resolvedValue && resolvedValue.type === "loading") {
        return <Skeleton className="h-4 w-1/2" />;
      }

      const preparedDate = buildLocalIsoDatePresentation({
        date: resolvedValue,
      });

      return preparedDate ? (
        <span title={preparedDate.title}>{preparedDate.display}</span>
      ) : null;
    },
  });
}
