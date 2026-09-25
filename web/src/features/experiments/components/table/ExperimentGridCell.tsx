/* The experiment marker's colour is data — which run this is, out of the N
   selected (`getExperimentColorStyles`) — so it arrives as a class rather than
   as a variant, the same way `DiffLabel` takes one. */
/* eslint-disable @repo/no-style-props */
import { EmptyValue } from "@/src/components/design-system/table/components/EmptyValue/EmptyValue";
import { EMPTY_VALUE_PLACEHOLDER } from "@/src/components/design-system/table/constants";
import { ConnectedIOTableCell } from "@/src/components/table/ConnectedIOTableCell";
import { Badge } from "@/src/components/ui/badge";
import {
  type ScoreAggregate,
  type AggregatedScoreData,
} from "@langfuse/shared";
import { useMemo, Fragment, useState } from "react";
import {
  type BaselineDiff,
  calculateNumericDiff,
  computeScoreDiffs,
  DiffLabel,
} from "@/src/features/datasets";
import { Separator } from "@/src/components/ui/separator";
import { type VisibilityState } from "@tanstack/react-table";
import {
  type CellRowDef,
  getVisibleCellRows,
} from "@/src/features/experiments/components/table/types";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { usdFormatter, latencyFormatter } from "@/src/utils/numbers";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { api } from "@/src/utils/api";
import { Skeleton } from "@/src/components/ui/skeleton";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { decomposeAggregateScoreKey } from "@/src/features/scores";
import { cn } from "@/src/utils/tailwind";
import Link from "next/link";
import { ScoreTag, type ScoreLevel } from "@/src/components/score-tag";
import { NotRecordedMetric } from "./NotRecordedMetric";
import { describeRunComparison } from "@/src/features/experiments/fns/describeRunComparison";

type ExperimentGridCellProps = {
  projectId: string;
  itemId: string;
  output: unknown;
  level: string;
  startTime: Date;
  totalCost?: number | null;
  latencyMs?: number | null;
  baselineTotalCost?: number | null;
  baselineLatencyMs?: number | null;
  observationId: string;
  traceId: string;
  /** Render the output cell as single-line text (true) or JSON tree (false). */
  singleLine: boolean;
  scores: ScoreAggregate;
  traceScores: ScoreAggregate;
  observationScoreOrder: string[];
  traceScoreOrder: string[];
  isBaseline: boolean;
  /** Whether this cell carries deltas against the baseline (the diff mode). */
  showDiff?: boolean;
  baselineScores?: ScoreAggregate;
  baselineTraceScores?: ScoreAggregate;
  /** Named in every diff chip's hover sentence, so the arrow has a direction. */
  baselineExperimentName?: string;
  isLoading?: boolean;
  columnVisibility?: VisibilityState;
  markerClassName?: string;
  showScoreLevelLabels: boolean;
  /** Clicking this experiment's cell selects it in peek navigation instead of the row's default (baseline) target. */
  onExperimentClick?: (event: React.MouseEvent) => void;
};

/**
 * Data passed to cell row render functions.
 */
type GridCellData = {
  reserveDiffSpace: boolean;
  projectId: string;
  itemId: string;
  output: unknown;
  level: string;
  startTime: Date;
  totalCost?: number | null;
  latencyMs?: number | null;
  totalCostDiff?: BaselineDiff;
  latencyDiff?: BaselineDiff;
  observationId: string;
  traceId: string;
  scores: ScoreAggregate;
  traceScores: ScoreAggregate;
  scoreDiffs?: Record<string, BaselineDiff>;
  traceScoreDiffs?: Record<string, BaselineDiff>;
  baselineScores?: ScoreAggregate;
  baselineTraceScores?: ScoreAggregate;
  baselineTotalCost?: number | null;
  baselineLatencyMs?: number | null;
  baselineExperimentName?: string;
  isLoading: boolean;
};

/**
 * How one score reads in a cell: a categorical score's modal value, a numeric
 * score's average. Shared with the hover sentence beside it, which has to
 * quote the same value the cell shows.
 */
const scoreValueOf = (aggregate?: AggregatedScoreData | null): string => {
  if (!aggregate) return EMPTY_VALUE_PLACEHOLDER;
  if (aggregate.type === "CATEGORICAL") {
    if (aggregate.valueCounts && aggregate.valueCounts.length > 0) {
      return [...aggregate.valueCounts].sort((a, b) => b.count - a.count)[0]
        .value;
    }
    return aggregate.values?.[0] ?? EMPTY_VALUE_PLACEHOLDER;
  }
  return aggregate.average !== undefined
    ? aggregate.average.toFixed(2)
    : EMPTY_VALUE_PLACEHOLDER;
};

const valueColumnsClass = (reserveDiffSpace: boolean) =>
  reserveDiffSpace
    ? "grid shrink-0 grid-cols-[auto_4.5rem] items-center justify-items-start gap-1"
    : "flex shrink-0 items-center justify-end gap-1";

/**
 * Simple score display component for grid cells.
 * Keeps score details together in a single hover card.
 */
const ScoreItem = ({
  scoreKey,
  aggregate,
  diff,
  projectId,
  level,
  showScoreLevelLabel,
  reserveDiffSpace,
}: {
  scoreKey: string;
  aggregate: AggregatedScoreData | null;
  diff?: BaselineDiff | null;
  projectId: string;
  level: Extract<ScoreLevel, "observation" | "trace">;
  showScoreLevelLabel: boolean;
  reserveDiffSpace: boolean;
}) => {
  // Decompose the key to get name, source, and dataType
  const { name, source, dataType } = decomposeAggregateScoreKey(scoreKey);

  const displayValue = scoreValueOf(aggregate);

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: metadata, isError } = api.scores.getScoreMetadataById.useQuery(
    { projectId, id: aggregate?.id ?? "" },
    {
      enabled:
        isOpen && !!projectId && !!aggregate?.id && !!aggregate.hasMetadata,
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  return (
    <HoverCard onOpenChange={setIsOpen}>
      <HoverCardTrigger asChild>
        <div
          tabIndex={0}
          className="flex cursor-default items-center justify-between gap-2 text-xs"
        >
          <div className="flex min-w-0 items-center gap-1">
            {showScoreLevelLabel && <ScoreTag level={level} />}
            {/* The hover card supplies the full name; suppress native titles. */}
            <span
              title=""
              className="text-muted-foreground block min-w-0 truncate"
            >
              {name}
            </span>
          </div>
          {/* Comparison rows reserve a delta slot even when their values are equal. */}
          <div className={valueColumnsClass(reserveDiffSpace)}>
            <span className="flex max-w-full min-w-0 items-center gap-1">
              {displayValue === EMPTY_VALUE_PLACEHOLDER ? (
                <span className="text-xs">
                  <EmptyValue />
                </span>
              ) : (
                <Badge
                  variant="secondary"
                  className="min-w-0 truncate text-xs font-bold"
                  title=""
                >
                  {displayValue}
                </Badge>
              )}
            </span>
            {diff && (
              <DiffLabel
                variant="ghost"
                className="px-0"
                diff={diff}
                formatValue={(value) => value.toFixed(2)}
              />
            )}
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="max-h-[50vh] w-80 overflow-auto text-xs break-words whitespace-normal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-3">
          <span className="font-bold">{name}</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Value</dt>
            <dd>{displayValue}</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="capitalize">{source.toLowerCase()}</dd>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="capitalize">{dataType.toLowerCase()}</dd>
          </dl>
          {aggregate?.comment && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Comment</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={copied ? "Copied" : "Copy comment"}
                  onClick={async () => {
                    await copyTextToClipboard(aggregate.comment!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <p className="whitespace-pre-wrap">{aggregate.comment}</p>
            </div>
          )}
          {aggregate?.hasMetadata && aggregate.id && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">Metadata</span>
              {isError && <p>Could not load metadata.</p>}
              {!isError && metadata !== undefined && (
                <JSONView json={metadata} />
              )}
              {!isError && metadata === undefined && (
                <Skeleton className="h-12 w-full" />
              )}
            </div>
          )}
          {aggregate?.executionTraceId && (
            <Link
              href={`/project/${projectId}/traces/${encodeURIComponent(aggregate.executionTraceId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View execution trace
            </Link>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

const getScoreRowDefinition = (
  scoreKey: string,
  level: Extract<ScoreLevel, "observation" | "trace">,
  showScoreLevelLabel: boolean,
): CellRowDef<GridCellData> => ({
  accessorKey: level === "trace" ? `Trace-${scoreKey}` : scoreKey,
  cell: ({ data }) => (
    <ScoreItem
      scoreKey={scoreKey}
      aggregate={
        level === "trace" ? data.traceScores[scoreKey] : data.scores[scoreKey]
      }
      diff={
        level === "trace"
          ? data.traceScoreDiffs?.[scoreKey]
          : data.scoreDiffs?.[scoreKey]
      }
      projectId={data.projectId}
      level={level}
      showScoreLevelLabel={showScoreLevelLabel}
      reserveDiffSpace={data.reserveDiffSpace}
    />
  ),
});

const METADATA_KEYS = ["totalCost", "latencyMs", "level", "startTime"] as const;

const hasVisibleCellMetadata = (columnVisibility: VisibilityState) =>
  METADATA_KEYS.some((key) => columnVisibility[key] !== false);

/** Compact label/value rows for the experiment's measurements and status. */
const CellMetadataFooter = ({
  data,
  columnVisibility,
}: {
  data: GridCellData;
  columnVisibility: VisibilityState;
}) => {
  const visible = (key: (typeof METADATA_KEYS)[number]) =>
    columnVisibility[key] !== false;
  const startTime = buildLocalIsoDatePresentation({ date: data.startTime });
  return (
    <div className="flex flex-col gap-1 text-xs">
      {(visible("latencyMs") || visible("startTime")) && (
        <div className="flex items-center justify-between gap-2">
          <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2">
            {visible("latencyMs") && <span>Latency</span>}
            {visible("startTime") && startTime && (
              <>
                <span aria-hidden>·</span>
                <time
                  className="font-mono text-[10px]"
                  dateTime={data.startTime.toISOString()}
                  title={startTime.title}
                >
                  {data.startTime.toLocaleTimeString()}
                </time>
              </>
            )}
          </div>
          {visible("latencyMs") && (
            <div className={valueColumnsClass(data.reserveDiffSpace)}>
              {data.latencyMs != null ? (
                <span className="font-bold tabular-nums">
                  {(data.latencyMs / 1000).toFixed(4)}s
                </span>
              ) : (
                <NotRecordedMetric metric="latency" />
              )}
              {data.latencyDiff && (
                <DiffLabel
                  variant="ghost"
                  className="px-0"
                  diff={data.latencyDiff}
                  preferNegativeDiff
                  formatValue={(value) => `${(value / 1000).toFixed(4)}s`}
                  title={describeRunComparison({
                    baselineName: data.baselineExperimentName,
                    baselineText: latencyFormatter(data.baselineLatencyMs ?? 0),
                    currentText: latencyFormatter(data.latencyMs ?? 0),
                    verb: "took",
                  })}
                />
              )}
            </div>
          )}
        </div>
      )}
      {visible("totalCost") && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Cost</span>
          <div className={valueColumnsClass(data.reserveDiffSpace)}>
            {data.totalCost != null ? (
              <span className="font-bold tabular-nums">
                {usdFormatter(data.totalCost, 4, 4)}
              </span>
            ) : (
              <NotRecordedMetric metric="cost" />
            )}
            {data.totalCostDiff && (
              <DiffLabel
                variant="ghost"
                className="px-0"
                diff={data.totalCostDiff}
                preferNegativeDiff
                formatValue={(value) => usdFormatter(value, 4, 4)}
                title={describeRunComparison({
                  baselineName: data.baselineExperimentName,
                  baselineText: usdFormatter(data.baselineTotalCost ?? 0, 2, 6),
                  currentText: usdFormatter(data.totalCost ?? 0, 2, 6),
                  verb: "cost",
                })}
              />
            )}
          </div>
        </div>
      )}
      {visible("level") && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Status</span>
          <div className={valueColumnsClass(data.reserveDiffSpace)}>
            <Badge variant="ghost" className="px-0">
              {data.level}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Renders a group section with header and content
 */
const GroupSection = ({
  header,
  children,
  markerClassName,
  grow = false,
}: {
  header?: string;
  children: React.ReactNode;
  markerClassName?: string;
  /** Take the cell's spare vertical space instead of hugging its content. */
  grow?: boolean;
}) => (
  <div
    className={cn(
      "flex flex-col gap-1 py-1.5 pl-2",
      // `grow` takes the spare space but keeps its content's height as its
      // base, so a cell with no spare space still shows the output rather than
      // collapsing to its label and letting the output spill over the scores.
      grow ? "shrink-0 grow" : "shrink-0",
    )}
  >
    {header && (
      <div className="flex items-center gap-1.5">
        {markerClassName !== undefined && (
          <span
            className={cn(
              "h-3 w-0.5 shrink-0 rounded-full",
              markerClassName || "bg-transparent",
            )}
          />
        )}
        <span className="text-muted-foreground text-[10px] font-bold uppercase">
          {header}
        </span>
      </div>
    )}
    {children}
  </div>
);

/**
 * Grid cell component for experiment comparison view.
 * Uses CellRowDef pattern to declaratively define sections with visibility control.
 */
export const ExperimentGridCell = ({
  projectId,
  itemId,
  output,
  level,
  startTime,
  totalCost,
  latencyMs,
  baselineTotalCost,
  baselineLatencyMs,
  observationId,
  traceId,
  singleLine,
  scores,
  traceScores,
  observationScoreOrder,
  traceScoreOrder,
  isBaseline,
  showDiff = true,
  baselineScores,
  baselineTraceScores,
  baselineExperimentName,
  isLoading = false,
  columnVisibility = {},
  markerClassName,
  showScoreLevelLabels,
  onExperimentClick,
}: ExperimentGridCellProps) => {
  const scoreDiffs = useMemo(
    () =>
      !showDiff || isBaseline || !baselineScores
        ? undefined
        : computeScoreDiffs(scores, baselineScores),
    [scores, baselineScores, isBaseline, showDiff],
  );

  const traceScoreDiffs = useMemo(
    () =>
      !showDiff || isBaseline || !baselineTraceScores
        ? undefined
        : computeScoreDiffs(traceScores, baselineTraceScores),
    [traceScores, baselineTraceScores, isBaseline, showDiff],
  );

  const totalCostDiff = useMemo(
    () =>
      !showDiff || isBaseline
        ? null
        : calculateNumericDiff(totalCost, baselineTotalCost),
    [baselineTotalCost, isBaseline, showDiff, totalCost],
  );
  const latencyDiff = useMemo(
    () =>
      !showDiff || isBaseline
        ? null
        : calculateNumericDiff(latencyMs, baselineLatencyMs),
    [baselineLatencyMs, isBaseline, latencyMs, showDiff],
  );

  const orderedObservationKeys = useMemo(
    () =>
      observationScoreOrder.length > 0
        ? observationScoreOrder
        : Object.keys(scores).sort(),
    [observationScoreOrder, scores],
  );

  const orderedTraceKeys = useMemo(
    () =>
      traceScoreOrder.length > 0
        ? traceScoreOrder
        : Object.keys(traceScores).sort(),
    [traceScoreOrder, traceScores],
  );

  const cellData: GridCellData = {
    reserveDiffSpace: !isBaseline && showDiff,
    projectId,
    itemId,
    output,
    level,
    startTime,
    totalCost,
    latencyMs,
    totalCostDiff,
    latencyDiff,
    observationId,
    traceId,
    scores,
    traceScores,
    scoreDiffs,
    traceScoreDiffs,
    baselineScores,
    baselineTraceScores,
    baselineTotalCost,
    baselineLatencyMs,
    baselineExperimentName,
    isLoading,
  };

  // Define cell rows declaratively - mirrors LangfuseColumnDef pattern
  // Fixed order: scores, metrics, output
  const cellRows: CellRowDef<GridCellData>[] = useMemo(
    () => [
      // Keep all score levels together. Individual score visibility still
      // follows the list-view columns.
      {
        accessorKey: "scores",
        header: "Scores",
        children: [
          ...(columnVisibility.observationScores !== false
            ? orderedObservationKeys.map((key) =>
                getScoreRowDefinition(key, "observation", showScoreLevelLabels),
              )
            : []),
          ...(columnVisibility.traceScores !== false
            ? orderedTraceKeys.map((key) =>
                getScoreRowDefinition(key, "trace", showScoreLevelLabels),
              )
            : []),
        ],
      },
      // Measurements share the scores' value and delta alignment.
      ...(hasVisibleCellMetadata(columnVisibility)
        ? ([
            {
              accessorKey: "metadata",
              cell: ({ data }) => (
                <CellMetadataFooter
                  data={data}
                  columnVisibility={columnVisibility}
                />
              ),
            },
          ] satisfies CellRowDef<GridCellData>[])
        : []),
      // Output section
      {
        accessorKey: "output",
        header: "Output",
        cell: ({ data }) =>
          data.isLoading ? (
            <ConnectedIOTableCell
              isLoading
              variant="output"
              singleLine={singleLine}
            />
          ) : (
            <ConnectedIOTableCell
              data={data.output ?? null}
              variant="output"
              singleLine={singleLine}
            />
          ),
      },
    ],
    [
      columnVisibility,
      orderedObservationKeys,
      orderedTraceKeys,
      showScoreLevelLabels,
      singleLine,
    ],
  );

  // Filter and compute visible rows
  const visibleRows = getVisibleCellRows(cellRows, columnVisibility);

  // For each group, check if it has visible children (for groups with children)
  const getVisibleContent = (row: CellRowDef<GridCellData>) => {
    if (row.children) {
      const visibleChildren = getVisibleCellRows(
        row.children,
        columnVisibility,
      );
      return visibleChildren.length > 0 ? visibleChildren : null;
    }
    return row.cell ? [row] : null;
  };

  // Build list of sections to render with their content
  const sectionsToRender = visibleRows
    .map((row) => ({
      row,
      content: getVisibleContent(row),
    }))
    .filter((section) => section.content !== null);

  // The cell is the scrollport in this layout: the output section keeps its
  // content's height as its base, so a long output remains scrollable beneath
  // the scores and metrics.
  // `scrollbar-visible` is what says so — under the platform's overlay
  // scrollbars a cell with more to show reads as one that was cut off.
  return (
    <div
      className={cn(
        "scrollbar-visible flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-auto",
        onExperimentClick && "cursor-pointer",
      )}
      onClick={onExperimentClick}
    >
      {sectionsToRender.map((section, index) => {
        const { row, content } = section;
        const isFirst = index === 0;
        const isLast = index === sectionsToRender.length - 1;

        // Output section - special handling for ConnectedIOTableCell. It is the
        // one section that grows, so a taller row shows more output rather than
        // more chrome.
        if (row.accessorKey === "output" && row.cell) {
          return (
            <Fragment key={row.accessorKey}>
              <GroupSection
                header={row.header}
                markerClassName={isFirst ? markerClassName : undefined}
                grow
              >
                <div className="min-h-16 flex-1 overflow-hidden">
                  {row.cell({ data: cellData })}
                </div>
              </GroupSection>
              {!isLast && <Separator />}
            </Fragment>
          );
        }

        // Groups with children (metadata, scores)
        if (row.children && content) {
          return (
            <Fragment key={row.accessorKey}>
              <GroupSection
                header={row.header}
                markerClassName={isFirst ? markerClassName : undefined}
              >
                <div className="flex flex-col gap-0.5">
                  {(content as CellRowDef<GridCellData>[]).map((child) => (
                    <div key={child.accessorKey}>
                      {child.cell?.({ data: cellData })}
                    </div>
                  ))}
                </div>
              </GroupSection>
              {!isLast && <Separator />}
            </Fragment>
          );
        }

        // Sections that render one cell of their own (the metadata footer).
        if (row.cell) {
          return (
            <Fragment key={row.accessorKey}>
              <GroupSection
                header={row.header}
                markerClassName={isFirst ? markerClassName : undefined}
              >
                {row.cell({ data: cellData })}
              </GroupSection>
              {!isLast && <Separator />}
            </Fragment>
          );
        }

        return null;
      })}
    </div>
  );
};

/**
 * Empty cell component for when there's no data for an experiment.
 */
export const ExperimentGridCellEmpty = () => {
  return (
    <div className="flex h-full w-full min-w-0 items-start justify-start p-2">
      <span className="text-muted-foreground text-xs">No data</span>
    </div>
  );
};
