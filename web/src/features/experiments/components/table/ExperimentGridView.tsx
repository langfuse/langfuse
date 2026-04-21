import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { MemoizedIOTableCell } from "@/src/components/ui/IOTableCell";
import { Badge } from "@/src/components/ui/badge";
import {
  ExperimentGridCell,
  ExperimentGridCellEmpty,
} from "./ExperimentGridCell";
import {
  type ExperimentItemsTableRow,
  getExperimentColorStyles,
} from "./types";
import { useMemo } from "react";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import {
  type OnChangeFn,
  type PaginationState,
  type VisibilityState,
  type RowSelectionState,
} from "@tanstack/react-table";
import { useExperimentNames } from "@/src/features/experiments/hooks/useExperimentNames";
import { cn } from "@/src/utils/tailwind";
import { type ReactNode } from "react";
import { type DataTablePeekViewProps } from "@/src/components/table/peek";

// Grid view row heights (matching DatasetCompareRunsTable)
const GRID_VIEW_ROW_HEIGHTS = {
  s: "h-48", // 192px
  m: "h-64", // 256px
  l: "h-96", // 384px
};

type ExperimentGridViewProps = {
  projectId: string;
  baselineExperimentId: string;
  comparisonExperimentIds: string[];
  useExperimentColors?: boolean;
  rows: ExperimentItemsTableRow[];
  isLoading: boolean;
  rowHeight: RowHeight;
  observationScoreOrder: string[];
  traceScoreOrder: string[];
  columnVisibility: VisibilityState;
  pagination: {
    totalCount: number | null;
    onChange: OnChangeFn<PaginationState>;
    state: PaginationState;
  };
  noResultsMessage?: ReactNode;
  peekView?: DataTablePeekViewProps;
  // Selection props
  selectActionColumn?: LangfuseColumnDef<ExperimentItemsTableRow>;
  rowSelection: RowSelectionState;
  setRowSelection: OnChangeFn<RowSelectionState>;
};

/**
 * Grid view for experiment comparison.
 * Shows one column per experiment with output and scores in each cell.
 */
export const ExperimentGridView = ({
  projectId,
  baselineExperimentId,
  comparisonExperimentIds,
  useExperimentColors = true,
  rows,
  isLoading,
  rowHeight,
  observationScoreOrder,
  traceScoreOrder,
  columnVisibility,
  pagination,
  noResultsMessage,
  peekView,
  selectActionColumn,
  rowSelection,
  setRowSelection,
}: ExperimentGridViewProps) => {
  // Build all experiment IDs (baseline first)
  const allExperimentIds = useMemo(
    () => [baselineExperimentId, ...comparisonExperimentIds],
    [baselineExperimentId, comparisonExperimentIds],
  );

  const { experimentNames } = useExperimentNames({ projectId });

  // Build dynamic columns for each experiment
  const experimentColumns = useMemo(() => {
    return allExperimentIds.map((expId, index) => {
      const isBaseline = index === 0;
      const expInfo = experimentNames.find((e) => e.experimentId === expId);
      const expName = expInfo?.experimentName ?? expId.slice(0, 8);
      const colorStyles = useExperimentColors
        ? getExperimentColorStyles(expId, allExperimentIds)
        : undefined;

      return {
        accessorKey: `exp_${index}`, // Avoid nested path syntax that confuses TanStack
        id: expId,
        header: () => (
          <div className="flex items-center gap-2">
            <span
              className={cn("truncate font-medium", colorStyles?.textClass)}
            >
              {expName}
            </span>
            {useExperimentColors && (
              <Badge
                variant="outline"
                size="sm"
                className={cn("shrink-0 font-medium", colorStyles?.badgeClass)}
              >
                {isBaseline ? "Baseline" : "Comp"}
              </Badge>
            )}
          </div>
        ),
        size: 400,
        cell: ({ row }) => {
          // Find this experiment's data
          const expData = row.original.experiments.find(
            (e) => e.experimentId === expId,
          );
          const output = row.original.outputs?.find(
            (o) => o.experimentId === expId,
          )?.output;

          if (!expData) {
            return <ExperimentGridCellEmpty />;
          }

          // Get baseline data for diff calculation
          const baselineData =
            isBaseline || !useExperimentColors
              ? undefined
              : row.original.experiments.find(
                  (e) => e.experimentId === baselineExperimentId,
                );

          return (
            <ExperimentGridCell
              projectId={projectId}
              itemId={row.original.itemId}
              output={output}
              level={expData.level}
              startTime={expData.startTime}
              totalCost={expData.totalCost}
              latencyMs={expData.latencyMs}
              observationId={expData.observationId}
              traceId={expData.traceId}
              scores={expData.observationScores ?? {}}
              traceScores={expData.traceScores ?? {}}
              observationScoreOrder={observationScoreOrder}
              traceScoreOrder={traceScoreOrder}
              isBaseline={isBaseline}
              baselineScores={baselineData?.observationScores}
              baselineTraceScores={baselineData?.traceScores}
              columnVisibility={columnVisibility}
              markerClassName={colorStyles?.markerClass}
            />
          );
        },
      } as LangfuseColumnDef<ExperimentItemsTableRow>;
    });
  }, [
    allExperimentIds,
    experimentNames,
    baselineExperimentId,
    projectId,
    observationScoreOrder,
    traceScoreOrder,
    columnVisibility,
    useExperimentColors,
  ]);

  // Build all columns: Select, Input, Expected Output, then experiment columns
  const columns: LangfuseColumnDef<ExperimentItemsTableRow>[] = useMemo(
    () => [
      // Include select column if provided
      ...(selectActionColumn ? [selectActionColumn] : []),
      {
        accessorKey: "input",
        id: "input",
        header: "Input",
        size: 200,
        cell: ({ row }) => (
          <MemoizedIOTableCell
            isLoading={isLoading}
            data={row.original.input ?? null}
            singleLine={false}
            enableExpandOnHover
          />
        ),
      },
      {
        accessorKey: "expectedOutput",
        id: "expectedOutput",
        header: "Expected Output",
        size: 200,
        cell: ({ row }) => (
          <MemoizedIOTableCell
            isLoading={isLoading}
            data={row.original.expectedOutput ?? null}
            singleLine={false}
            className="bg-accent-light-green"
            enableExpandOnHover
          />
        ),
      },
      ...experimentColumns,
    ],
    [experimentColumns, isLoading, selectActionColumn],
  );

  return (
    <DataTable
      tableName="experiment-grid"
      columns={columns}
      data={
        isLoading
          ? { isLoading: true, isError: false }
          : { isLoading: false, isError: false, data: rows }
      }
      noResultsMessage={noResultsMessage}
      pagination={pagination}
      rowHeight={rowHeight}
      customRowHeights={GRID_VIEW_ROW_HEIGHTS}
      topAlignCells
      peekView={peekView}
      columnVisibility={columnVisibility}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
    />
  );
};
