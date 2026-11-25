/* eslint-disable react/no-unstable-nested-components */
import {
  type PointerEvent,
  type ComponentProps,
  useContext,
  useEffect,
  useRef,
  type RefObject,
  type UIEvent,
  useState,
} from "react";
import { SquareArrowOutUpRight } from "@langfuse/icons";
import { DataTable } from "@/src/components/table/data-table";
import {
  type CustomHeights,
  customRowHeightMenu,
  DataTableRowHeightSwitch,
  isCompactRowHeight,
  useRowHeightLocalStorage,
} from "@/src/components/table/data-table-row-height-switch";
import { useElementSize } from "@/src/hooks/useElementSize";
import { TopicTraceLoadMore } from "./TopicTraceLoadMore";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";
import { Button } from "@/src/components/design-system/Button/Button";
import { cn } from "@/src/utils/tailwind";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  type Facet,
  type FacetRow,
  type TopicTracesResult,
  topicTracesHref,
} from "./facet-topics";
import { FacetTraceSource } from "./useFacetTopicTraces";
import { UNASSIGNED_TOPIC_ID } from "./prepare-topic-display";
import { TopicsTraceToolbar } from "./TopicsTraceToolbar";

/** With the table's own 4px (8px on the first column), cells end up 16px from each edge. */
const CELL = "block px-3";
/** Summaries run up to about 230 characters, so medium fits two lines and large about four. */
const TRACE_ROW_HEIGHTS: CustomHeights = { s: "h-7", m: "h-16", l: "h-24" };
/** More rows load from the server as the list nears its end. */
const LOAD_MORE_THRESHOLD_PX = 400;
const FIRST_CELL = "block pr-3 pl-2";
const TRACE_ID_MIN_WIDTH = 96;
const TOPIC_MIN_WIDTH = 120;
/**
 * The table's 8px right padding plus a classic vertical scrollbar (up to 17px).
 * Where scrollbars overlay the rows, the fixed table layout spreads the spare
 * pixels over the columns, so reserving them never shows as a gap.
 */
const TABLE_RIGHT_GUTTER_PX = 8 + 17;

/**
 * `truncate` compares unrounded widths: whole-pixel `scrollWidth` misses
 * sub-pixel overflows that still get an ellipsis, and tight leading overflows
 * the height of text that fits. Assumes no horizontal padding.
 */
function clipsText(element: HTMLElement, clip: "truncate" | "line-clamp") {
  if (clip === "line-clamp") return element.scrollHeight > element.clientHeight;
  const text = document.createRange();
  text.selectNodeContents(element);
  return (
    text.getBoundingClientRect().width > element.getBoundingClientRect().width
  );
}

/**
 * Native tooltip with the full text, only while the element clips it. The list
 * can stay mounted across topics, so a measurement only counts for its text.
 */
function useTruncatedTitle(text: string, clip: "truncate" | "line-clamp") {
  const [clippedText, setClippedText] = useState<string | null>(null);
  return {
    title: clippedText === text ? text : undefined,
    onPointerMove: (event: PointerEvent<HTMLElement>) =>
      setClippedText(clipsText(event.currentTarget, clip) ? text : null),
  };
}

export function TopicTraceList({
  projectId,
  title,
  description,
  swatchColor,
  traces,
  rowHeightKey = "topicTraces",
  selectedTraceId = null,
  totalCount,
  tracingTopic,
  peekView,
  tracePanelRef,
  headerRef,
  divider,
  search,
  topicColors,
  emptyMessage = "No trace summaries.",
}: TopicTraceListProps) {
  const { rows } = traces;
  const tableRef = useRef<HTMLDivElement>(null);
  const [sizeRef, tableSize] = useElementSize<HTMLDivElement>();
  // Default widths: 20% trace ID, 30% topic and the rest summary of the measured
  // list. The summary gives up what the minimums add, so the defaults fit
  // whenever the minimums do.
  const columnsWidth = Math.max(
    0,
    (tableSize?.width ?? 0) - TABLE_RIGHT_GUTTER_PX,
  );
  const traceIdWidth = Math.max(
    TRACE_ID_MIN_WIDTH,
    Math.floor(columnsWidth * 0.2),
  );
  const topicWidth = topicColors
    ? Math.max(TOPIC_MIN_WIDTH, Math.floor(columnsWidth * 0.3))
    : 0;
  const summaryWidth = columnsWidth - traceIdWidth - topicWidth;
  // Taller rows wrap the summary and topic, since the list is the only place to read them.
  const [rowHeight, setRowHeight, rowHeights] = useRowHeightLocalStorage(
    rowHeightKey,
    "s",
  );
  // Same threshold as the table: custom heights under medium stay one truncated line.
  const wrapsSummary = !isCompactRowHeight(
    rowHeight,
    rowHeights.mode,
    rowHeights.activeHeightPx,
    TRACE_ROW_HEIGHTS,
  );
  const selectedRowLoaded = rows.some((row) => row.traceId === selectedTraceId);
  // A trace picked on the map scrolls into view once its row is loaded.
  useEffect(() => {
    tableRef.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedTraceId, selectedRowLoaded]);
  const onScrollCapture = (event: UIEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.scrollTop + target.clientHeight >=
      target.scrollHeight - LOAD_MORE_THRESHOLD_PX
    )
      traces.loadMore();
  };
  const titleTooltip = useTruncatedTitle(title, "truncate");
  const descriptionTooltip = useTruncatedTitle(description ?? "", "line-clamp");
  const { isV4 } = useReadPath();
  // Analysis snapshots have their own topics, which the tracing filter can't match.
  const isAnalysis = Boolean(useContext(FacetTraceSource)?.analysisId);
  const tracingHref = topicTracesHref(
    projectId,
    rows,
    isV4,
    isAnalysis ? undefined : tracingTopic,
  );
  const columns: LangfuseColumnDef<FacetRow>[] = [
    {
      accessorKey: "traceId",
      header: () => <span className={FIRST_CELL}>Trace ID</span>,
      size: traceIdWidth,
      minSize: TRACE_ID_MIN_WIDTH,
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
    ...(topicColors
      ? [
          {
            accessorKey: "topicName",
            header: () => <span className={CELL}>Topic</span>,
            size: topicWidth,
            minSize: TOPIC_MIN_WIDTH,
            cell: ({ row }) => {
              // Outliers read Unassigned, as in the topic rows and on the map.
              const name =
                row.original.topicName ??
                (row.original.outcome === "outlier"
                  ? "Unassigned"
                  : row.original.outcome.replaceAll("_", " "));
              return (
                <span
                  className={cn(
                    CELL,
                    "flex min-w-0 gap-2",
                    wrapsSummary ? "items-start" : "items-center",
                  )}
                >
                  <span
                    aria-hidden
                    // Wrapped names start at the top, so the swatch sits on their first line.
                    className={cn(
                      "size-2.5 shrink-0 rounded-xs",
                      wrapsSummary && "mt-1.5",
                    )}
                    style={{
                      backgroundColor: topicColors.get(
                        row.original.topicId ?? UNASSIGNED_TOPIC_ID,
                      ),
                    }}
                  />
                  <span
                    className={cn(
                      "min-w-0 text-sm",
                      // The cell itself does not wrap, so wrapping is set explicitly.
                      wrapsSummary
                        ? "break-words whitespace-normal"
                        : "truncate",
                    )}
                    title={name}
                  >
                    {name}
                  </span>
                </span>
              );
            },
          } satisfies LangfuseColumnDef<FacetRow>,
        ]
      : []),
    {
      accessorKey: "summary",
      header: () => <span className={CELL}>Summary</span>,
      // A fixed width, not a flexible one: the table layout would hand the spare space to the other columns.
      size: summaryWidth,
      minSize: 180,
      cell: ({ row }) => {
        const summary = row.original.summary || "No applicable summary.";
        return (
          <p
            className={cn(
              wrapsSummary ? "break-words whitespace-pre-wrap" : "truncate",
              CELL,
            )}
            title={summary}
          >
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
      onScrollCapture={onScrollCapture}
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        divider === "side" && "border-t lg:border-t-0 lg:border-l",
        !divider && "rounded-md border",
      )}
    >
      {search && <TopicsTraceToolbar {...search} divider={false} />}
      <div ref={headerRef} className="flex shrink-0 flex-col gap-1 px-4 py-3">
        <div className="flex min-h-7 items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="flex min-w-0 items-baseline gap-2">
              {swatchColor && (
                <span
                  aria-hidden
                  className="size-3 shrink-0 self-center rounded-xs"
                  style={{ backgroundColor: swatchColor }}
                />
              )}
              <span
                className="min-w-0 truncate text-lg font-bold"
                title={titleTooltip.title}
                onPointerMove={titleTooltip.onPointerMove}
              >
                {title}
              </span>
            </h3>
            {totalCount !== null && (
              <span className="text-muted-foreground shrink-0 font-mono text-xs">
                · {traceCountLabel(totalCount)}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DataTableRowHeightSwitch
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
              tableName="topics-trace-list"
              customRowHeight={customRowHeightMenu(rowHeights)}
            />
            {tracingHref && (
              <Button
                href={tracingHref}
                text="Open in Tracing"
                variant="ghost"
                size="sm"
                icon={SquareArrowOutUpRight}
              />
            )}
          </div>
        </div>
        {description && (
          <p
            className="text-muted-foreground line-clamp-2 text-sm"
            title={descriptionTooltip.title}
            onPointerMove={descriptionTooltip.onPointerMove}
          >
            {description}
          </p>
        )}
      </div>
      <div ref={sizeRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={tableRef} className="contents">
          {/* The table reads column sizes once, so it waits for the measured width. */}
          {tableSize && (
            <DataTable
              // v2 drops column widths saved before the 20/30/50 defaults.
              tableName="topics-trace-list"
              columns={columns}
              data={{
                isLoading: traces.isLoading,
                isError: traces.error !== null,
                error: traces.error ?? undefined,
                data: rows.map((row) => ({ ...row, id: row.traceId })),
              }}
              className="min-h-0 overscroll-contain"
              cellPadding="relaxed"
              noResultsMessage={emptyMessage}
              peekView={peekView}
              rowSelection={selectedTraceId ? { [selectedTraceId]: true } : {}}
              rowHeight={rowHeight}
              customRowHeights={TRACE_ROW_HEIGHTS}
              customRowHeightPx={rowHeights.activeHeightPx}
              onCustomRowHeightChange={rowHeights.setCustomPx}
              onSelectRowHeight={setRowHeight}
              topAlignCells={wrapsSummary}
            />
          )}
        </div>
      </div>
      {traces.hasMore && <TopicTraceLoadMore traces={traces} />}
    </section>
  );
}

type TopicTraceListProps = {
  projectId: string;
  title: string;
  description?: string;
  swatchColor?: string;
  traces: TopicTracesResult;
  /** Each view keeps its own row height: the list sits beside the map in Scatter, full width elsewhere. */
  rowHeightKey?: string;
  /** Highlighted and scrolled into view, e.g. a trace picked on the map. */
  selectedTraceId?: string | null;
  /** Count of the listed traces; null when only the loaded rows are known. */
  totalCount: number | null;
  /** The listed topic, so Open in Tracing can filter by it instead of trace IDs. */
  tracingTopic?: { facet: Facet; name: string };
  peekView: DataTablePeekViewProps;
  tracePanelRef?: (element: HTMLElement | null) => void;
  /** Lets a neighbouring panel match this header's height. */
  headerRef?: RefObject<HTMLDivElement | null>;
  /** `none` when the parent draws the divider, e.g. a resize handle. */
  divider?: "side" | "none";
  /** Search and filters above the header. */
  search?: Omit<ComponentProps<typeof TopicsTraceToolbar>, "divider">;
  /** Shown when the list is empty, e.g. for a search that matches nothing. */
  emptyMessage?: string;
  /** Adds a Topic column, colored per topic ID. */
  topicColors?: ReadonlyMap<string, string>;
};

function traceCountLabel(count: number) {
  return `${count.toLocaleString()} traces`;
}
