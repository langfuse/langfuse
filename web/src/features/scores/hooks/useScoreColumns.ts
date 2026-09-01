import { useMemo } from "react";
import { api } from "@/src/utils/api";
import {
  type ScoreDataTypeType,
  type FilterCondition,
  type ScoreAggregate,
} from "@langfuse/shared";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { ScoresTableCell } from "@/src/components/scores-table-cell";
import { toOrderedScoresList } from "@/src/features/scores/lib/helpers";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";

// Simple score column creation - exported for reuse
export function createScoreColumns<T extends Record<string, any>>(
  scoreColumns: Array<{
    key: string;
    name: string;
    source: string;
    dataType: ScoreDataTypeType;
  }>,
  scoreColumnKey: keyof T & string,
  displayFormat: "smart" | "aggregate",
  prefix?: string,
  defaultHidden?: boolean,
  rawKey?: boolean,
): LangfuseColumnDef<T>[] {
  return scoreColumns.map(({ key, name, source, dataType }) => {
    const accessorKey = prefix ? `${prefix}-${key}` : key;
    // The score's name identifies the column, so it comes first. A score
    // column is narrow and truncates from the right, so a leading level ate
    // the name and left every column of a level looking alike. The level
    // still trails the name, where the hover title and the column picker
    // pick it up in full.
    const label = `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`;
    const header = prefix ? `${label} · ${prefix}` : label;

    return {
      accessorKey,
      header,
      id: accessorKey,
      enableHiding: true,
      defaultHidden,
      size: 150,
      cell: ({ row }) => {
        const scoresData: ScoreAggregate = row.getValue(scoreColumnKey) ?? {};
        const value = rawKey ? scoresData[key] : scoresData[accessorKey];

        if (!value) return null;

        return ScoresTableCell({
          aggregate: value,
          displayFormat,
          hasMetadata: value.hasMetadata ?? false,
        });
      },
    };
  });
}

/**
 * Hook to fetch and create score columns for tables.
 *
 * @param displayFormat Controls how scores are displayed:
 *   - "smart" (default): Shows single value when there's only one score, aggregate stats when multiple
 *   - "aggregate": Always shows aggregate format (count, avg, etc.) regardless of score count
 */
export function useScoreColumns<T extends Record<string, any>>({
  projectId,
  scoreColumnKey,
  filter,
  fromTimestamp,
  toTimestamp,
  prefix,
  isFilterDataPending = false,
  displayFormat = "smart",
  defaultHidden,
  rawKey = false,
}: {
  projectId: string;
  scoreColumnKey: keyof T & string;
  filter?: FilterCondition[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
  prefix?: string;
  isFilterDataPending?: boolean;
  displayFormat?: "smart" | "aggregate";
  defaultHidden?: boolean;
  rawKey?: boolean;
}) {
  const scoreColumnsQuery = api.scores.getScoreColumns.useQuery(
    {
      projectId,
      filter: filter || [],
      fromTimestamp,
      toTimestamp,
    },
    {
      enabled: !isFilterDataPending,
    },
  );

  const scoreColumns = useMemo(() => {
    if (!scoreColumnsQuery.data?.scoreColumns) return [];

    return createScoreColumns<T>(
      toOrderedScoresList(scoreColumnsQuery.data.scoreColumns),
      scoreColumnKey,
      displayFormat,
      prefix,
      defaultHidden,
      rawKey,
    );
  }, [
    scoreColumnsQuery.data?.scoreColumns,
    scoreColumnKey,
    prefix,
    displayFormat,
    defaultHidden,
    rawKey,
  ]);

  return {
    scoreColumns,
    isLoading: scoreColumnsQuery.isPending,
    error: scoreColumnsQuery.error,
  };
}
