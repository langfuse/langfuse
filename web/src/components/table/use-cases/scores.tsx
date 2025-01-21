import { DataTable } from "@/src/components/table/data-table";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { Avatar, AvatarImage } from "@/src/components/ui/avatar";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { isNumericDataType } from "@/src/features/scores/lib/helpers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useTableDateRange } from "@/src/hooks/useTableDateRange";
import {
  type ScoreOptions,
  scoresTableColsWithOptions,
} from "@/src/server/api/definitions/scoresTable";
import { api } from "@/src/utils/api";

import type { RouterOutput, RouterInput } from "@/src/utils/types";
import {
  isPresent,
  type FilterState,
  type ScoreDataType,
} from "@langfuse/shared";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import TagList from "@/src/features/tag/components/TagList";
import { cn } from "@/src/utils/tailwind";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";

export type ScoresTableRow = {
  id: string;
  traceId: string;
  timestamp: string;
  source: string;
  name: string;
  dataType: ScoreDataType;
  value: string;
  author: {
    userId?: string;
    image?: string;
    name?: string;
  };
  comment?: string;
  observationId?: string;
  traceName?: string;
  userId?: string;
  jobConfigurationId?: string;
  traceTags?: string[];
};

export type ScoreFilterInput = Omit<
  RouterInput["scores"]["all"],
  "projectId" | "userId"
>;

function createFilterState(
  userFilterState: FilterState,
  omittedFilters: Record<string, string>[],
): FilterState {
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
  localStorageSuffix = "",
}: {
  projectId: string;
  userId?: string;
  traceId?: string;
  observationId?: string;
  omittedFilter?: string[];
  hiddenColumns?: string[];
  localStorageSuffix?: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage("scores", "s");
  const { selectedOption, dateRange, setDateRangeAndOption } =
    useTableDateRange(projectId);

  const [userFilterState, setUserFilterState] = useQueryFilterState(
    [],
    "scores",
    projectId,
  );

  const dateRangeFilter: FilterState = dateRange
    ? [
        {
          column: "Timestamp",
          type: "datetime",
          operator: ">=",
          value: dateRange.from,
        },
      ]
    : [];

  const combinedFilter = userFilterState.concat(dateRangeFilter);
  const filterState = createFilterState(combinedFilter, [
    ...(userId ? [{ key: "User ID", value: userId }] : []),
    ...(traceId ? [{ key: "Trace ID", value: traceId }] : []),
    ...(observationId ? [{ key: "Observation ID", value: observationId }] : []),
  ]);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "timestamp",
    order: "DESC",
  });

  const getCountPayload = {
    projectId,
    filter: filterState,
    page: 0,
    limit: 1,
    orderBy: null,
  };

  const getAllPayload = {
    ...getCountPayload,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    orderBy: orderByState,
  };

  const scores = api.scores.all.useQuery(getAllPayload);
  const totalScoreCountQuery = api.scores.countAll.useQuery(getCountPayload);
  const totalCount = totalScoreCountQuery.data?.totalCount ?? null;

  const filterOptions = api.scores.filterOptions.useQuery(
    {
      projectId,
      timestampFilter:
        dateRangeFilter[0]?.type === "datetime"
          ? dateRangeFilter[0]
          : undefined,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const rawColumns: LangfuseColumnDef<ScoresTableRow>[] = [
    {
      accessorKey: "traceId",
      id: "traceId",
      enableColumnFilter: true,
      header: "Trace",
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("traceId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/traces/${encodeURIComponent(value)}`}
              value={value}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "observationId",
      id: "observationId",
      header: "Observation",
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const observationId = row.getValue(
          "observationId",
        ) as ScoresTableRow["observationId"];
        const traceId = row.getValue("traceId") as ScoresTableRow["traceId"];
        return traceId && observationId ? (
          <TableLink
            path={`/project/${projectId}/traces/${encodeURIComponent(traceId)}?observation=${encodeURIComponent(observationId)}`}
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
      size: 150,
      cell: ({ row }) => {
        const value = row.getValue("traceName") as ScoresTableRow["traceName"];
        const filter = encodeURIComponent(
          `name;stringOptions;;any of;${value}`,
        );
        return value ? (
          <TableLink
            path={`/project/${projectId}/traces?filter=${value ? filter : ""}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "userId",
      header: "User",
      id: "userId",
      headerTooltip: {
        description: "The user ID associated with the trace.",
        href: "https://langfuse.com/docs/tracing-features/users",
      },
      enableHiding: true,
      enableSorting: true,
      size: 100,
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/users/${encodeURIComponent(value)}`}
              value={value}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
      id: "timestamp",
      enableHiding: true,
      enableSorting: true,
      size: 150,
    },
    {
      accessorKey: "source",
      header: "Source",
      id: "source",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "name",
      header: "Name",
      id: "name",
      enableHiding: true,
      enableSorting: true,
      size: 150,
    },
    {
      accessorKey: "dataType",
      header: "Data Type",
      id: "dataType",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "value",
      header: "Value",
      id: "value",
      enableHiding: true,
      enableSorting: true,
      size: 100,
    },
    {
      accessorKey: "comment",
      header: "Comment",
      id: "comment",
      enableHiding: true,
      size: 400,
      cell: ({ row }) => {
        const value = row.getValue("comment") as ScoresTableRow["comment"];
        return (
          !!value && <IOTableCell data={value} singleLine={rowHeight === "s"} />
        );
      },
    },
    {
      accessorKey: "author",
      id: "author",
      header: "Author",
      enableHiding: true,
      size: 150,
      cell: ({ row }) => {
        const { userId, name, image } = row.getValue(
          "author",
        ) as ScoresTableRow["author"];
        return (
          <div className="flex items-center space-x-2">
            <Avatar className="h-7 w-7">
              <AvatarImage
                src={image ?? undefined}
                alt={name ?? "User Avatar"}
              />
            </Avatar>
            <span>{name ?? userId}</span>
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
      enableSorting: false,
      size: 150,
      cell: ({ row }) => {
        const value = row.getValue("jobConfigurationId");
        return typeof value === "string" ? (
          <>
            <TableLink
              path={`/project/${projectId}/evals/${value}`}
              value={value}
            />
          </>
        ) : undefined;
      },
    },
    {
      accessorKey: "traceTags",
      id: "traceTags",
      header: "Trace Tags",
      size: 250,
      enableHiding: true,
      defaultHidden: true,
      cell: ({ row }) => {
        const traceTags: string[] | undefined = row.getValue("traceTags");
        return (
          traceTags && (
            <div
              className={cn(
                "flex gap-x-2 gap-y-1",
                rowHeight !== "s" && "flex-wrap",
              )}
            >
              <TagList selectedTags={traceTags} isLoading={false} viewOnly />
            </div>
          )
        );
      },
    },
  ];

  const columns = rawColumns.filter(
    (c) => !!c.id && !hiddenColumns.includes(c.id),
  );

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoresTableRow>(
      "scoresColumnVisibility" + localStorageSuffix,
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ScoresTableRow>(
    `scoresColumnOrder${localStorageSuffix}`,
    columns,
  );

  const convertToTableRow = (
    score: RouterOutput["scores"]["all"]["scores"][0],
  ): ScoresTableRow => {
    return {
      id: score.id,
      timestamp: score.timestamp.toLocaleString(),
      source: score.source,
      name: score.name,
      dataType: score.dataType,
      value:
        isNumericDataType(score.dataType) && isPresent(score.value)
          ? score.value % 1 === 0
            ? String(score.value)
            : score.value.toFixed(4)
          : (score.stringValue ?? ""),
      author: {
        userId: score.authorUserId ?? undefined,
        image: score.authorUserImage ?? undefined,
        name: score.authorUserName ?? undefined,
      },
      comment: score.comment ?? undefined,
      observationId: score.observationId ?? undefined,
      traceId: score.traceId,
      traceName: score.traceName ?? undefined,
      userId: score.traceUserId ?? undefined,
      jobConfigurationId: score.jobConfigurationId ?? undefined,
      traceTags: score.traceTags ?? undefined,
    };
  };

  const transformFilterOptions = (
    traceFilterOptions: ScoreOptions | undefined,
  ) => {
    return scoresTableColsWithOptions(traceFilterOptions).filter(
      (c) => !omittedFilter?.includes(c.name) && !hiddenColumns.includes(c.id),
    );
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={transformFilterOptions(filterOptions.data)}
        filterState={userFilterState}
        setFilterState={useDebounce(setUserFilterState)}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        selectedOption={selectedOption}
        setDateRangeAndOption={setDateRangeAndOption}
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
          totalCount,
          onChange: setPaginationState,
          state: paginationState,
        }}
        orderBy={orderByState}
        setOrderBy={setOrderByState}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        columnOrder={columnOrder}
        onColumnOrderChange={setColumnOrder}
        rowHeight={rowHeight}
      />
    </>
  );
}
