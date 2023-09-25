import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type TableRowOptions } from "@/src/components/table/types";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";
import { api } from "@/src/utils/api";
import { lastCharacters } from "@/src/utils/string";
import {
  type SelectedScoreFilter,
  type ScoreFilter,
  type KeyValue,
} from "@/src/utils/tanstack";
import { type RouterInput, type RouterOutput } from "@/src/utils/types";
import { type Score } from "@prisma/client";
import { type ColumnDef } from "@tanstack/react-table";
import router from "next/router";
import { useState } from "react";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";

export type TraceTableRow = {
  id: string;
  externalId?: string;
  timestamp: string;
  name: string;
  userId: string;
  metadata?: string;
  scores: Score[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type TraceTableProps = {
  projectId: string;
  userId?: string;
  omittedFilter?: string[];
};

export type TraceFilterInput = Omit<RouterInput["traces"]["all"], "projectId">;

export default function TracesTable({
  projectId,
  userId,
  omittedFilter = [],
}: TraceTableProps) {
  const filters = router.query.filter
    ? (JSON.parse(
        decodeURIComponent(router.query.filter as string),
      ) as TraceFilterInput)
    : {
        scores: null,
        name: null,
        userId: userId ? [userId] : null,
        searchQuery: null,
        metadata: null,
      };

  const [queryOptions, setQuery] = useState<TraceFilterInput>(filters);

  const setQueryOptions = (filter?: TraceFilterInput) => {
    filter ? setQuery(filter) : undefined;
    setFilterInParams(filter);
    setPaginationState({ pageIndex: 0, pageSize: paginationState.pageSize });
  };

  const [selectedScore, setSelectedScores] = useState<SelectedScoreFilter>({
    name: null,
    value: null,
    operator: null,
  });

  const [selectedMetadata, setSelectedMetadata] = useState<KeyValue[]>([]);

  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const traces = api.traces.all.useQuery({
    ...queryOptions,
    ...paginationState,
    projectId,
  });
  const totalCount = traces.data?.slice(1)[0]?.totalCount ?? 0;

  const options = api.traces.availableFilterOptions.useQuery({
    ...queryOptions,
    projectId: projectId,
  });

  const setFilterInParams = (filter?: TraceFilterInput) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { ...query } = router.query;
    void router.push({
      pathname: router.pathname,
      query: {
        ...query,
        ...(filter
          ? { filter: encodeURIComponent(JSON.stringify(filter)) }
          : {}),
      },
    });
  };

  const convertToTableRow = (
    trace: RouterOutput["traces"]["all"][0],
  ): TraceTableRow => {
    return {
      id: trace.id,
      externalId: trace.externalId ?? undefined,
      timestamp: trace.timestamp.toLocaleString(),
      name: trace.name ?? "",
      metadata: JSON.stringify(trace.metadata),
      userId: trace.userId ?? "",
      scores: trace.scores,
      usage: {
        promptTokens: trace.promptTokens,
        completionTokens: trace.completionTokens,
        totalTokens: trace.totalTokens,
      },
    };
  };

  const convertToOptions = (
    options: RouterOutput["traces"]["availableFilterOptions"],
  ): TableRowOptions[] => {
    return options.map((o) => {
      return {
        columnId: o.key,
        options: o.occurrences.map((o) => {
          return { label: o.key, value: o.count._all };
        }),
      };
    });
  };

  const columns: ColumnDef<TraceTableRow>[] = [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const value = row.getValue("id");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/traces/${value}`}
            value={value}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "externalId",
      header: "External ID",
      cell: ({ row }) =>
        row.getValue("externalId") ? (
          <span>...{lastCharacters(row.getValue("externalId"), 7)}</span>
        ) : (
          <span></span>
        ),
    },
    {
      accessorKey: "timestamp",
      header: "Timestamp",
    },
    {
      accessorKey: "name",
      header: "Name",
      enableColumnFilter: !omittedFilter.find((f) => f === "name"),
      meta: {
        label: "Name",
        filter: {
          type: "select",
          values: queryOptions.name,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({ ...queryOptions, name: newValues });
          },
        },
      },
    },
    {
      accessorKey: "userId",
      enableColumnFilter: !omittedFilter.find((f) => f === "userId"),
      header: "User ID",
      meta: {
        label: "userId",
        filter: {
          type: "select",
          values: queryOptions.userId,
          updateFunction: (newValues: string[] | null) => {
            setQueryOptions({
              ...queryOptions,
              userId: newValues,
            });
          },
        },
      },
      cell: ({ row }) => {
        const value = row.getValue("userId");
        return value && typeof value === "string" ? (
          <TableLink
            path={`/project/${projectId}/users/${value}`}
            value={value}
            truncateAt={40}
          />
        ) : undefined;
      },
    },
    {
      accessorKey: "usage",
      header: "Usage",
      cell: ({ row }) => {
        const value: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        } = row.getValue("usage");
        return (
          <TokenUsageBadge
            promptTokens={value.promptTokens}
            completionTokens={value.completionTokens}
            totalTokens={value.totalTokens}
            inline
          />
        );
      },
    },
    {
      accessorKey: "scores",
      header: "Scores",
      enableColumnFilter: !omittedFilter.find((f) => f === "scores"),
      meta: {
        label: "Scores",
        filter: {
          type: "number-comparison",
          values: queryOptions.scores,
          selectedValues: selectedScore,
          updateSelectedScores: setSelectedScores,
          updateFunction: (newValues: ScoreFilter | null) => {
            setQueryOptions({
              ...queryOptions,
              scores: newValues,
            });
          },
        },
      },
      cell: ({ row }) => {
        const values: Score[] = row.getValue("scores");
        return (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <GroupedScoreBadges scores={values} inline />
          </div>
        );
      },
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      enableColumnFilter: !omittedFilter.find((f) => f === "metadata"),
      meta: {
        label: "Metadata",
        filter: {
          type: "key-value",
          values: queryOptions.metadata,
          removeSelectedValue: (value: KeyValue) => {
            const newValues = selectedMetadata.filter(
              (v) => v.key !== value.key && v.value !== value.value,
            );
            setQueryOptions({
              ...queryOptions,
              metadata: newValues,
            });
            setSelectedMetadata(newValues);
          },
          updateFunction: (newValue: KeyValue | null) => {
            const mergedValues = newValue
              ? selectedMetadata.filter(
                  (v) => v.key === newValue.key && v.value === newValue.value,
                ).length > 0
                ? selectedMetadata
                : selectedMetadata.concat(newValue)
              : [];
            console.log("mergedValues", mergedValues);
            setQueryOptions({
              ...queryOptions,
              metadata: mergedValues,
            });
            setSelectedMetadata(mergedValues);
          },
        },
      },
      cell: ({ row }) => {
        const values: string = row.getValue("metadata");
        return <div className="flex flex-wrap gap-x-3 gap-y-1">{values}</div>;
      },
    },
  ];

  const tableOptions = options.isLoading
    ? { isLoading: true, isError: false }
    : options.isError
    ? {
        isLoading: false,
        isError: true,
        error: options.error.message,
      }
    : {
        isLoading: false,
        isError: false,
        data: convertToOptions(options.data),
      };

  const isFiltered = () =>
    Object.entries(queryOptions).filter(([_k, v]) => v !== null).length > 0;

  const resetFilters = () => {
    setQueryOptions({
      scores: null,
      name: null,
      userId: null,
      searchQuery: null,
      metadata: null,
    });
    setSelectedScores({
      name: null,
      value: null,
      operator: null,
    });
    setSelectedMetadata([]);
  };

  const updateSearchQuery = (searchQuery: string) => {
    setQueryOptions({ ...queryOptions, searchQuery });
  };

  return (
    <div>
      {tableOptions.data ? (
        <DataTableToolbar
          columnDefs={columns}
          options={tableOptions.data}
          searchConfig={{
            placeholder: "Search by id, name, user id",
            updateQuery: updateSearchQuery,
            currentQuery: queryOptions.searchQuery ?? undefined,
          }}
          resetFilters={resetFilters}
          isFiltered={isFiltered}
        />
      ) : undefined}
      <DataTable
        columns={columns}
        data={
          traces.isLoading
            ? { isLoading: true, isError: false }
            : traces.isError
            ? {
                isLoading: false,
                isError: true,
                error: traces.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: traces.data?.map((t) => convertToTableRow(t)),
              }
        }
        options={tableOptions}
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}
