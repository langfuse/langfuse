import { ScoresAggregateCell } from "@/src/components/grouped-score-badge";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type GenerationsTableRow } from "@/src/components/table/use-cases/generations";
import { type TracesTableRow } from "@/src/components/table/use-cases/traces";
import { type DatasetRunItemRowData } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { type DatasetRunRowData } from "@/src/features/datasets/components/DatasetRunsTable";
import {
  type QuantitativeAggregate,
  type QualitativeAggregate,
  type ScoreAggregate,
  composeAggregateScoreKey,
} from "@/src/features/manual-scoring/lib/aggregateScores";
import { type PromptVersionTableRow } from "@/src/pages/project/[projectId]/prompts/[promptName]/metrics";
import { type ScoreDataType, type ScoreSource } from "@langfuse/shared";
import { type Row } from "@tanstack/react-table";
import React from "react";

const parseColumnForProps = (col: string) => {
  const [name, source, dataType] = col.split("-");
  return {
    name,
    source: source as ScoreSource,
    dataType: dataType as ScoreDataType,
  };
};

export const getDataTypeIcon = (dataType: string): string => {
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

const parseColumnForKeyAndHeader = (col: string) => {
  const { name, source, dataType } = parseColumnForProps(col);
  return {
    key: composeAggregateScoreKey({ name, source, dataType }),
    header: `${getDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
  };
};

const parseDetailColumn = <
  T extends
    | TracesTableRow
    | GenerationsTableRow
    | DatasetRunRowData
    | DatasetRunItemRowData
    | PromptVersionTableRow,
>(
  col: string,
  parseColFct: (col: string) => {
    key: string;
    header: string;
  },
): LangfuseColumnDef<T> => {
  const { key, header } = parseColFct(col);
  return {
    header,
    accessorKey: key,
    id: key,
    enableHiding: true,
    size: 150,
  };
};

const computeAccessorDefault = (key: string) => {
  const { name, source, dataType } = parseColumnForProps(key);
  return composeAggregateScoreKey({ name, source, dataType });
};

export function getDetailColumns(
  scoreColumns: string[],
  scores: ScoreAggregate,
  computeAccessor = computeAccessorDefault,
): ScoreAggregate {
  if (!Boolean(scoreColumns.length)) return {};
  let filteredScores: ScoreAggregate = {};

  for (const key in scores) {
    if (scoreColumns.includes(key)) {
      const accessor = computeAccessor(key);
      filteredScores[accessor] = scores[key];
    }
  }

  return filteredScores;
}

/**
 * Constructs columns for a table to display scores as individual columns.
 *
 * @param {string[]} params.detailColumnAccessors - The accessors for the detail columns.
 * @param {boolean} [params.showAggregateViewOnly=false] - Whether to only show the aggregate view.
 * @param {Function} [params.parseColumn=parseColumnForKeyAndHeader] - The function to parse the column for key and header.
 *
 * @returns {Object} The constructed detail columns.
 * If subheadings in table/toolbar are desired, use grouped columns in table/toolbar. Otherwise, use ungrouped columns.
 */
export const constructDetailColumns = <
  T extends
    | GenerationsTableRow
    | TracesTableRow
    | DatasetRunItemRowData
    | DatasetRunRowData
    | PromptVersionTableRow,
>({
  detailColumnAccessors,
  showAggregateViewOnly = false,
  parseColumn = parseColumnForKeyAndHeader,
}: {
  detailColumnAccessors: string[];
  showAggregateViewOnly?: boolean;
  parseColumn?: (col: string) => {
    key: string;
    header: string;
  };
}): {
  groupedColumns: LangfuseColumnDef<T>[];
  ungroupedColumns: LangfuseColumnDef<T>[];
} => {
  const columns = detailColumnAccessors.map((col) => {
    const { accessorKey, header, size, enableHiding } = parseDetailColumn<T>(
      col,
      parseColumn,
    );

    return {
      accessorKey,
      header,
      size,
      enableHiding,
      cell: ({ row }: { row: Row<T> }) => {
        const value: QualitativeAggregate | QuantitativeAggregate | undefined =
          row.getValue(accessorKey);

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

  return {
    groupedColumns: [
      {
        accessorKey: "scores",
        header: "Individual Scores",
        columns,
        maxSize: 150,
      },
    ],
    ungroupedColumns: columns,
  };
};

// specific to prompt metrics table as it has both generation and trace scores
export const computeAccessorMetrics = (col: string) => {
  const [type, name, source, dataType] = col.split("-");
  return composeAggregateScoreKey({
    keyPrefix: type,
    name,
    source: source as ScoreSource,
    dataType: dataType as ScoreDataType,
  });
};

export const parseMetricsColumn = (col: string) => {
  const [type, name, source, dataType] = col.split("-");
  return {
    key: composeAggregateScoreKey({
      keyPrefix: type,
      name,
      source: source as ScoreSource,
      dataType: dataType as ScoreDataType,
    }),
    header: `${type}: ${getDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
  };
};
