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
import {
  getScoreDataTypeIcon,
  withPresentScoreKeys,
} from "@/src/features/scores/lib/scoreColumns";

// Simple score column creation - exported for reuse
export function createScoreColumns<T extends Record<string, any>>({
  scoreColumns,
  scoreColumnKey,
  displayFormat,
  prefix,
  headerPrefix,
  defaultHidden,
  rawKey,
}: {
  scoreColumns: Array<{
    key: string;
    name: string;
    source: string;
    dataType: ScoreDataTypeType;
  }>;
  scoreColumnKey: keyof T & string;
  displayFormat: "smart" | "aggregate";
  /** Prefix for the column id/accessor, keeping two score levels apart. */
  prefix?: string;
  /** Score level shown in the header. Defaults to `prefix`. */
  headerPrefix?: string;
  defaultHidden?: boolean;
  rawKey?: boolean;
}): LangfuseColumnDef<T>[] {
  return scoreColumns.map(({ key, name, source, dataType }) => {
    const accessorKey = prefix ? `${prefix}-${key}` : key;
    // The score's name identifies the column, so it comes first. A score
    // column is narrow and truncates from the right, so a leading level ate
    // the name and left every column of a level looking alike. The level
    // still trails the name, where the hover title and the column picker
    // pick it up in full. The header level is decoupled from the id prefix so
    // the level can be renamed without orphaning persisted visibility/order.
    const level = headerPrefix ?? prefix;
    const label = `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`;
    const header = level ? `${label} · ${level}` : label;

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
  headerPrefix,
  isFilterDataPending = false,
  displayFormat = "smart",
  defaultHidden,
  rawKey = false,
  presentKeys,
}: {
  projectId: string;
  scoreColumnKey: keyof T & string;
  filter?: FilterCondition[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
  prefix?: string;
  /** Score level shown in the header. Defaults to `prefix`. */
  headerPrefix?: string;
  isFilterDataPending?: boolean;
  displayFormat?: "smart" | "aggregate";
  defaultHidden?: boolean;
  rawKey?: boolean;
  /**
   * Restricts the columns to the score keys that actually carry a value in the
   * current result set. Leave undefined to create a column per discovered
   * score, and while that data is still loading.
   */
  presentKeys?: ReadonlySet<string>;
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

    return createScoreColumns<T>({
      scoreColumns: withPresentScoreKeys(
        toOrderedScoresList(scoreColumnsQuery.data.scoreColumns),
        presentKeys,
      ),
      scoreColumnKey,
      displayFormat,
      prefix,
      headerPrefix,
      defaultHidden,
      rawKey,
    });
  }, [
    scoreColumnsQuery.data?.scoreColumns,
    scoreColumnKey,
    prefix,
    headerPrefix,
    displayFormat,
    defaultHidden,
    rawKey,
    presentKeys,
  ]);

  return {
    scoreColumns,
    isLoading: scoreColumnsQuery.isPending,
    error: scoreColumnsQuery.error,
  };
}
