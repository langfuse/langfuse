import { DataTablePeekViewProps } from "@/src/components/table/peek";
import { useReactTable } from "@tanstack/react-table";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

export type PeekViewProps<TData> = Omit<
  DataTablePeekViewProps<TData>,
  "selectedRowId" | "row"
>;

function getInitialRow<TData>(
  peekViewId: string | undefined,
  table: ReturnType<typeof useReactTable<TData>>,
): TData | undefined {
  if (!peekViewId) return undefined;
  try {
    const row = table.getRow(peekViewId);
    return row ? row.original : undefined;
  } catch (error) {
    return undefined;
  }
}

type UsePeekViewProps<TData> = {
  table: ReturnType<typeof useReactTable<TData>>;
  peekView?: PeekViewProps<TData>;
};

export const usePeekView = <TData extends object>({
  table,
  peekView,
}: UsePeekViewProps<TData>) => {
  if (!peekView) return { inflatedPeekView: undefined, peekViewId: undefined };

  const router = useRouter();
  const peekViewId = router.query.peek as string | undefined;
  const [row, setRow] = useState<TData | undefined>(
    getInitialRow(peekViewId, table),
  );
  const inflatedPeekView = peekView
    ? { ...peekView, selectedRowId: peekViewId, row }
    : undefined;

  const handleOnRowClickPeek = (row: TData) => {
    if (inflatedPeekView) {
      const rowId =
        "id" in row && typeof row.id === "string" ? row.id : undefined;
      // If clicking the same row that's already open, close it
      if (rowId === inflatedPeekView.selectedRowId) {
        inflatedPeekView.onOpenChange(false);
        setRow(undefined);
      }
      // If clicking a different row, just update the URL without setting row data yet
      else {
        const timestamp =
          "timestamp" in row ? (row.timestamp as Date) : undefined;
        inflatedPeekView.onOpenChange(true, rowId, timestamp?.toISOString());
        setRow(row);
      }
    }
  };

  return {
    handleOnRowClickPeek,
    inflatedPeekView,
    peekViewId,
  };
};
