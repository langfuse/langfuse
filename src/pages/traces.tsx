import React, { useState } from "react";
import { api } from "../utils/api";
import { type RouterInput } from "../utils/types";
import { DataTable } from "../components/data-table";
import { columns } from "./columns";
import { type Trace, type Score } from "@prisma/client";
import { AccessibilityIcon, type LucideIcon } from "lucide-react";

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
  name: Option[];
  status: Option[];
  id: Option[];
};

export default function Traces() {
  const [queryOptions, setQueryOptions] = useState<TraceFilterInput>({
    attributes: {},
    names: null,
  });

  const updateQueryOptions = (options: TraceFilterInput) => {
    setQueryOptions(options);
  };

  // {
  //   refetchInterval: 2000,
  // }

  const traces = api.traces.all.useQuery(queryOptions);

  // const options = api.traces.availableFilterOptions.useQuery(queryOptions);

  const options = {
    name: [
      { label: "sample-name", value: "10", icon: AccessibilityIcon },
      { label: "whoop", value: "130" },
    ],
    status: [
      { label: "executing", value: "9" },
      { label: "successful", value: "3" },
    ],
    id: [{ label: "7a88fb47-b4e2-43b8-a06c-a5ce950dc53b", value: "1" }],
  };

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

  return (
    <div className="container mx-auto py-10">
      {traces.isLoading || !traces.data ? (
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
          options={options}
          queryOptions={queryOptions}
          updateQueryOptions={updateQueryOptions}
        />
      )}
    </div>
  );
}
