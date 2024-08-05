import { ScoresAggregateCell } from "@/src/components/grouped-score-badge";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type GenerationsTableRow } from "@/src/components/table/use-cases/generations";
import { type TracesTableRow } from "@/src/components/table/use-cases/traces";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type DatasetRunItemRowData } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { type DatasetRunRowData } from "@/src/features/datasets/components/DatasetRunsTable";
import {
  type NumericAggregate,
  type CategoricalAggregate,
  type ScoreAggregate,
} from "@/src/features/manual-scoring/lib/aggregateScores";
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

const prefixKey = (key: string, prefix: "Trace" | "Generation"): string =>
  `${prefix}-${key}`;

export const getDataTypeIcon = (dataType: ScoreDataType): string => {
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
      header: `${prefix}: ${getDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
      accessorKey: prefixKey(key, prefix),
      id: prefixKey(key, prefix),
      enableHiding: true,
      size: 150,
    };
  }

  return {
    header: `${getDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
    accessorKey: key,
    id: key,
    enableHiding: true,
    size: 150,
  };
};

export function verifyScoreDataAgainstKeys(
  scoreKeys: ScoreDetailColumnProps[],
  scoreData: ScoreAggregate,
): ScoreAggregate {
  if (!Boolean(scoreKeys.length)) return {};
  let filteredScores: ScoreAggregate = {};

  for (const key in scoreData) {
    if (scoreKeys.some((column) => column.key === key)) {
      filteredScores[key] = scoreData[key];
    }
  }

  return filteredScores;
}

export function prefixScoreData(
  scoreData: ScoreAggregate,
  prefix: "Trace" | "Generation",
): ScoreAggregate {
  if (!Boolean(Object.keys(scoreData).length)) return {};
  let prefixedScores: ScoreAggregate = {};

  for (const key in scoreData) {
    prefixedScores[prefixKey(key, prefix)] = scoreData[key];
  }

  return prefixedScores;
}

export const constructIndividualScoreColumns = <
  T extends
    | GenerationsTableRow
    | TracesTableRow
    | DatasetRunItemRowData
    | DatasetRunRowData
    | PromptVersionTableRow,
>({
  scoreColumnProps,
  scoreColumnKey,
  showAggregateViewOnly = false,
  scoreColumnPrefix,
}: {
  scoreColumnProps: ScoreDetailColumnProps[];
  scoreColumnKey: keyof T & string;
  showAggregateViewOnly?: boolean;
  scoreColumnPrefix?: "Trace" | "Generation";
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

        if (!Boolean(Object.keys(scoresData).length)) return null;
        if (!scoresData.hasOwnProperty(accessorKey)) return null;

        const value: CategoricalAggregate | NumericAggregate | undefined =
          scoresData[accessorKey];

        if (!value) return null;
        return (
          <ScoresAggregateCell
            aggregate={value}
            showSingleValue={!showAggregateViewOnly}
          />
        );
      },
    };
  });
};

export const SCORE_GROUP_COLUMN_PROPS = {
  accessorKey: "scores",
  header: "Individual Scores",
  id: "scores",
  cell: () => {
    return <Skeleton className="h-3 w-1/2"></Skeleton>;
  },
};
