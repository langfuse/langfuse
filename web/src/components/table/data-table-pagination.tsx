import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DoubleArrowLeftIcon,
  DoubleArrowRightIcon,
} from "@radix-ui/react-icons";
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
import { LoaderCircle } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { useEffect, useState } from "react";

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
  paginationOptions?: number[];
}

export function DataTablePagination<TData>({
  table,
  paginationOptions = [10, 20, 30, 40, 50],
}: DataTablePaginationProps<TData>) {
  const capture = usePostHogClientCapture();

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

  return (
    <div className="flex items-center justify-between">
      <div className="flex-1 text-sm text-muted-foreground">
        {/* {table.getFilteredSelectedRowModel().rows.length} of{" "}
        {table.getFilteredRowModel().rows.length} row(s) selected. */}
      </div>
      <div className="flex flex-wrap items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="whitespace-nowrap text-sm font-medium md:hidden">
            Rows
          </p>
          <p className="hidden whitespace-nowrap text-sm font-medium md:block">
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
        <div className="flex items-center justify-center gap-1 whitespace-nowrap text-sm font-medium">
          {table.getPageCount() !== -1 ? (
            <>
              Page
              <Input
                type="number"
                min={1}
                max={pageCount}
                value={inputState} // Ensure the value is within bounds
                onChange={(e) => {
                  setInputState(e.target.value);
                }}
                onBlur={(e) => {
                  const newValue = e.target.value;
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
                }}
                className="h-8 appearance-none"
                style={{
                  width: `${3 + Math.max(1, pageCount.toString().length)}ch`,
                }}
              />
            </>
          ) : (
            `Page ${currentPage}`
          )}
          {pageCount !== -1 ? (
            <span>of {pageCount}</span>
          ) : (
            <span>
              of{" "}
              <LoaderCircle className="ml-1 inline-block h-3 w-3 animate-spin text-muted-foreground" />
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
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
            <DoubleArrowLeftIcon className="h-4 w-4" />
          </Button>
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
            <ChevronLeftIcon className="h-4 w-4" />
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
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
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
            <DoubleArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
