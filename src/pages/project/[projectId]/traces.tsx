import React, { useState } from "react";
import { api } from "@/src/utils/api";
import { type RouterOutput, type RouterInput } from "@/src/utils/types";
import { DataTable } from "@/src/components/table/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import Header from "@/src/components/layouts/header";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { useRouter } from "next/router";
import { type TableRowOptions } from "@/src/components/table/types";
import {
  type SelectedScoreFilter,
  type ScoreFilter,
} from "@/src/utils/tanstack";
import { type Trace, type Score } from "@prisma/client";
import { lastCharacters } from "@/src/utils/string";

export type TableScore = {
  id: string;
  name: string;
  value: number;
};

export type TraceTableRow = {
  id: string;
  externalId?: string;
  timestamp: string;
  name: string;
  userId: string;
  metadata?: string;
  scores: TableScore[];
};

export type TraceFilterInput = Omit<RouterInput["traces"]["all"], "projectId">;

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const [queryOptions, setQueryOptions] = useState<TraceFilterInput>({
    scores: null,
    name: null,
    searchQuery: null,
  });

  const [selectedScore, setSelectedScores] = useState<SelectedScoreFilter>({
    name: null,
    value: null,
    operator: null,
  });

  const traces = api.traces.all.useQuery({
    ...queryOptions,
    projectId,
  });

  const options = api.traces.availableFilterOptions.useQuery({
    ...queryOptions,
    projectId,
  });

  const convertToTableRow = (
    trace: Trace & { scores: Score[] }
  ): TraceTableRow => {
    return {
      id: trace.id,
      externalId: trace.externalId ?? undefined,
      timestamp: trace.timestamp.toISOString(),
      name: trace.name ?? "",
      metadata: JSON.stringify(trace.metadata),
      userId: trace.userId ?? "",
      scores: trace.scores.map((score) => {
        return {
          name: score.name,
          value: score.value,
          id: score.id,
        };
      }),
    };
  };

  const convertToOptions = (
    options: RouterOutput["traces"]["availableFilterOptions"]
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
      cell: ({ row }) => {
        const value = row.getValue("id");
        return typeof value === "string" ? (
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
      enableColumnFilter: true,
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
      header: "User ID",
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
    },
    {
      accessorKey: "scores",
      header: "Scores",
      enableColumnFilter: true,
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
        const values: TableScore[] = row.getValue("scores");
        return (
          <div className="flex flex-col gap-2">
            {values.map((value) => (
              <div
                key={value.id}
                className="relative flex-row items-center rounded-lg border border-gray-300 shadow-sm"
              >
                <div className="min-w-1 flex flex-1 items-center gap-2 p-2">
                  {/* <span className="absolute inset-0" aria-hidden="true" /> */}
                  <p className=" text-xs font-medium text-gray-900">
                    {value.name}
                  </p>
                  <p className="inline-flex items-baseline rounded-full bg-gray-100 px-2.5 py-0.5 text-lg font-medium text-gray-500 md:mt-2 lg:mt-0">
                    {value.value}
                  </p>
                </div>
              </div>
            ))}
          </div>
        );
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
    queryOptions.name !== null || queryOptions.scores !== null;

  const resetFilters = () => {
    setQueryOptions({
      scores: null,
      name: null,
      searchQuery: null,
    });
    setSelectedScores({
      name: null,
      value: null,
      operator: null,
    });
  };

  const updateSearchQuery = (searchQuery: string) => {
    setQueryOptions({ ...queryOptions, searchQuery });
  };

  return (
    <div className="container">
      <Header title="Traces" />
      {tableOptions.data ? (
        <DataTableToolbar
          columnDefs={columns}
          options={tableOptions.data}
          searchConfig={{
            placeholder: "Search traces (ID, External ID, Name, User ID)",
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
      />
    </div>
  );
}
