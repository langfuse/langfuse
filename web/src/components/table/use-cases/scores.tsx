import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/src/components/ui/avatar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import {
  type ScoreOptions,
  scoresTableColsWithOptions,
} from "@/src/server/api/definitions/scoresTable";
import { api } from "@/src/utils/api";
import type { RouterOutput, RouterInput } from "@/src/utils/types";
import { type FilterState } from "@langfuse/shared";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type ScoresTableRow = {
  id: string;
  traceId: string;
  timestamp: string;
  source: string;
  name: string;
  value: number;
  comment?: string;
  observationId?: string;
  traceName?: string;
  userId?: string;
  jobConfigurationId?: string;
  user: {
    image?: string;
    name?: string;
  };
};

export type ScoreFilterInput = Omit<
  RouterInput["scores"]["all"],
  "projectId" | "userId"
>;

function createFilterState(
  userFilterState: FilterState,
  omittedFilters: Record<string, string>[],
) {
  return omittedFilters.reduce((filterState, { key, value }) => {
    return filterState.concat([
      {
        column: `${key}`,
        type: "string",
        operator: "=",
        value: value,
      },
    ]);
  }, userFilterState);
}

export default function ScoresTable({
  projectId,
  userId,
  traceId,
  observationId,
  omittedFilter = [],
  hiddenColumns = [],
}: {
  projectId: string;
  userId?: string;
  traceId?: string;
  observationId?: string;
  omittedFilter?: string[];
  hiddenColumns?: string[];
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("scores", "s");

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "scores",
  );

  const filterState = createFilterState(userFilterState, [
    ...(userId ? [{ key: "User ID", value: userId }] : []),
    ...(traceId ? [{ key: "Trace ID", value: traceId }] : []),
    ...(observationId ? [{ key: "Observation ID", value: observationId }] : []),
  ]);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const scores = api.scores.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    orderBy: orderByState,
  });
  const totalCount = scores.data?.totalCount ?? 0;

  const filterOptions = api.scores.filterOptions.useQuery({
    projectId,
  });

  const rawColumns: LangfuseColumnDef<ScoresTableRow>[] = [
    {
      accessorKey: "traceId",
      id: "traceId",
      enableColumnFilter: true,
      header: "Trace ID",
      enableSorting: true,
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
    },
    {
      accessorKey: "observationId",
      id: "observationId",
      header: "Observation ID",
      enableSorting: true,
      cell: ({ row }) => {
        const observationId = row.getValue(
          "observationId",
        ) as ScoresTableRow["observationId"];
        const traceId = row.getValue("traceId") as ScoresTableRow["traceId"];
        return traceId && observationId ? (
          <TableLink
            path={`/project/${projectId}/traces/${traceId}?observation=${observationId}`}
            value={observationId}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "traceName",
      header: "Trace Name",
      id: "traceName",
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.getValue("traceName") as ScoresTableRow["traceName"];
        const filter = encodeURIComponent(
          `name;stringOptions;;any of;${value}`,
        );
        return value ? (
          <TableLink
            path={`/project/${projectId}/traces?filter=${value ? filter : ""}`}
            value={value}
            truncateAt={40}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "source",
      header: "Source",
      id: "source",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "value",
      header: "Value",
      id: "value",
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value: number = row.getValue("value");
        return value % 1 === 0 ? value : value.toFixed(4);
      },
    },
    {
      accessorKey: "userId",
      header: "User ID",
      id: "userId",
      headerTooltip: {
        description: "The user ID associated with the trace.",
        href: "https://langfuse.com/docs/tracing-features/users",
      },
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/users/${value}`}
              value={value}
              truncateAt={40}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "user",
      id: "user",
      header: "User Name",
      headerTooltip: {
        description: "The name of the user associated with the trace.",
      },
      cell: ({ row }) => {
        const { name, image } = row.getValue("user") as ScoresTableRow["user"];
        if (!name) return null;

        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={image ?? undefined}
                alt={name ?? "User Avatar"}
              />
              <AvatarFallback>
                {name
                  ? name
                      .split(" ")
                      .map((word) => word[0])
                      .slice(0, 2)
                      .concat("")
                  : null}
              </AvatarFallback>
            </Avatar>
            <span>{name}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "jobConfigurationId",
      header: "Eval Configuration ID",
      id: "jobConfigurationId",
      headerTooltip: {
        description: "The Job Configuration ID associated with the trace.",
        href: "https://langfuse.com/docs/scores/model-based-evals",
      },
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.getValue("jobConfigurationId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/evals/configs/${value}`}
              value={value}
              truncateAt={40}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "comment",
      header: "Comment",
      id: "comment",
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.getValue("comment") as ScoresTableRow["comment"];
        return (
          !!value && <IOTableCell data={value} singleLine={rowHeight === "s"} />
        );
      },
    },
  ];

  const columns = rawColumns.filter(
    (c) => !!c.id && !hiddenColumns.includes(c.id),
  );

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoresTableRow>("scoresColumnVisibility", columns);

  const convertToTableRow = (
    score: RouterOutput["scores"]["all"]["scores"][0],
  ): ScoresTableRow => {
    return {
      id: score.id,
      timestamp: score.timestamp.toLocaleString(),
      source: score.source,
      name: score.name,
      value: score.value,
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      traceId: score.traceId,
      traceName: score.traceName ?? undefined,
      userId: score.userId ?? undefined,
      jobConfigurationId: score.jobConfigurationId ?? undefined,
      user: {
        image: score.userImage ?? undefined,
        name: score.userName ?? undefined,
      },
    };
  };

  const transformFilterOptions = (
    traceFilterOptions: ScoreOptions | undefined,
  ) => {
    return scoresTableColsWithOptions(traceFilterOptions).filter(
      (c) => !omittedFilter?.includes(c.name),
    );
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={transformFilterOptions(filterOptions.data)}
        filterState={userFilterState}
        setFilterState={setUserFilterState}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
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
                  data: scores.data.scores.map((t) => convertToTableRow(t)),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        orderBy={orderByState}
        setOrderBy={setOrderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        rowHeight={rowHeight}
      />
    </>
  );
}
