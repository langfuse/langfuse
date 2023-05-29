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

export type Option = { label: string; value: string; icon?: LucideIcon };

export type TraceRowOptions = {
  names: Option[];
  statuses: Option[];
  ids: Option[];
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
  ): TraceRowOptions => {
    console.log(options);
    return {
      names: options.names.map((n) => {
        return { label: n.name, value: n._count.toString() };
      }),
      statuses: options.statuses.map((n) => {
        return { label: n.status, value: n._count.toString() };
      }),
      ids: options.ids.map((n) => {
        return { label: n.id, value: n._count.toString() };
      }),
    };
  };

  return (
    <div className="container mx-auto py-10">
      {options.isLoading ||
      !options.data ||
      traces.isLoading ||
      !traces.data ? (
        <div className="flex h-[150px] flex-col items-center justify-center text-sm font-light uppercase text-neutral-500">
          Loading...
        </div>
      ) : traces.data.length === 0 ? (
        <div className="flex h-[150px] flex-col items-center justify-center text-sm font-light uppercase text-neutral-500">
          No traces to show
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={traces.data?.map((t) => convertToTableRow(t))}
          options={convertToOptions(options.data)}
          queryOptions={queryOptions}
          updateQueryOptions={updateQueryOptions}
        />
      )}
    </div>
  );
}
