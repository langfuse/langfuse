import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { type Table } from "@tanstack/react-table";

import { Button } from "@/src/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { Input } from "@/src/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { useEffect, useState } from "react";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  isLoading: boolean;
  paginationOptions?: number[];
  hideTotalCount?: boolean;
  canJumpPages?: boolean; // if we need a cursor (last_item_id), we can't jump pages
  // Approx count for the "Total" footer; undefined = no footer (opt-in).
  approxTotalCount?: number | null;
  isApproxTotalCountLoading?: boolean;
  /** The estimate over-counts (non-native filters dropped) — mark it partial. */
  approxTotalCountIsPartialScope?: boolean;
  /** Cursor pagination: whether another page exists after the current one. */
  hasNextPage?: boolean;
}

export function DataTablePagination<TData>({
  table,
  isLoading,
  paginationOptions = [10, 20, 30, 40, 50],
  hideTotalCount = false,
  canJumpPages = true,
  approxTotalCount,
  isApproxTotalCountLoading = false,
  approxTotalCountIsPartialScope = false,
  hasNextPage,
}: DataTablePaginationProps<TData>) {
  const capture = usePostHogClientCapture();

  // Last page shows the exact loaded-row total; multi-page shows "Total ≈ X".
  const totalFooterEnabled =
    approxTotalCount !== undefined || isApproxTotalCountLoading;
  const paginationState = table.getState().pagination;
  const loadedRowCount = table.getRowModel().rows.length;
  const isInitialTotalLoading = isLoading && loadedRowCount === 0;
  // hasNextPage is authoritative for cursor tables; fall back to the table's signal.
  const morePagesExist =
    (hasNextPage ?? table.getCanNextPage()) && !isInitialTotalLoading;
  const exactTotal =
    paginationState.pageIndex * paginationState.pageSize + loadedRowCount;
  const showApproxTotal = totalFooterEnabled && morePagesExist;
  const showExactTotal =
    totalFooterEnabled && !morePagesExist && !isInitialTotalLoading;

  const currentPage = table.getState().pagination.pageIndex + 1;
  const [inputState, setInputState] = useState<number | string>(currentPage);

  useEffect(() => {
    setInputState(currentPage);
  }, [currentPage]);

  const pageCount = table.getPageCount();
  const setPageIndex = table.setPageIndex;
  useEffect(() => {
    if (currentPage > pageCount && pageCount > 0) {
      setPageIndex(0);
    }
  }, [currentPage, pageCount, setPageIndex]);

  const handlePageNavigation = (newValue: string) => {
    if (newValue === "") {
      table.setPageIndex(0);
      setInputState(1);
      return;
    }

    // if nan, reset to current page
    if (isNaN(Number(newValue))) {
      setInputState(currentPage);
      return;
    }

    const newPageIndex = Number(newValue) - 1;
    if (newPageIndex < 0 || newPageIndex >= pageCount) {
      setInputState(currentPage);
      return;
    }

    table.setPageIndex(newPageIndex);
    setInputState(newPageIndex + 1);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="text-tertiary flex-1 text-sm">
        {/* {table.getFilteredSelectedRowModel().rows.length} of{" "}
        {table.getFilteredRowModel().rows.length} row(s) selected. */}
      </div>
      <div className="flex flex-wrap items-center space-x-6 lg:space-x-8">
        {showExactTotal ? (
          // Result fits on the loaded page(s) — the total is exact, no estimate.
          <span className="text-tertiary hidden text-sm font-normal whitespace-nowrap md:inline-flex md:items-center">
            Total&nbsp;{compactNumberFormatter(exactTotal)}
          </span>
        ) : showApproxTotal ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-tertiary hidden text-sm font-normal whitespace-nowrap md:inline-flex md:items-center">
                  Total&nbsp;≈&nbsp;
                  {approxTotalCount != null ? (
                    compactNumberFormatter(approxTotalCount)
                  ) : (
                    <span className="inline-flex align-middle">
                      <Spinner size="xxs" variant="muted" display="inline" />
                    </span>
                  )}
                  {approxTotalCountIsPartialScope &&
                    approxTotalCount != null && (
                      // Marks that the estimate ignores some filters (can exceed row count).
                      <span className="text-tertiary/70 ml-0.5 align-super text-[0.65rem] leading-none">
                        *
                      </span>
                    )}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs font-normal">
                {approxTotalCountIsPartialScope ? (
                  <>
                    Approximate count over the active column filters and time
                    range only. It excludes full-text search, score, and comment
                    filters, so it can be noticeably higher than the number of
                    matching rows.
                  </>
                ) : (
                  <>
                    Approximate number of matching rows for the active filters
                    and time range, estimated with ClickHouse&apos;s HyperLogLog
                    (typically within a few percent of the true count).
                  </>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <div className="flex items-center space-x-2">
          <p className="text-sm font-bold whitespace-nowrap md:hidden">Rows</p>
          <p className="hidden text-sm font-bold whitespace-nowrap md:block">
            Rows per page
          </p>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              capture("table:pagination_page_size_select", {
                pageSize: value,
              });
              table.setPageSize(Number(value));
            }}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {paginationOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-center gap-1 text-sm font-bold whitespace-nowrap">
          {table.getPageCount() !== -1 ? (
            <>
              Page
              {canJumpPages && (
                <Input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={inputState} // Ensure the value is within bounds
                  onChange={(e) => {
                    setInputState(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handlePageNavigation(e.currentTarget.value);
                    }
                  }}
                  onBlur={(e) => {
                    handlePageNavigation(e.target.value);
                  }}
                  className="h-8 appearance-none"
                  style={{
                    width: `${3 + Math.max(1, pageCount.toString().length)}ch`,
                  }}
                />
              )}
              {!canJumpPages && <span>{currentPage}</span>}
            </>
          ) : (
            `Page ${currentPage}`
          )}
          {!hideTotalCount && (
            <>
              {pageCount !== -1 ? (
                <span>of {pageCount}</span>
              ) : (
                <span>
                  of{" "}
                  {isLoading ? (
                    <span className="ml-1 inline-flex align-middle">
                      <Spinner size="xxs" variant="muted" display="inline" />
                    </span>
                  ) : (
                    1
                  )}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {canJumpPages && (
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                table.setPageIndex(0);
                capture("table:pagination_button_click", {
                  type: "firstPage",
                });
              }}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => {
              table.previousPage();
              capture("table:pagination_button_click", {
                type: "previousPage",
              });
            }}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => {
              table.nextPage();
              capture("table:pagination_button_click", {
                type: "nextPage",
              });
            }}
            disabled={!table.getCanNextPage() || pageCount === -1}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {canJumpPages && (
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => {
                table.setPageIndex(pageCount - 1);
                capture("table:pagination_button_click", {
                  type: "lastPage",
                });
              }}
              disabled={!table.getCanNextPage() || pageCount === -1}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
