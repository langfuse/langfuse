import { useMemo } from "react";
import { api } from "@/src/utils/api";
import {
  type ScoreDataType,
  type FilterCondition,
  type ScoreAggregate,
} from "@langfuse/shared";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { ScoresTableCell } from "@/src/components/scores-table-cell";
import { toOrderedScoresList } from "@/src/features/scores/lib/helpers";
import { getScoreDataTypeIcon } from "@/src/features/scores/lib/scoreColumns";

// Simple score column creation
function createScoreColumns<T extends Record<string, any>>(
  scoreColumns: Array<{
    key: string;
    name: string;
    source: string;
    dataType: ScoreDataType;
  }>,
  scoreColumnKey: keyof T & string,
  prefix?: string,
): LangfuseColumnDef<T>[] {
  return scoreColumns.map(({ key, name, source, dataType }) => {
    // Apply prefix to both column ID/accessor and header
    const accessorKey = prefix ? `${prefix}-${key}` : key;
    const header = prefix
      ? `${prefix}: ${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`
      : `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`;

    return {
      accessorKey,
      header,
      id: accessorKey,
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        // Handle both prefixed and non-prefixed score data access
        const scoresData: ScoreAggregate = row.getValue(scoreColumnKey) ?? {};
        const value = scoresData[accessorKey];

        if (!value) return null;

        return ScoresTableCell({
          aggregate: value,
          showSingleValue: true,
          hasMetadata: value.hasMetadata ?? false,
        });
      },
    };
  });
}

export function useScoreColumns<T extends Record<string, any>>({
  projectId,
  scoreColumnKey,
  filter,
  fromTimestamp,
  toTimestamp,
  prefix,
  isFilterDataPending = false,
}: {
  projectId: string;
  scoreColumnKey: keyof T & string;
  filter?: FilterCondition[];
  fromTimestamp?: Date;
  toTimestamp?: Date;
  prefix?: string;
  isFilterDataPending?: boolean;
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
      prefix,
    );
  }, [scoreColumnsQuery.data?.scoreColumns, scoreColumnKey, prefix]);

  return {
    scoreColumns,
    isLoading: scoreColumnsQuery.isPending,
    error: scoreColumnsQuery.error,
  };
}
