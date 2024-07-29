import {
  GroupedScoreBadges,
  QualitativeScoreBadge,
} from "@/src/components/grouped-score-badge";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type GenerationsTableRow } from "@/src/components/table/use-cases/generations";
import { type TracesTableRow } from "@/src/components/table/use-cases/traces";
import { type DatasetRunItemRowData } from "@/src/features/datasets/components/DatasetRunsTable";
import { type APIScore } from "@/src/features/public-api/types/scores";
import { type Row } from "@tanstack/react-table";
import { Binary, CaseUpper, Hash } from "lucide-react";
import React from "react";

const parseColumnForProps = (col: string) => {
  const [name, source, dataType] = col.split(".");
  return { name, source, dataType };
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

const parseColumnForKeyAndHeader = (col: string) => {
  const { name, source, dataType } = parseColumnForProps(col);
  return {
    key: `${name} (${source.toLowerCase()}, ${dataType.toLowerCase()})`,
    header: () => (
      <div className="flex flex-row items-center gap-1">
        <span>{`${name} (${source.toLowerCase()})`}</span>
        <DataTypeIcon dataType={dataType} />
      </div>
    ),
  };
};

const parseColumnForKeyAndHeaderMetrics = (col: string) => {
  const { name, dataType } = parseColumnForProps(col);
  return {
    key: `${name} (${dataType.toLowerCase()})`,
    header: () => (
      <div className="flex flex-row items-center gap-1">
        <span>{name}</span>
        <DataTypeIcon dataType={dataType} />
      </div>
    ),
  };
};

const parseDetailColumn = <
  T extends TracesTableRow | GenerationsTableRow | DatasetRunItemRowData,
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

export function getDetailColumns(
  scoreColumns: string[] | undefined,
  scores: APIScore[],
): Record<string, APIScore[]> {
  return (
    scoreColumns?.reduce(
      (acc, col) => {
        const { key } = parseColumnForKeyAndHeader(col);
        const { name, source, dataType } = parseColumnForProps(col);
        acc[key] = scores.filter(
          (score) =>
            score.name === name &&
            score.source === source &&
            score.dataType === dataType,
        );
        return acc;
      },
      {} as Record<string, APIScore[]>,
    ) ?? {}
  );
}

export const constructDefaultColumns = <
  T extends GenerationsTableRow | TracesTableRow,
>(
  detailColumnAccessors: string[],
): LangfuseColumnDef<T>[] => {
  return detailColumnAccessors.map((col) => {
    const detailColumnProps = parseDetailColumn<T>(
      col,
      parseColumnForKeyAndHeader,
    );
    return {
      ...detailColumnProps,
      cell: ({ row }: { row: Row<T> }) => {
        const values: APIScore[] | undefined = row.getValue(
          detailColumnProps.accessorKey,
        );
        return (
          values && (
            <GroupedScoreBadges
              scores={values}
              variant="headings"
              showScoreNameHeading={false}
            />
          )
        );
      },
    };
  });
};

export const getDetailMetricsColumns = (
  scoreColumns: string[] | undefined,
  avgNumericScores: DatasetRunItemRowData["scores"]["numeric"],
  qualitativeScoreDistribution: DatasetRunItemRowData["scores"]["qualitative"],
) => {
  return (
    scoreColumns?.reduce(
      (acc, col) => {
        const { key } = parseColumnForKeyAndHeaderMetrics(col);
        const { name, dataType } = parseColumnForProps(col);
        if (dataType === "NUMERIC") {
          acc[key] = avgNumericScores[name];
        } else {
          acc[key] = qualitativeScoreDistribution[name];
        }
        return acc;
      },
      {} as
        | DatasetRunItemRowData["scores"]["numeric"]
        | DatasetRunItemRowData["scores"]["qualitative"],
    ) ?? {}
  );
};

export const constructDefaultMetricsColumns = <T extends DatasetRunItemRowData>(
  detailColumnAccessors: string[],
): LangfuseColumnDef<T>[] => {
  return detailColumnAccessors.map((col) => {
    const detailColumnProps = parseDetailColumn<T>(
      col,
      parseColumnForKeyAndHeaderMetrics,
    );
    return {
      ...detailColumnProps,
      cell: ({ row }: { row: Row<T> }) => {
        const record:
          | DatasetRunItemRowData["scores"]["numeric"][number]
          | DatasetRunItemRowData["scores"]["qualitative"][number]
          | undefined = row.getValue(detailColumnProps.accessorKey);

        if (!record) {
          return null;
        }

        if (typeof record === "number") {
          return (
            <div className="flex max-w-xl flex-row items-start gap-3 overflow-y-auto">
              {`Ø ${record.toFixed(2)}`}
            </div>
          );
        }

        return (
          <div className="flex h-8 max-w-xl flex-row items-start gap-3 overflow-y-auto">
            <QualitativeScoreBadge
              scores={{ [detailColumnProps.accessorKey]: record }}
              showScoreNameHeading={false}
            />
          </div>
        );
      },
    };
  });
};
