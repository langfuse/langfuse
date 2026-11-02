import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "@langfuse/icons";
import {
  PaginationBar,
  type PaginationBarState,
} from "@/src/components/design-system/PaginationBar/PaginationBar";
import { formatCompactRelativeTime } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { type FacetRow } from "./facet-topics";

const PAGE_SIZE = 20;

type TopicMobileTraceListProps = {
  children: ReactNode;
  filterKey: string;
  rows: FacetRow[];
  selectedTraceId: string | null;
  onOpenTrace: (traceId: string) => void;
};

export function TopicMobileTraceList({
  children,
  filterKey,
  rows,
  selectedTraceId,
  onOpenTrace,
}: TopicMobileTraceListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const [pageRequest, setPageRequest] = useState(() => ({
    filterKey,
    pageSize: PAGE_SIZE,
    pageIndex: Math.max(
      0,
      Math.floor(
        rows.findIndex((row) => row.traceId === selectedTraceId) / PAGE_SIZE,
      ),
    ),
  }));
  if (pageRequest.filterKey !== filterKey) {
    setPageRequest({ ...pageRequest, filterKey, pageIndex: 0 });
  }
  // The DOM scroll position follows map selection without moving keyboard focus.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedTraceId]);
  const { pageSize } = pageRequest;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = Math.min(pageRequest.pageIndex, pageCount - 1);
  const pageRows = rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  function changePage(pagination: PaginationBarState) {
    setPageRequest({ filterKey, ...pagination });
    scrollRef.current?.scrollTo({ top: 0 });
  }

  return (
    <div className="ph-no-capture flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {children}
        <ul className="divide-y">
          {pageRows.map((row) => (
            <li key={row.traceId}>
              <button
                ref={row.traceId === selectedTraceId ? selectedRef : undefined}
                type="button"
                aria-label={`Open trace ${row.traceId}`}
                aria-current={
                  row.traceId === selectedTraceId ? "true" : undefined
                }
                onClick={() => onOpenTrace(row.traceId)}
                className={cn(
                  "hover:bg-accent focus-visible:ring-ring flex w-full flex-col gap-2 p-4 text-left text-sm focus-visible:ring-2 focus-visible:ring-inset",
                  row.traceId === selectedTraceId && "bg-accent",
                )}
              >
                <span className="text-muted-foreground flex w-full min-w-0 items-start justify-between gap-3 text-xs">
                  <span className="[overflow-wrap:anywhere]">
                    {row.topicName ?? row.outcome.replaceAll("_", " ")}
                  </span>
                  <time className="shrink-0" dateTime={row.unitStartTime}>
                    {formatCompactRelativeTime(new Date(row.unitStartTime))}
                  </time>
                </span>
                <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                  {row.summary || "No applicable summary."}
                </span>
                <span className="text-muted-foreground flex w-full min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono" title={row.traceId}>
                    {row.traceId}
                  </span>
                  <span className="text-link flex shrink-0 items-center gap-1">
                    Open trace{" "}
                    <ChevronRight size="base" color="inherit" aria-hidden />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {rows.length === 0 && (
          <p className="text-muted-foreground p-4 text-sm">
            No matches. Adjust or clear your filters.
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <nav aria-label="Trace pagination" className="shrink-0">
          <PaginationBar
            mode="offset"
            totalCount={rows.length}
            state={{ pageIndex, pageSize }}
            onChange={changePage}
          />
        </nav>
      )}
    </div>
  );
}
