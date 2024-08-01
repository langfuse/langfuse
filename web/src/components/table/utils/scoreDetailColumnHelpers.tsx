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

const parseColumnForProps = (col: string) => {
  const [name, source, dataType] = col.split(".");
  return {
    name,
    source: source as ScoreSource,
    dataType: dataType as ScoreDataType,
  };
};

const getDataTypeIcon = ({ dataType }: { dataType: string }): string => {
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

const computeTableKey = ({
  name,
  source,
  dataType,
}: {
  name: string;
  source: ScoreSource;
  dataType: ScoreDataType;
}) => `${name}-${source.toLowerCase()}-${dataType.toLowerCase()}`;

const parseColumnForKeyAndHeader = (col: string) => {
  const { name, source, dataType } = parseColumnForProps(col);
  return {
    key: computeTableKey({ name, source, dataType }),
    header: `${getDataTypeIcon({ dataType })} ${name} (${source.toLowerCase()})`,
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
  return computeTableKey({ name, source, dataType });
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
 * Constructs columns for a table that display scores as individual columns.
 *
 * @param {string[]} params.detailColumnAccessors - The accessors for the detail columns.
 * @param {boolean} [params.showAggregateViewOnly=false] - Whether to only show the aggregate view.
 * @param {Function} [params.parseColumn=parseColumnForKeyAndHeader] - The function to parse the column.
 *
 * @returns {Object} The constructed detail columns, including grouped columns for the toolbar and ungrouped columns for the table.
 * `groupedColumnsForToolbar` could be displayed in table but cause unwanted subheadings
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
  groupedColumnsForToolbar: LangfuseColumnDef<T>[];
  ungroupedColumnsForTable: LangfuseColumnDef<T>[];
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
    groupedColumnsForToolbar: [
      {
        accessorKey: "scores",
        header: "Score Details",
        columns,
        maxSize: 150,
      },
    ],
    ungroupedColumnsForTable: columns,
  };
};
