import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { Badge } from "@/src/components/ui/badge";
import {
  type ScoreAggregate,
  type AggregatedScoreData,
} from "@langfuse/shared";
import { useMemo, Fragment, useState } from "react";
import { computeScoreDiffs } from "@/src/features/datasets/lib/computeScoreDiffs";
import { type BaselineDiff } from "@/src/features/datasets/lib/calculateBaselineDiff";
import { DiffLabel } from "@/src/features/datasets/components/DiffLabel";
import { Separator } from "@/src/components/ui/separator";
import { type VisibilityState } from "@tanstack/react-table";
import {
  type CellRowDef,
  getVisibleCellRows,
} from "@/src/features/experiments/components/table/types";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { usdFormatter, latencyFormatter } from "@/src/utils/numbers";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { MessageCircleMore, BracesIcon, Copy, Check } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { api } from "@/src/utils/api";
import { Skeleton } from "@/src/components/ui/skeleton";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { decomposeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { cn } from "@/src/utils/tailwind";

type ExperimentGridCellProps = {
  projectId: string;
  itemId: string;
  output: unknown;
  level: string;
  startTime: Date;
  totalCost?: number | null;
  latencyMs?: number | null;
  observationId: string;
  traceId: string;
  scores: ScoreAggregate;
  traceScores: ScoreAggregate;
  observationScoreOrder: string[];
  traceScoreOrder: string[];
  isBaseline: boolean;
  baselineScores?: ScoreAggregate;
  baselineTraceScores?: ScoreAggregate;
  isLoading?: boolean;
  columnVisibility?: VisibilityState;
  markerClassName?: string;
};

/**
 * Data passed to cell row render functions.
 */
type GridCellData = {
  projectId: string;
  itemId: string;
  output: unknown;
  level: string;
  startTime: Date;
  totalCost?: number | null;
  latencyMs?: number | null;
  observationId: string;
  traceId: string;
  scores: ScoreAggregate;
  traceScores: ScoreAggregate;
  scoreDiffs?: Record<string, BaselineDiff>;
  traceScoreDiffs?: Record<string, BaselineDiff>;
  isLoading: boolean;
};

/**
 * Component to show score comment on hover
 */
const ScoreCommentPeek = ({ comment }: { comment: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    await copyTextToClipboard(comment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <HoverCard>
      <HoverCardTrigger className="inline-flex cursor-pointer">
        <MessageCircleMore size={12} className="text-muted-foreground" />
      </HoverCardTrigger>
      <HoverCardContent className="flex flex-col p-0 text-xs break-normal whitespace-normal">
        <div className="bg-popover sticky top-0 z-10 flex h-8 items-center justify-end px-1">
          <Button
            onClick={handleCopy}
            variant="ghost"
            size="icon-xs"
            className="hover:bg-accent rounded p-1"
            aria-label={copied ? "Copied" : "Copy to clipboard"}
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>
        </div>
        <div className="max-h-[40vh] overflow-y-auto p-3 pt-0">
          <p className="whitespace-pre-wrap">{comment}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

/**
 * Component to show score metadata on hover
 */
const ScoreMetadataPeek = ({
  scoreId,
  projectId,
}: {
  scoreId: string;
  projectId: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const { data: metadata } = api.scores.getScoreMetadataById.useQuery(
    {
      projectId,
      id: scoreId,
    },
    {
      enabled: !!projectId && !!scoreId && isOpen,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const metadataLoaded = metadata && Object.keys(metadata).length > 0;

  return (
    <HoverCard onOpenChange={setIsOpen}>
      <HoverCardTrigger className="inline-flex cursor-pointer">
        <BracesIcon size={12} className="text-muted-foreground" />
      </HoverCardTrigger>
      <HoverCardContent className="overflow-hidden rounded-md border-none p-0 text-xs break-normal whitespace-normal">
        {metadataLoaded ? (
          <JSONView codeClassName="rounded-md!" json={metadata} />
        ) : (
          <Skeleton className="h-12 w-full" />
        )}
      </HoverCardContent>
    </HoverCard>
  );
};

/**
 * Simple score display component for grid cells.
 * Shows only the score name, with source and type on hover.
 */
const ScoreItem = ({
  scoreKey,
  aggregate,
  diff,
  projectId,
}: {
  scoreKey: string;
  aggregate: AggregatedScoreData | null;
  diff?: BaselineDiff | null;
  projectId: string;
}) => {
  // Decompose the key to get name, source, and dataType
  const { name, source, dataType } = decomposeAggregateScoreKey(scoreKey);

  let displayValue = "-";
  if (aggregate) {
    if (aggregate.type === "CATEGORICAL") {
      if (aggregate.valueCounts && aggregate.valueCounts.length > 0) {
        const sorted = [...aggregate.valueCounts].sort(
          (a, b) => b.count - a.count,
        );
        displayValue = sorted[0].value;
      } else if (aggregate.values && aggregate.values.length > 0) {
        displayValue = aggregate.values[0];
      }
    } else {
      displayValue =
        aggregate.average !== undefined ? aggregate.average.toFixed(2) : "-";
    }
  }

  const hasComment = aggregate?.comment;
  const hasMetadata = aggregate?.hasMetadata && aggregate?.id;

  return (
    <div className="flex items-center justify-between gap-1 text-xs">
      <HoverCard>
        <HoverCardTrigger className="max-w-[50%] cursor-default">
          <span className="text-muted-foreground block truncate">{name}</span>
        </HoverCardTrigger>
        <HoverCardContent
          side="left"
          className="w-auto p-2 text-xs"
          align="start"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Source:</span>
              <span className="capitalize">{source.toLowerCase()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Type:</span>
              <span className="capitalize">{dataType.toLowerCase()}</span>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
      <div className="flex items-center gap-1">
        {displayValue === "-" ? (
          <span className="text-muted-foreground font-mono text-xs">-</span>
        ) : (
          <Badge variant="secondary" className="font-mono text-xs">
            {displayValue}
          </Badge>
        )}
        {hasComment && <ScoreCommentPeek comment={aggregate.comment!} />}
        {hasMetadata && (
          <ScoreMetadataPeek scoreId={aggregate.id!} projectId={projectId} />
        )}
        {diff && <DiffLabel diff={diff} formatValue={(v) => v.toFixed(2)} />}
      </div>
    </div>
  );
};

/**
 * Simple key-value display for metadata fields
 */
const MetadataItem = ({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-4 text-xs">
    <span className="text-muted-foreground shrink-0">{label}</span>
    <div className="min-w-0 truncate">{children}</div>
  </div>
);

/**
 * Renders a group section with header and content
 */
const GroupSection = ({
  header,
  children,
  markerClassName,
}: {
  header?: string;
  children: React.ReactNode;
  markerClassName?: string;
}) => (
  <div className="flex shrink-0 flex-col gap-1 px-2 py-1.5">
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
        <span className="text-muted-foreground text-[10px] font-semibold uppercase">
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
  observationId,
  traceId,
  scores,
  traceScores,
  observationScoreOrder,
  traceScoreOrder,
  isBaseline,
  baselineScores,
  baselineTraceScores,
  isLoading = false,
  columnVisibility = {},
  markerClassName,
}: ExperimentGridCellProps) => {
  const scoreDiffs = useMemo(
    () =>
      isBaseline || !baselineScores
        ? undefined
        : computeScoreDiffs(scores, baselineScores),
    [scores, baselineScores, isBaseline],
  );

  const traceScoreDiffs = useMemo(
    () =>
      isBaseline || !baselineTraceScores
        ? undefined
        : computeScoreDiffs(traceScores, baselineTraceScores),
    [traceScores, baselineTraceScores, isBaseline],
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
    projectId,
    itemId,
    output,
    level,
    startTime,
    totalCost,
    latencyMs,
    observationId,
    traceId,
    scores,
    traceScores,
    scoreDiffs,
    traceScoreDiffs,
    isLoading,
  };

  // Define cell rows declaratively - mirrors LangfuseColumnDef pattern
  // Fixed order: output, scores, trace scores, metadata
  const cellRows: CellRowDef<GridCellData>[] = useMemo(
    () => [
      // Output section
      {
        accessorKey: "output",
        header: "Output",
        cell: ({ data }) => (
          <MemoizedIOTableCell
            isLoading={data.isLoading}
            data={data.output ?? null}
            className="bg-accent-light-green min-h-8"
            singleLine={false}
            enableExpandOnHover
          />
        ),
      },
      // Observation scores
      {
        accessorKey: "observationScores",
        header: "Scores",
        children: orderedObservationKeys.map((key) => ({
          accessorKey: key,
          cell: ({ data }) => (
            <ScoreItem
              scoreKey={key}
              aggregate={data.scores[key]}
              diff={data.scoreDiffs?.[key]}
              projectId={data.projectId}
            />
          ),
        })),
      },
      // Trace scores
      {
        accessorKey: "traceScores",
        header: "Trace Scores",
        children: orderedTraceKeys.map((key) => ({
          accessorKey: `Trace-${key}`,
          cell: ({ data }) => (
            <ScoreItem
              scoreKey={key}
              aggregate={data.traceScores[key]}
              diff={data.traceScoreDiffs?.[key]}
              projectId={data.projectId}
            />
          ),
        })),
      },
      // Metadata group - itemId, observationId, level, startTime
      {
        accessorKey: "metadata",
        header: "Metadata",
        children: [
          {
            accessorKey: "itemId",
            cell: ({ data }) => (
              <MetadataItem label="Item ID">
                <span className="font-mono text-xs">{data.itemId}</span>
              </MetadataItem>
            ),
          },
          {
            accessorKey: "observationId",
            cell: ({ data }) => (
              <MetadataItem label="Observation">
                <span className="font-mono text-xs">{data.observationId}</span>
              </MetadataItem>
            ),
          },
          {
            accessorKey: "level",
            cell: ({ data }) => (
              <MetadataItem label="Level">
                <span className="text-xs">{data.level}</span>
              </MetadataItem>
            ),
          },
          {
            accessorKey: "startTime",
            cell: ({ data }) => (
              <MetadataItem label="Start Time">
                <LocalIsoDate date={data.startTime} className="text-xs" />
              </MetadataItem>
            ),
          },
          {
            accessorKey: "totalCost",
            cell: ({ data }) => (
              <MetadataItem label="Total Cost">
                <span className="text-xs">
                  {data.totalCost != null ? (
                    usdFormatter(data.totalCost, 2, 6)
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </span>
              </MetadataItem>
            ),
          },
          {
            accessorKey: "latencyMs",
            cell: ({ data }) =>
              data.latencyMs != null ? (
                <MetadataItem label="Latency">
                  <span className="text-xs">
                    {latencyFormatter(data.latencyMs)}
                  </span>
                </MetadataItem>
              ) : undefined,
          },
        ],
      },
    ],
    [orderedObservationKeys, orderedTraceKeys],
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

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto">
      {sectionsToRender.map((section, index) => {
        const { row, content } = section;
        const isFirst = index === 0;
        const isLast = index === sectionsToRender.length - 1;

        // Output section - special handling for MemoizedIOTableCell
        if (row.accessorKey === "output" && row.cell) {
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
    <div className="flex h-full w-full items-start justify-start p-2">
      <span className="text-muted-foreground text-xs">No data</span>
    </div>
  );
};
