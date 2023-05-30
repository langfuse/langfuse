import React, { useState } from "react";
import { api } from "../utils/api";
import { type RouterOutput, type RouterInput } from "../utils/types";
import { DataTable } from "../components/data-table";
import { columns } from "./columns";
import { type Trace, type Score } from "@prisma/client";
import { type LucideIcon } from "lucide-react";

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
  options: { label: string; value: string; icon?: LucideIcon }[];
};

export default function Traces() {
  const [queryOptions, setQueryOptions] = useState<TraceFilterInput>({
    attributes: {},
    names: null,
    ids: null,
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
          return { label: o.key, value: o.count.toString() };
        }),
      };
    });
  };

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
