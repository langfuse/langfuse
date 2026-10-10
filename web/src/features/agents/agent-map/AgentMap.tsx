import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { type FilterState } from "@langfuse/shared";
import { Alert } from "@/src/components/design-system/Alert/Alert";
import { Button } from "@/src/components/design-system/Button/Button";
import { PaginationBar } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { SwitchInput } from "@/src/components/design-system/SwitchInput/SwitchInput";
import { Table } from "@/src/components/design-system/table/Table";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ElkGraphRenderer } from "@/src/features/trace-graph-view/components/ElkGraphRenderer";
import { api } from "@/src/utils/api";
import { buildAgentProfilePath } from "../lib/buildAgentProfilePath";
import { buildAgentMapData } from "./buildAgentMapData";

type ConnectionRow = {
  caller: string;
  callee: string;
  calleeName: string | null;
  count: number;
  traceCount: number;
};

const EMPTY_OBSERVATION_MAP: Record<string, string[]> = {};

export function AgentMap({
  projectId,
  agentName,
  from,
  to,
  filter,
  onSelectRuns,
}: {
  projectId: string;
  agentName: string;
  from: Date;
  to: Date;
  filter: FilterState;
  onSelectRuns: (callee: string) => void;
}) {
  const router = useRouter();
  const [showAllAgents, setShowAllAgents] = useState(false);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const skeleton = api.agents.mapSkeletonFromEvents.useQuery(
    { projectId, agentName, from, to, filter },
    {
      enabled: Boolean(projectId && agentName),
      trpc: { context: { skipBatch: true } },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  );
  // A stable graph object keeps the imperative renderer's worker/viewport alive
  // during query status changes. Preparing up to 20k rows is the costly seam.
  const graph = useMemo(
    () =>
      buildAgentMapData(skeleton.data?.rows ?? [], agentName, showAllAgents),
    [skeleton.data?.rows, agentName, showAllAgents],
  );
  const diagram = useMemo(
    () => ({
      nodes: graph.nodes.map((node) => ({
        ...node,
        label: node.selfCallCount
          ? `↻ ${node.selfCallCount.toLocaleString()} · ${node.label}`
          : node.label,
      })),
      edges: graph.edges.filter((edge) => edge.from !== edge.to),
    }),
    [graph],
  );
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const hasGroupedUnnamedCalls = graph.edges.some(
    (edge) =>
      edge.from === edge.to && nodeById.get(edge.from)?.kind === "unnamed",
  );
  const connections: ConnectionRow[] = graph.edges.map((edge) => ({
    caller: nodeById.get(edge.from)?.label ?? "Unknown caller",
    callee: nodeById.get(edge.to)?.label ?? "Unnamed agent",
    calleeName: nodeById.get(edge.to)?.agentName ?? null,
    count: edge.count,
    traceCount: edge.traceCount,
  }));
  const profilePath = (name: string) => {
    return buildAgentProfilePath({
      projectId,
      agentName: name,
      from,
      to,
      filter,
    });
  };
  const columns = [
    createTextTableColumn<ConnectionRow>({
      accessorKey: "caller",
      header: "Caller",
      size: 220,
      cellClassName: "ph-no-capture",
    }),
    createTextTableColumn<ConnectionRow>({
      accessorKey: "callee",
      header: "Callee",
      size: 220,
      cellClassName: "ph-no-capture",
    }),
    createNumberTableColumn<ConnectionRow>({
      accessorKey: "count",
      header: "Calls",
      size: 100,
      formatter: (value) => value.toLocaleString(),
      headerTooltip: {
        description:
          "AGENT spans connected by in-trace parentage in this sample.",
      },
    }),
    createNumberTableColumn<ConnectionRow>({
      accessorKey: "traceCount",
      header: "Sample traces",
      size: 135,
      formatter: (value) => value.toLocaleString(),
    }),
  ];

  if (skeleton.isError) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Alert variant="destructive">
          <Alert.Title>Agent map could not be loaded</Alert.Title>
          <Alert.Description>
            Try a smaller time window or retry the sample query.
          </Alert.Description>
        </Alert>
        <div>
          <Button
            text="Retry agent map"
            variant="secondary"
            onClick={() => skeleton.refetch()}
          />
        </div>
      </div>
    );
  }
  if (!skeleton.data)
    return (
      <div className="flex flex-col gap-3 p-4" aria-label="Loading agent map">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );

  const data = skeleton.data;
  const hasUnknownAncestry =
    graph.diagnostics.missingParentRuns > 0 ||
    graph.diagnostics.cyclicParentRuns > 0;
  const visiblePageIndex = Math.min(
    pagination.pageIndex,
    Math.max(0, Math.ceil(connections.length / pagination.pageSize) - 1),
  );
  const visibleConnections = connections.slice(
    visiblePageIndex * pagination.pageSize,
    (visiblePageIndex + 1) * pagination.pageSize,
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-muted-foreground text-sm">
            <strong className="text-foreground">Experimental call map</strong>
            <p>Parent-to-child AGENT calls, aggregated by name.</p>
          </div>
          <SwitchInput
            id="agent-map-all-agents"
            description="All agents in these traces"
            checked={showAllAgents}
            onCheckedChange={(checked) => {
              setShowAllAgents(checked);
              setPagination({ ...pagination, pageIndex: 0 });
            }}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          Built from {data.traceCount.toLocaleString()} of the most recent
          traces in this window, up to {data.traceLimit.toLocaleString()}.
          Cross-trace calls through queues or A2A need a parent-agent attribute
          in the future. Counts describe this sample, not all agent activity.
        </p>
        {data.rowsTruncated ? (
          <Alert variant="warning" size="sm">
            <Alert.Description>
              The sample reached the {data.rowLimit.toLocaleString()}
              -observation limit. Connections and counts are incomplete; narrow
              the time window to inspect a smaller sample.
            </Alert.Description>
          </Alert>
        ) : null}
        {data.tracesTruncated ? (
          <Alert variant="info" size="sm">
            <Alert.Description>
              More traces match this window. Only the{" "}
              {data.traceLimit.toLocaleString()} most recent traces are
              included.
            </Alert.Description>
          </Alert>
        ) : null}
        {hasUnknownAncestry ? (
          <p className="text-muted-foreground text-xs">
            Some parent observations are outside this window, missing from the
            sample, or have cyclic parentage. Their caller is shown as unknown.
          </p>
        ) : null}
        {graph.diagnostics.unnamedAgentRuns > 0 ? (
          <p className="text-muted-foreground text-xs">
            AGENT observations without a name appear as “Unnamed agent” and
            cannot open a profile.
          </p>
        ) : null}
        {graph.diagnostics.selfCallRuns > 0 || hasGroupedUnnamedCalls ? (
          <Alert variant="info" size="sm">
            <Alert.Title>Calls within one group</Alert.Title>
            <Alert.Description>
              <p>The diagram groups agents by name.</p>
              {graph.diagnostics.selfCallRuns > 0 ? (
                <p>
                  {graph.diagnostics.selfCallRuns.toLocaleString()} self-call
                  {graph.diagnostics.selfCallRuns === 1 ? "" : "s"} across{" "}
                  {graph.diagnostics.selfCallTraces.toLocaleString()} sampled{" "}
                  {graph.diagnostics.selfCallTraces === 1 ? "trace" : "traces"}.
                  These calls remain in Connections instead of being drawn as
                  loops; ↻ marks their count on each node.
                </p>
              ) : null}
              {hasGroupedUnnamedCalls ? (
                <p>
                  Calls between unnamed agents also share a node and remain in
                  Connections. Inspect their observations to identify the
                  caller.
                </p>
              ) : null}
            </Alert.Description>
          </Alert>
        ) : null}
        {graph.nodes.length === 0 ? (
          <div className="text-muted-foreground flex h-64 flex-col items-center justify-center gap-2 rounded-md border px-6 text-center">
            <p className="text-foreground font-bold">
              No agent calls in this sample
            </p>
            <p className="max-w-lg text-sm">
              The agent can have named generations and tools without AGENT runs.
              Record an AGENT observation with its name to see calls here, or
              choose another window.
            </p>
          </div>
        ) : (
          <>
            <div className="ph-no-capture h-96 overflow-hidden rounded-md border md:h-[480px]">
              <ElkGraphRenderer
                graph={diagram}
                nodeToObservationsMap={EMPTY_OBSERVATION_MAP}
                selectedNodeName={`agent:${agentName}`}
                graphLabel="Agent call map"
                fallbackDescription="Use the connections below to inspect the sampled calls."
                onCanvasNodeNameChange={(id) => {
                  const name = id ? nodeById.get(id)?.agentName : null;
                  if (name) router.push(profilePath(name));
                }}
                onEdgeSelect={(edge) => {
                  const name = nodeById.get(edge.to)?.agentName;
                  if (name) onSelectRuns(name);
                }}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Select an agent to open its profile. Select a connection to view
              the callee’s runs in the full selected window. Thicker connections
              mean more sampled calls.
            </p>
            <div className="ph-no-capture flex max-h-96 flex-col overflow-hidden rounded-md border">
              <Table
                tableName="Sampled agent connections"
                columns={columns}
                data={{ status: "success", data: visibleConnections }}
                actions={(connection) => {
                  const name = connection.calleeName;
                  return name
                    ? [
                        {
                          id: "open-profile",
                          type: "item",
                          title: "Open callee profile",
                          href: profilePath(name),
                        },
                        {
                          id: "view-runs",
                          type: "item",
                          title: "View callee runs",
                          onClick: () => onSelectRuns(name),
                        },
                      ]
                    : [];
                }}
                rowHeight="m"
              />
              <PaginationBar
                mode="offset"
                totalCount={connections.length}
                state={{ ...pagination, pageIndex: visiblePageIndex }}
                onChange={setPagination}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
