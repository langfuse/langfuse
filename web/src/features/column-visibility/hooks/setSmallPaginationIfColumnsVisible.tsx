import { type LangfuseColumnDef } from "@/src/components/table/types";
import React from "react";
import { TracesTableRow } from "@/src/components/table/use-cases/traces";
import { GenerationsTableRow } from "../../../components/table/use-cases/generations";

export type TableColumn =
  | (keyof GenerationsTableRow)[]
  | (keyof TracesTableRow)[];

export function setSmallPaginationIfColumnsVisible(
  columnVisibility: Record<string, boolean>,
  columnsRequiringSmallTable: TableColumn,
  paginationState: { pageIndex: number; pageSize: number },
  setPaginationState: React.Dispatch<
    React.SetStateAction<{ pageIndex: number; pageSize: number }>
  >,
) {
  const smallTableRequired = columnsRequiringSmallTable.some(
    (column) => columnVisibility[column] === true,
  );

  if (smallTableRequired && paginationState.pageSize !== 10) {
    setPaginationState((prev) => {
      const currentPage = prev.pageIndex;
      const currentPageSize = prev.pageSize;
      const newPageIndex = Math.floor((currentPage * currentPageSize) / 10);
      return { pageIndex: newPageIndex, pageSize: 10 };
    });
  }
  return smallTableRequired;
}
