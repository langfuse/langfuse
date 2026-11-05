import { buildTracePath } from "@langfuse/shared";
import {
  type AgentDetailInput,
  type AgentRunRow,
} from "@langfuse/shared/agents";
import { useRouter } from "next/router";
import { Table } from "@/src/components/design-system/table/Table";
import { createLinkTableColumn } from "@/src/components/design-system/table/columns/createLinkTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { AgentPagination } from "./AgentPagination";
import { api } from "@/src/utils/api";
import { agentCost, agentDuration, agentPage } from "../hooks/agentsQuery";
import { AgentQueryError } from "./AgentQueryError";

export function AgentRunsTable({ input }: { input: AgentDetailInput }) {
  const router = useRouter();
  const page = agentPage(router.query.runPage);
  const query = api.agents.runs.useQuery({ ...input, page, pageSize: 20 });
  const columns = [
    createLinkTableColumn<AgentRunRow>({
      accessorKey: "name",
      header: "Run",
      size: 260,
      getCell: (name, { row }) => ({
        type: "link",
        props: {
          value: name || row.original.id,
          path: buildTracePath({
            projectId: input.projectId,
            traceId: row.original.traceId,
            observationId: row.original.id,
            timestamp: row.original.startTime,
          }),
        },
      }),
    }),
    createDateTableColumn<AgentRunRow>({
      accessorKey: "startTime",
      header: "Started",
      size: 190,
    }),
    createTextTableColumn<AgentRunRow>({
      accessorKey: "status",
      header: "State",
      size: 110,
      mapValue: (value) => {
        if (value === "error") return "Error-level";
        if (value === "ended") return "Ended";
        if (value === "open") return "Open";
        return "Unknown";
      },
    }),
    createTextTableColumn<AgentRunRow, number>({
      accessorKey: "durationMs",
      header: "Duration",
      size: 115,
      mapValue: (value) => agentDuration(value ?? null),
    }),
    createNumberTableColumn<AgentRunRow>({
      accessorKey: "cost",
      header: "Model cost",
      emptyValue: "Unknown",
      formatter: (value) => agentCost(value),
      size: 140,
    }),
    createNumberTableColumn<AgentRunRow>({
      accessorKey: "totalTokens",
      header: "Tokens",
      emptyValue: "Unknown",
      size: 120,
    }),
    createTextTableColumn<AgentRunRow>({
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
        Runs are AGENT observations. Ended means an end time was recorded, not
        that the run succeeded.
      </p>
      <div className="flex min-h-48 flex-1 flex-col">
        <Table
          tableName="Agent runs"
          rowHeight="s"
          topBorder={false}
          columns={columns}
          data={
            query.isPending
              ? { status: "loading" }
              : { status: "success", data: query.data.items }
          }
          noResultsMessage="No agent runs in this time range and environment."
        />
      </div>
      <AgentPagination
        totalCount={query.data?.totalCount ?? null}
        state={{ pageIndex: page, pageSize: 20 }}
        onChange={(next) =>
          router.replace(
            {
              pathname: router.pathname,
              query: { ...router.query, runPage: next.pageIndex + 1 },
            },
            undefined,
            { shallow: true },
          )
        }
      />
    </div>
  );
}
