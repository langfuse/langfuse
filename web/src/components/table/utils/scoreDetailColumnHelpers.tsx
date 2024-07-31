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
import { Binary, CaseUpper, Hash } from "lucide-react";
import React from "react";

const parseColumnForProps = (col: string) => {
  const [name, source, dataType] = col.split(".");
  return {
    name,
    source: source as ScoreSource,
    dataType: dataType as ScoreDataType,
  };
};

const DataTypeIcon = ({ dataType }: { dataType: string }) => {
  switch (dataType) {
    case "NUMERIC":
    default:
      return <Hash className="h-3 w-3"></Hash>;
    case "CATEGORICAL":
      return <CaseUpper className="h-3 w-3"></CaseUpper>;
    case "BOOLEAN":
      return <Binary className="h-3 w-3"></Binary>;
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
}) => `${name} (${source.toLowerCase()}, ${dataType.toLowerCase()})`;

const parseColumnForKeyAndHeader = (col: string) => {
  const { name, source, dataType } = parseColumnForProps(col);
  return {
    key: computeTableKey({ name, source, dataType }),
    header: () => (
      <div className="flex flex-row items-center gap-1">
        <span>{`${name} (${source.toLowerCase()})`}</span>
        <DataTypeIcon dataType={dataType} />
      </div>
    ),
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
    header: () => JSX.Element;
  },
): LangfuseColumnDef<T> => {
  const { key, header } = parseColFct(col);
  return {
    header,
    id: key,
    accessorKey: key,
    enableHiding: true,
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
    header: () => JSX.Element;
  };
}): LangfuseColumnDef<T>[] => {
  return detailColumnAccessors.map((col) => {
    const detailColumnProps = parseDetailColumn<T>(col, parseColumn);
    return {
      ...detailColumnProps,
      cell: ({ row }: { row: Row<T> }) => {
        const value: QualitativeAggregate | QuantitativeAggregate | undefined =
          row.getValue(detailColumnProps.accessorKey);

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
