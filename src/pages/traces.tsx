import React, { useState } from "react";
import { api } from "../utils/api";
import { type RouterOutput, type RouterInput } from "../utils/types";
import { DataTable } from "../components/data-table";
import { type Trace, type Score } from "@prisma/client";
import { type LucideIcon } from "lucide-react";
import { lastCharacters } from "../utils/string";
import { useRouter } from "next/router";
import { type ColumnDef } from "@tanstack/react-table";

export type TraceTableRow = {
  id: string;
  timestamp: Date;
  name: string;
  status: string;
  statusMessage?: string;
  attributes?: string;
  scores: string;
};

export type TraceFilterInput = RouterInput["traces"]["all"];

export type TraceRowOptions = {
  columnId: string;
  options: { label: string; value: number; icon?: LucideIcon }[];
};

export default function Traces() {
  const router = useRouter();

  const [queryOptions, setQueryOptions] = useState<TraceFilterInput>({
    attribute: {},
    name: [],
    id: [],
    status: [],
  });

  const updateQueryOptions = (options: TraceFilterInput) => {
    setQueryOptions(options);
  };

  // {
  //   refetchInterval: 2000,
  // }

  const traces = api.traces.all.useQuery(queryOptions);

  const options = api.traces.availableFilterOptions.useQuery(queryOptions);

  const convertToTableRow = (
    trace: Trace & { scores: Score[] }
  ): TraceTableRow => {
    return {
      id: trace.id,
      timestamp: trace.timestamp,
      name: trace.name,
      status: trace.status,
      statusMessage: trace.statusMessage ?? undefined,
      attributes: JSON.stringify(trace.attributes),
      scores: trace.scores
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-member-access
        .map((score) => `${score.name}: ${score.value}`)
        .join("; "),
    };
  };

  const convertToOptions = (
    options: RouterOutput["traces"]["availableFilterOptions"]
  ): TraceRowOptions[] => {
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
        return (
          <div>
            <button
              key="openTrace"
              className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-blue-600 shadow-sm hover:bg-indigo-100"
              onClick={() => void router.push(`/traces/${row.getValue("id")}`)}
            >
              ...{lastCharacters(row.getValue("id"), 7)}
            </button>
          </div>
        );
      },
      enableColumnFilter: true,
      meta: {
        label: "Id",
        updateFunction: (newValues: string[] | null) => {
          updateQueryOptions({ ...queryOptions, id: newValues });
        },
        filter: queryOptions.id,
      },
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
        updateFunction: (newValues: string[] | null) => {
          updateQueryOptions({ ...queryOptions, name: newValues });
        },
        filter: queryOptions.name,
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      enableColumnFilter: true,
      meta: {
        label: "Status",
        updateFunction: (newValues: string[] | null) => {
          updateQueryOptions({ ...queryOptions, status: newValues });
        },
        filter: queryOptions.status,
      },
    },
    {
      accessorKey: "statusMessage",
      header: "Status Message",
    },
    {
      accessorKey: "attributes",
      header: "Attributes",
    },
    {
      accessorKey: "scores",
      header: "Scores",
    },
  ];

  return (
    <div className="container mx-auto py-10">
      <DataTable
        columns={columns}
        data={
          traces.isLoading
            ? { isLoading: true, isError: false }
            : traces.isError
            ? { isLoading: false, isError: true, error: traces.error.message }
            : {
                isLoading: false,
                isError: false,
                data: traces.data?.map((t) => convertToTableRow(t)),
              }
        }
        options={
          options.isLoading
            ? { isLoading: true, isError: false }
            : options.isError
            ? { isLoading: false, isError: true, error: options.error.message }
            : {
                isLoading: false,
                isError: false,
                data: convertToOptions(options.data),
              }
        }
        queryOptions={queryOptions}
        updateQueryOptions={updateQueryOptions}
      />
    </div>
  );
}
