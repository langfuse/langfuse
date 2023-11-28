import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { scoresTableColsWithOptions } from "@/src/server/api/definitions/scoresTable";
import { api } from "@/src/utils/api";
import { type RouterInput } from "@/src/utils/types";
import { type Score } from "@prisma/client";
import { type VisibilityState, type ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type ScoresTableRow = {
  id: string;
  traceId: string;
  timestamp: string;
  name: string;
  value: number;
  comment?: string;
  observationId?: string;
};

export type ScoreFilterInput = Omit<
  RouterInput["scores"]["all"],
  "projectId" | "userId"
>;

export default function ScoresTable({
  projectId,
  userId,
}: {
  projectId: string;
  userId?: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      const savedVisibility = localStorage.getItem("scoresColumnVisibility");
      return savedVisibility
        ? (JSON.parse(savedVisibility) as VisibilityState)
        : {};
    },
  );

  const [userFilterState, setUserFilterState] = useQueryFilterState([]);
  const filterState = userId
    ? userFilterState.concat([
        {
          column: "userId",
          type: "string",
          operator: "=",
          value: userId,
        },
      ])
    : userFilterState;

  const scores = api.scores.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
  });
  const totalCount = scores.data?.slice(1)[0]?.totalCount ?? 0;

  const filterOptions = api.scores.filterOptions.useQuery({
    projectId,
  });

  const columns: ColumnDef<ScoresTableRow>[] = [
    {
      accessorKey: "traceId",
      enableColumnFilter: true,
      header: "Trace ID",
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/traces/${value}`}
              value={value}
            />
          </>
        ) : undefined;
      },
      enableHiding: true,
    },
    {
      accessorKey: "observationId",
      header: "Observation ID",
      cell: ({ row }) => {
        const observationId = row.getValue("observationId");
        const traceId = row.getValue("traceId");
        return typeof observationId === "string" &&
          typeof traceId === "string" ? (
          <TableLink
            path={`/project/${projectId}/traces/${traceId}?observation=${observationId}`}
            value={observationId}
          />
        ) : null;
      },
      enableHiding: true,
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      enableHiding: true,
    },
    {
      accessorKey: "name",
      header: "Name",
      enableHiding: true,
    },
    {
      accessorKey: "value",
      header: "Value",
      enableHiding: true,
    },
    {
      accessorKey: "comment",
      header: "Comment",
      enableHiding: true,
    },
  ];

  useEffect(() => {
    const localStorageItem = localStorage.getItem("scoresColumnVisibility");

    if (!localStorageItem || localStorageItem === "{}") {
      const initialVisibility: VisibilityState = {};
      columns.forEach((column) => {
        if ("accessorKey" in column) {
          initialVisibility[column.accessorKey] = true;
        }
      });
      setColumnVisibility(initialVisibility);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "scoresColumnVisibility",
      JSON.stringify(columnVisibility),
    );
  }, [columnVisibility]);

  const convertToTableRow = (score: Score): ScoresTableRow => {
    return {
      id: score.id,
      timestamp: score.timestamp.toLocaleString(),
      name: score.name,
      value: score.value,
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      traceId: score.traceId,
    };
  };

  return (
    <div>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={scoresTableColsWithOptions(filterOptions.data)}
        filterState={userFilterState}
        setFilterState={setUserFilterState}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
      />
      <DataTable
        columns={columns}
        data={
          scores.isLoading
            ? { isLoading: true, isError: false }
            : scores.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: scores.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: scores.data?.map((t) => convertToTableRow(t)),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </div>
  );
}
