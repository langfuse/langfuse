"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "@langfuse/icons";
import { useState } from "react";

import { IconButton } from "@/src/components/design-system/IconButton/IconButton";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

export type PaginationBarState = {
  pageIndex: number;
  pageSize: number;
};

export type PaginationBarProps =
  | {
      mode: "offset";
      totalCount: number | null;
      state: PaginationBarState;
      onChange: (state: PaginationBarState) => void;
      pageSizeOptions?: number[];
      hasNextPage?: never;
      isLoadingNextPage?: never;
    }
  | {
      mode: "cursor";
      totalCount?: never;
      state: PaginationBarState;
      onChange: (state: PaginationBarState) => void;
      hasNextPage: boolean;
      isLoadingNextPage?: boolean;
      pageSizeOptions?: number[];
    };

function PageNumberInput({
  currentPage,
  pageCount,
  onNavigate,
}: {
  currentPage: number;
  pageCount: number;
  onNavigate: (pageIndex: number) => void;
}) {
  const [value, setValue] = useState<number | string>(currentPage);

  const submit = (nextValue: string) => {
    const nextPage = Number(nextValue);
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > pageCount) {
      setValue(currentPage);
      return;
    }

    onNavigate(nextPage - 1);
    setValue(nextPage);
  };

  const pageNumberMinWidthCh = 3 + Math.max(1, pageCount.toString().length);

  return (
    <div
      className="w-fit shrink-0"
      style={{
        minWidth: `max(3.5rem, ${pageNumberMinWidthCh}ch)`,
      }}
    >
      <Input
        aria-label="Page number"
        type="number"
        min={1}
        max={pageCount}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          submit(event.currentTarget.value);
        }}
        onBlur={(event) => submit(event.target.value)}
        layout="inline"
      />
    </div>
  );
}

export function PaginationBar(props: PaginationBarProps) {
  const { state, onChange, pageSizeOptions = [10, 20, 30, 40, 50] } = props;
  const totalCount = props.totalCount ?? null;
  const isCursorPagination = props.mode === "cursor";
  const pageCount = Math.max(1, Math.ceil((totalCount ?? 0) / state.pageSize));
  const currentPage = state.pageIndex + 1;
  const canGoBack = state.pageIndex > 0;
  const canGoForward =
    props.mode === "cursor"
      ? props.hasNextPage && !props.isLoadingNextPage
      : totalCount !== null && state.pageIndex < pageCount - 1;

  return (
    <div className="bg-background @container/pagination sticky bottom-0 z-10 flex w-full min-w-0 justify-end border-t py-2 pr-2 font-bold">
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2 @min-[520px]/pagination:gap-x-6 @min-[720px]/pagination:gap-x-8">
        {!isCursorPagination && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm whitespace-nowrap @min-[440px]/pagination:hidden">
              Rows
            </span>
            <span className="hidden text-sm whitespace-nowrap @min-[440px]/pagination:block">
              Rows per page
            </span>
            <div className="w-[5.5rem]">
              <SelectInput
                value={`${state.pageSize}`}
                options={pageSizeOptions.map((pageSize) => ({
                  value: `${pageSize}`,
                  label: `${pageSize}`,
                }))}
                onValueChange={(value) => {
                  const pageSize = Number(value);
                  const firstVisibleRow = state.pageIndex * state.pageSize;
                  onChange({
                    pageIndex: Math.floor(firstVisibleRow / pageSize),
                    pageSize,
                  });
                }}
                placeholder={`${state.pageSize}`}
                aria-label="Rows per page"
              />
            </div>
          </div>
        )}

        <div className="flex shrink-0 flex-nowrap items-center gap-x-4 @min-[520px]/pagination:gap-x-6">
          <div className="flex items-center justify-center gap-1 text-sm whitespace-nowrap">
            Page
            {isCursorPagination ? (
              <span>{currentPage}</span>
            ) : (
              <>
                <PageNumberInput
                  key={`${currentPage}-${pageCount}`}
                  currentPage={currentPage}
                  pageCount={pageCount}
                  onNavigate={(pageIndex) => onChange({ ...state, pageIndex })}
                />
                <span>of {totalCount === null ? "…" : pageCount}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isCursorPagination && (
              <span className="hidden @min-[560px]/pagination:inline-flex">
                <IconButton
                  icon={ChevronsLeft}
                  onClick={() => onChange({ ...state, pageIndex: 0 })}
                  disabled={!canGoBack}
                  label="Go to first page"
                  variant="outline"
                />
              </span>
            )}
            <IconButton
              icon={ChevronLeft}
              onClick={() =>
                onChange({ ...state, pageIndex: state.pageIndex - 1 })
              }
              disabled={!canGoBack}
              label="Go to previous page"
              variant="outline"
            />
            <IconButton
              icon={ChevronRight}
              onClick={() =>
                onChange({ ...state, pageIndex: state.pageIndex + 1 })
              }
              disabled={!canGoForward}
              label="Go to next page"
              variant="outline"
            />
            {!isCursorPagination && (
              <span className="hidden @min-[560px]/pagination:inline-flex">
                <IconButton
                  icon={ChevronsRight}
                  onClick={() =>
                    onChange({ ...state, pageIndex: pageCount - 1 })
                  }
                  disabled={!canGoForward}
                  label="Go to last page"
                  variant="outline"
                />
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
