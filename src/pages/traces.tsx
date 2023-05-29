import React, { useState } from "react";
import { api } from "../utils/api";
import { type RouterInput } from "../utils/types";
import { DataTable } from "../components/data-table";
import { columns } from "./columns";
import { type Trace, type Score } from "@prisma/client";

export type TraceTableRow = {
  id: string;
  timestamp: Date;
  name: string;
  status: string;
  statusMessage?: string;
  attributes?: string;
  scores: string;
};

type TraceFilterInput = RouterInput["traces"]["all"];

export default function Tabl() {
  const [queryOptions, setQueryOptions] = useState<TraceFilterInput>({
    attributes: {},
  });

  // {
  //   refetchInterval: 2000,
  // }

  const traces = api.traces.all.useQuery(queryOptions);

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
        />
      )}
    </div>
  );
}
