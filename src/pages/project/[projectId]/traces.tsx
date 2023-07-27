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
import { type Score } from "@prisma/client";
import { lastCharacters } from "@/src/utils/string";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { TokenUsageBadge } from "@/src/components/token-usage-badge";

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
    trace: RouterOutput["traces"]["all"][0]
  ): TraceTableRow => {
    return {
      id: trace.id,
      externalId: trace.externalId ?? undefined,
      timestamp: trace.timestamp.toISOString(),
      name: trace.name ?? "",
      metadata: JSON.stringify(trace.metadata),
      userId: trace.userId ?? "",
      scores: trace.scores,
      usage: trace.usage,
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
          />
        );
      },
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
        const values: Score[] = row.getValue("scores");
        return (
          <div className="flex">
            <GroupedScoreBadges scores={values} />
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
    <div className="md:container">
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
