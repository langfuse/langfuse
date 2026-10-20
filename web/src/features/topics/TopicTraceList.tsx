import { useState } from "react";
import { type OnChangeFn, type PaginationState } from "@tanstack/react-table";
import { ExternalLink } from "@langfuse/icons";
import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { Button } from "@/src/components/design-system/Button/Button";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { type FacetRow, topicTracesHref } from "./facet-topics";

/** With the table's own 4px (8px on the first column), cells end up 16px from each edge. */
const CELL = "block px-3";
const FIRST_CELL = "block pr-3 pl-2";

export function TopicTraceList({
  projectId,
  title,
  swatchColor,
  rows,
  peekView,
  tracePanelRef,
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
      size: 128,
      minSize: 96,
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
    {
      accessorKey: "unitStartTime",
      header: () => <span className={CELL}>Started</span>,
      size: 96,
      minSize: 88,
      cell: ({ row }) => (
        <span className={cn("text-muted-foreground block tabular-nums", CELL)}>
          {compactAge(row.original.unitStartTime)}
        </span>
      ),
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
      <div className="flex h-12 shrink-0 items-center justify-between gap-2 px-4">
        <h3 className="flex min-w-0 items-baseline gap-2 text-base leading-none font-bold">
          {swatchColor ? (
            <span
              aria-hidden
              className="size-2.5 shrink-0 self-center rounded-xs"
              style={{ backgroundColor: swatchColor }}
            />
          ) : null}
          <span className="truncate" title={title}>
            {title}
          </span>
          <span className="text-muted-foreground shrink-0 font-mono text-xs font-normal">
            {rows.length.toLocaleString()} traces
          </span>
        </h3>
        {tracingHref ? (
          <Button
            href={tracingHref}
            text="Open in Tracing"
            variant="secondary"
            size="sm"
            icon={ExternalLink}
          />
        ) : null}
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
        noResultsMessage="No traces in this topic."
        peekView={peekView}
      />
    </section>
  );
}

type TopicTraceListProps = {
  projectId: string;
  title: string;
  swatchColor?: string;
  rows: FacetRow[];
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  divider?: "top" | "side";
};

function compactAge(timestamp: string) {
  return formatCompactRelativeTime(new Date(timestamp)).replace(/ ago$/, "");
}
