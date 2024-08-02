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

const parseColumnForKeyAndHeader = (col: ScoreDetailColumnProps) => {
  const { key, name, source, dataType } = col;
  return {
    key,
    header: `${getDataTypeIcon(dataType)} ${name} (${source.toLowerCase()})`,
  };
};

// specific to prompt metrics table as it uses prefix to distinguish Generation and Trace metrics
export const parseMetricsColumn = (col: ScoreDetailColumnProps) => {
  const [prefix, _] = col.key.split("-");
  return {
    key: col.key,
    header: `${prefix}: ${getDataTypeIcon(col.dataType)} ${col.name} (${col.source.toLowerCase()})`,
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
  col: ScoreDetailColumnProps,
  parseColFct: (col: ScoreDetailColumnProps) => {
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

export function getDetailColumns(
  scoreColumns: ScoreDetailColumnProps[],
  scores: ScoreAggregate,
): ScoreAggregate {
  if (!Boolean(scoreColumns.length)) return {};
  let filteredScores: ScoreAggregate = {};

  for (const key in scores) {
    if (scoreColumns.some((column) => column.key === key)) {
      filteredScores[key] = scores[key];
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
  detailColumnAccessors: ScoreDetailColumnProps[];
  showAggregateViewOnly?: boolean;
  parseColumn?: (col: ScoreDetailColumnProps) => {
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
