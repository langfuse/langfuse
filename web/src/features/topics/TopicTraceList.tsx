/* eslint-disable react/no-unstable-nested-components */
import { type RefObject, useState } from "react";
import { type OnChangeFn, type PaginationState } from "@tanstack/react-table";
import { ExternalLink } from "@langfuse/icons";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { type FacetRow, topicTracesHref } from "./facet-topics";

/** With the table's own 4px (8px on the first column), cells end up 16px from each edge. */
const CELL = "block px-3";
const FIRST_CELL = "block pr-3 pl-2";

export function TopicTraceList({
  projectId,
  title,
  description,
  swatchColor,
  rows,
  peekView,
  tracePanelRef,
  headerRef,
  divider,
}: TopicTraceListProps) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const pageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(rows.length / pagination.pageSize) - 1),
  );
  const onPaginationChange: OnChangeFn<PaginationState> = (update) => {
    setPagination((current) =>
      typeof update === "function" ? update(current) : update,
    );
  };
  const { isV4 } = useReadPath();
  const tracingHref = topicTracesHref(projectId, rows, isV4);
  const columns: LangfuseColumnDef<FacetRow>[] = [
    {
      accessorKey: "traceId",
      header: () => <span className={FIRST_CELL}>Trace ID</span>,
      size: 208,
      minSize: 128,
      cell: ({ row }) => (
        <span
          className={cn(
            "text-link block truncate font-mono text-xs",
            FIRST_CELL,
          )}
          title={row.original.traceId}
        >
          {row.original.traceId}
        </span>
      ),
    },
    {
      accessorKey: "summary",
      header: () => <span className={CELL}>Summary</span>,
      size: 300,
      minSize: 180,
      isFlexWidth: true,
      cell: ({ row }) => {
        const summary = row.original.summary || "No applicable summary.";
        return (
          <p className={cn("truncate", CELL)} title={summary}>
            {summary}
          </p>
        );
      },
    },
  ];
  return (
    <section
      aria-label="Topic traces"
      ref={tracePanelRef}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        divider === "side" && "border-t lg:border-t-0 lg:border-l",
        divider === "top" && "border-t",
        !divider && "rounded-md border",
      )}
    >
      <div ref={headerRef} className="flex shrink-0 flex-col gap-1 px-4 py-3">
        <div className="flex h-7 items-center justify-between gap-4">
          <p className="text-muted-foreground flex min-w-0 items-center gap-2">
            {swatchColor && (
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-xs"
                style={{ backgroundColor: swatchColor }}
              />
            )}
            <span
              className="truncate font-mono text-xs"
              title={`${rows.length.toLocaleString()} traces`}
            >
              {`${rows.length.toLocaleString()} traces`}
            </span>
          </p>
          {tracingHref && (
            <Button
              href={tracingHref}
              text="Open in Tracing"
              variant="ghost"
              size="sm"
              icon={ExternalLink}
            />
          )}
        </div>
        <h3 className="truncate text-lg font-bold" title={title}>
          {title}
        </h3>
        {description && (
          <p
            className="text-muted-foreground line-clamp-2 text-sm"
            title={description}
          >
            {description}
          </p>
        )}
      </div>
      <DataTable
        tableName="topics-topic-traces"
        columns={columns}
        data={{
          isLoading: false,
          isError: false,
          data: rows
            .slice(
              pageIndex * pagination.pageSize,
              (pageIndex + 1) * pagination.pageSize,
            )
            .map((row) => ({ ...row, id: row.traceId })),
        }}
        pagination={{
          totalCount: rows.length,
          state: { ...pagination, pageIndex },
          onChange: onPaginationChange,
          options: [20, 50, 100],
        }}
        className="min-h-0 overscroll-contain"
        cellPadding="relaxed"
        noResultsMessage="No trace summaries."
        peekView={peekView}
      />
    </section>
  );
}

type TopicTraceListProps = {
  projectId: string;
  title: string;
  description?: string;
  swatchColor?: string;
  rows: FacetRow[];
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  /** Lets a neighbouring panel match this header's height. */
  headerRef?: RefObject<HTMLDivElement | null>;
  divider?: "top" | "side";
};
