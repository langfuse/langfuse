import { ScoresTableCell } from "@/src/components/scores-table-cell";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type GenerationsTableRow } from "@/src/components/table/use-cases/generations";
import { type TracesTableRow } from "@/src/components/table/use-cases/traces";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type DatasetRunItemRowData } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { type DatasetRunRowData } from "@/src/features/datasets/components/DatasetRunsTable";
import {
  type ScoreAggregate,
  type TableRowTypesWithIndividualScoreColumns,
  type CategoricalAggregate,
  type NumericAggregate,
} from "@/src/features/scores/lib/types";
import { type PromptVersionTableRow } from "@/src/pages/project/[projectId]/prompts/[promptName]/metrics";
import { type ScoreDataType, type ScoreSource } from "@langfuse/shared";
import { type Row } from "@tanstack/react-table";
import React from "react";

type ScoreDetailColumnProps = {
  key: string;
  name: string;
  dataType: ScoreDataType;
  source: ScoreSource;
};

const prefixScoreColKey = (
  key: string,
  prefix: "Trace" | "Generation",
): string => `${prefix}-${key}`;

export const getScoreDataTypeIcon = (dataType: ScoreDataType): string => {
  switch (dataType) {
    case "NUMERIC":
    default:
      return "#";
    case "CATEGORICAL":
      return "Ⓒ";
    case "BOOLEAN":
      return "Ⓑ";
  }
};

const parseScoreColumn = <
  T extends
    | TracesTableRow
    | GenerationsTableRow
    | DatasetRunRowData
    | DatasetRunItemRowData
    | PromptVersionTableRow,
>(
  col: ScoreDetailColumnProps,
  prefix?: "Trace" | "Generation",
): LangfuseColumnDef<T> => {
  const { key, name, source, dataType } = col;

  if (!!prefix) {
    return {
      header: `${prefix}: ${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
      accessorKey: prefixScoreColKey(key, prefix),
      id: prefixScoreColKey(key, prefix),
      enableHiding: true,
      size: 150,
    };
  }

  return {
    header: `${getScoreDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
    accessorKey: key,
    id: key,
    enableHiding: true,
    size: 150,
  };
};

export function verifyAndPrefixScoreDataAgainstKeys(
  scoreKeys: ScoreDetailColumnProps[],
  scoreData: ScoreAggregate,
  prefix?: "Trace" | "Generation",
): ScoreAggregate {
  if (!Boolean(scoreKeys.length)) return {};
  let filteredScores: ScoreAggregate = {};

  const getScoreKey = (key: string) =>
    !!prefix ? prefixScoreColKey(key, prefix) : key;

  for (const key in scoreData) {
    if (scoreKeys.some((column) => column.key === key)) {
      filteredScores[getScoreKey(key)] = scoreData[key];
    }
  }

  return filteredScores;
}

export const constructIndividualScoreColumns = <
  T extends TableRowTypesWithIndividualScoreColumns,
>({
  scoreColumnProps,
  scoreColumnKey,
  showAggregateViewOnly = false,
  scoreColumnPrefix,
  cellsLoading = false,
}: {
  scoreColumnProps: ScoreDetailColumnProps[];
  scoreColumnKey: keyof T & string;
  showAggregateViewOnly?: boolean;
  scoreColumnPrefix?: "Trace" | "Generation";
  cellsLoading?: boolean;
}): LangfuseColumnDef<T>[] => {
  return scoreColumnProps.map((col) => {
    const { accessorKey, header, size, enableHiding } = parseScoreColumn<T>(
      col,
      scoreColumnPrefix,
    );

    return {
      accessorKey,
      header,
      size,
      enableHiding,
      cell: ({ row }: { row: Row<T> }) => {
        const scoresData: ScoreAggregate = row.getValue(scoreColumnKey) ?? {};

        if (cellsLoading) return <Skeleton className="h-3 w-1/2" />;

        if (!Boolean(Object.keys(scoresData).length)) return null;
        if (!scoresData.hasOwnProperty(accessorKey)) return null;

        const value: CategoricalAggregate | NumericAggregate | undefined =
          scoresData[accessorKey];

        if (!value) return null;
        return (
          <ScoresTableCell
            aggregate={value}
            showSingleValue={!showAggregateViewOnly}
          />
        );
      },
    };
  });
};

export const getScoreGroupColumnProps = (isLoading: boolean) => ({
  accessorKey: "scores",
  header: "Scores",
  id: "scores",
  enableHiding: true,
  hideByDefault: true,
  cell: () => {
    return isLoading ? <Skeleton className="h-3 w-1/2" /> : null;
  },
});
