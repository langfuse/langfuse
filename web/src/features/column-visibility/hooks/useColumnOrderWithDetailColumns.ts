import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useMemo } from "react";

const computeInsertionPoint = (
  insertDetailColumnsAt: "start" | "middle" | "end",
  columnLength: number,
) => {
  switch (insertDetailColumnsAt) {
    case "start":
      return 0;
    case "middle":
      return Math.floor(columnLength / 2);
    case "end":
      return columnLength;
  }
};

export const useColumnOrderWithDetailColumns = <TData>(
  columns: LangfuseColumnDef<TData>[],
  detailColumns: LangfuseColumnDef<TData>[],
  insertDetailColumnsAt: "start" | "middle" | "end" = "middle",
) => {
  return useMemo(() => {
    if (Boolean(detailColumns.length)) {
      const insertionPoint = computeInsertionPoint(
        insertDetailColumnsAt,
        columns.length,
      );
      const reorderedColumns = [
        ...columns.slice(0, insertionPoint),
        ...detailColumns,
        ...columns.slice(insertionPoint),
      ];
      return reorderedColumns.map((c) => c.accessorKey);
    }

    return columns.map((c) => c.accessorKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailColumns]);
};
