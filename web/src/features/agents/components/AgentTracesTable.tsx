import { buildTracePath } from "@langfuse/shared";
import {
  type AgentDetailInput,
  type AgentTraceRow,
} from "@langfuse/shared/agents";
import { useRouter } from "next/router";
import { Table } from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { AgentPagination } from "./AgentPagination";
import { api } from "@/src/utils/api";
import { agentCost, agentPage } from "../hooks/agentsQuery";
import { AgentQueryError } from "./AgentQueryError";

export function AgentTracesTable({ input }: { input: AgentDetailInput }) {
  const router = useRouter();
  const page = agentPage(router.query.tracePage);
  const query = api.agents.traces.useQuery({ ...input, page, pageSize: 20 });
  const columns = [
    createLinkTableColumn<AgentTraceRow>({
      accessorKey: "name",
      header: "Trace",
      size: 300,
      getCell: (name, { row }) => ({
        type: "link",
        props: {
          value: name || row.original.id,
          path: buildTracePath({
            projectId: input.projectId,
            traceId: row.original.id,
            timestamp: row.original.startTime,
          }),
        },
      }),
    }),
    createDateTableColumn<AgentTraceRow>({
      accessorKey: "startTime",
      header: "First agent activity",
      size: 190,
    }),
    createNumberTableColumn<AgentTraceRow>({
      accessorKey: "runs",
      header: "Agent runs",
      size: 110,
    }),
    createNumberTableColumn<AgentTraceRow>({
      accessorKey: "cost",
      header: "Agent model cost",
      emptyValue: "Unknown",
      formatter: (value) => agentCost(value),
      size: 160,
    }),
    createNumberTableColumn<AgentTraceRow>({
      accessorKey: "totalTokens",
      header: "Agent tokens",
      emptyValue: "Unknown",
      size: 125,
    }),
    createTextTableColumn<AgentTraceRow>({
      id: "coverage",
      accessorFn: (row) =>
        `${row.pricedModelCalls}/${row.modelCalls} priced · ${row.usageKnownCalls}/${row.modelCalls} usage`,
      header: "Model coverage",
      size: 230,
    }),
  ];
  if (query.isError)
    return (
      <AgentQueryError
        retry={() => {
          query.refetch();
        }}
      />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="text-muted-foreground shrink-0 px-4 py-2 text-xs">
        Distinct traces containing this agent. Metrics reflect this agent’s
        attributed model calls in the selected period.
      </p>
      <div className="flex min-h-48 flex-1 flex-col">
        <Table
          tableName="Agent traces"
          rowHeight="s"
          topBorder={false}
          columns={columns}
          data={
            query.isPending
              ? { status: "loading" }
              : { status: "success", data: query.data.items }
          }
          noResultsMessage="No traces in this time range and environment."
        />
      </div>
      <AgentPagination
        totalCount={query.data?.totalCount ?? null}
        state={{ pageIndex: page, pageSize: 20 }}
        onChange={(next) =>
          router.replace(
            {
              pathname: router.pathname,
              query: { ...router.query, tracePage: next.pageIndex + 1 },
            },
            undefined,
            { shallow: true },
          )
        }
      />
    </div>
  );
}
