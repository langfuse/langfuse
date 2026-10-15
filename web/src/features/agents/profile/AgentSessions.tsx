import { useRouter } from "next/router";
import { NumberParam, StringParam, useQueryParams } from "use-query-params";
import {
  buildTracePath,
  type AgentSessionProjection,
  type AgentProjectionSession,
} from "@langfuse/shared";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { Button } from "@/src/components/design-system/Button/Button";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
import { usdFormatter } from "@/src/utils/numbers";
import { AgentSessionPeek } from "./AgentSessionPeek";
import {
  formatAgentDuration,
  prepareAgentSessionRows,
} from "./prepareAgentProfile";

export function AgentSessions({
  projectId,
  agentName,
  projection,
}: {
  projectId: string;
  agentName: string;
  projection: AgentSessionProjection;
}) {
  const router = useRouter();
  const [
    { page, agentSessionSearch, agentSignal, agentTool, agentSkill },
    setParams,
  ] = useQueryParams({
    page: NumberParam,
    agentSessionSearch: StringParam,
    agentSignal: StringParam,
    agentTool: StringParam,
    agentSkill: StringParam,
  });
  const { openPeek, closePeek } = usePeekNavigation({
    tableName: "Agent sessions",
    isV4: true,
  });
  const summary = projection.agents.find(
    (agent) => agent.agentName === agentName,
  );
  const signal = summary?.signals.find((item) => item.kind === agentSignal);
  const rows = prepareAgentSessionRows({
    sessions: projection.sessions,
    agentName,
    search: agentSessionSearch ?? "",
    signalSessionIds: signal?.sessionIds.length ? signal.sessionIds : null,
  }).filter(
    (row) =>
      (!agentTool || row.toolNames.includes(agentTool)) &&
      (!agentSkill || row.skillNames.includes(agentSkill)),
  );
  const pageSize = 20;
  const pageIndex = Math.min(
    Math.max(0, Math.floor((page ?? 1) - 1) || 0),
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  const columns = [
    createTableColumn<AgentProjectionSession, string>({
      accessorKey: "id",
      header: "Session / trace",
      size: 290,
      renderCell: (id, { row }) => (
        <div className="ph-no-capture flex min-w-0 items-center gap-2">
          <span
            className="truncate font-mono"
            title={row.original.sessionId ?? row.original.traceId ?? id}
          >
            {row.original.sessionId ?? row.original.traceId ?? id}
          </span>
          {row.original.kind === "trace" && (
            <Badge color="yellow" text="No session ID" />
          )}
        </div>
      ),
    }),
    createNumberTableColumn<AgentProjectionSession>({
      accessorKey: "traceCount",
      header: "Traces",
      size: 85,
    }),
    createNumberTableColumn<AgentProjectionSession>({
      accessorKey: "windowInvocations",
      header: "Invocations",
      size: 110,
    }),
    createNumberTableColumn<AgentProjectionSession>({
      accessorKey: "windowToolInvocations",
      header: "Tools",
      size: 85,
    }),
    createNumberTableColumn<AgentProjectionSession>({
      accessorKey: "windowCost",
      header: "Agent cost",
      formatter: usdFormatter,
      size: 110,
    }),
    createNumberTableColumn<AgentProjectionSession>({
      accessorKey: "sessionElapsedMs",
      header: "Session duration",
      formatter: formatAgentDuration,
      size: 145,
    }),
    createTableColumn<AgentProjectionSession, boolean>({
      accessorKey: "completePerSession",
      header: "Context",
      size: 140,
      renderCell: (complete, { row }) => (
        <Badge
          color={complete ? "primary" : "yellow"}
          text={
            complete
              ? "Settled observed"
              : row.original.completenessReason.replaceAll("-", " ")
          }
        />
      ),
    }),
    createDateTableColumn<AgentProjectionSession>({
      accessorKey: "lastSeen",
      header: "Last agent activity",
      size: 175,
    }),
    createTextTableColumn<AgentProjectionSession, string[]>({
      accessorKey: "participatingAgentNames",
      header: "Participating agents",
      mapValue: (names) => names?.join(", "),
      cellClassName: "ph-no-capture",
      size: 240,
    }),
  ];
  const peek = typeof router.query.peek === "string" ? router.query.peek : null;
  const peekRow = projection.sessions.find(
    (session) => session.sessionId === peek && session.agentName === agentName,
  );
  const traceAgents: Record<string, string[]> = {};
  for (const row of projection.map.rows) {
    if (row.agentName)
      traceAgents[row.traceId] = [
        ...new Set([...(traceAgents[row.traceId] ?? []), row.agentName]),
      ];
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Sessions with this agent</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            A session can contain several agents and repeated invocations. Cost
            is this agent&apos;s attributed cost; duration is whole-session
            observed time.
          </p>
        </div>
        <div className="w-64">
          <SearchInput
            value={agentSessionSearch ?? ""}
            onChange={(value) =>
              setParams({ agentSessionSearch: value || undefined, page: 1 })
            }
            onSubmit={(value) =>
              setParams({ agentSessionSearch: value || undefined, page: 1 })
            }
            placeholder="Search session IDs…"
          />
        </div>
      </div>
      {signal && (
        <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span>{signal.message}</span>
          <Button
            text="Show all sessions"
            variant="ghost"
            onClick={() => setParams({ agentSignal: undefined, page: 1 })}
          />
        </div>
      )}
      {(agentTool || agentSkill) && (
        <div className="ph-no-capture bg-muted/40 flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
          <span>
            Sessions with{" "}
            {agentTool ? `tool: ${agentTool}` : `skill: ${agentSkill}`}
          </span>
          <Button
            text="Clear filter"
            variant="ghost"
            onClick={() =>
              setParams({
                agentTool: undefined,
                agentSkill: undefined,
                page: 1,
              })
            }
          />
        </div>
      )}
      <Table
        tableName="Agent sessions"
        columns={columns}
        data={{
          status: "success",
          data: rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
        }}
        rowHeight="m"
        onRowClick={(row) => {
          if (row.sessionId) openPeek(row.sessionId);
          else if (row.traceId)
            router.push(buildTracePath({ projectId, traceId: row.traceId }));
        }}
      />
      <PaginationBar
        mode="offset"
        totalCount={rows.length}
        state={{ pageIndex, pageSize }}
        onChange={(next) => setParams({ page: next.pageIndex + 1 })}
        pageSizeOptions={[20]}
      />
      <p className="text-muted-foreground text-xs">
        Sessionless traces open as traces and are excluded from session
        averages. “Settled observed” means no open spans and{" "}
        {projection.coverage.settledMinutes} minutes of quiet; it does not
        establish application completion.
      </p>
      {peek && (
        <AgentSessionPeek
          projectId={projectId}
          agentName={agentName}
          sessionId={peek}
          closePeek={closePeek}
          participants={peekRow?.participatingAgentNames ?? []}
          traceAgents={traceAgents}
        />
      )}
    </div>
  );
}
