import { useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Code2,
  FolderClosed,
} from "lucide-react";
import "@xyflow/react/dist/style.css";

type WeekOverWeekCount = {
  current: number;
  previous: number;
  changePct: number | null;
};

type IngestionActivityStatus = "new" | "stopped" | "active" | "idle";

export type OrganizationIngestionOverview = {
  windows: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  totals: {
    events: WeekOverWeekCount;
    scores: WeekOverWeekCount;
    projectsByStatus: Record<IngestionActivityStatus, number>;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    status: IngestionActivityStatus;
    events: WeekOverWeekCount;
    scores: WeekOverWeekCount & {
      bySource: Record<"API" | "EVAL" | "ANNOTATION", WeekOverWeekCount>;
    };
    lastSeen: string | null;
    clients: Array<{
      clientType:
        | "langfuse_sdk"
        | "custom_otel"
        | "custom_ingestion_api"
        | "langfuse_internal";
      sdkName: string;
      sdkVersion: string;
      canonicalSdkName: "python" | "javascript" | null;
      sdkUpgradeStatus:
        | "current"
        | "outdated_major"
        | "unknown"
        | "unsupported_sdk"
        | "invalid_version";
      ingestionPaths: ("otel" | "ingestion_api")[];
      publicKey: string | null;
      status: IngestionActivityStatus;
      events: WeekOverWeekCount;
      scores: WeekOverWeekCount;
      lastSeen: string | null;
    }>;
  }>;
};

type ClientNode = Node<
  {
    name: string;
    version: string;
    status: IngestionActivityStatus;
    lastSeen: string | null;
  },
  "client"
>;
type ProjectNode = Node<
  {
    name: string;
    events: WeekOverWeekCount;
    scores: WeekOverWeekCount;
  },
  "project"
>;
type FlowEdge = Edge<{ events: WeekOverWeekCount }, "flow">;

function ChangeIndicator({ change }: { change: number | null }) {
  if (change === null) {
    return <span className="text-blue-600 dark:text-blue-400">New</span>;
  }

  return (
    <span
      className={`inline-flex items-center tabular-nums ${change > 0 ? "text-green-600 dark:text-green-400" : ""} ${change < 0 ? "text-red-600 dark:text-red-400" : ""} ${change === 0 ? "text-muted-foreground" : ""}`}
    >
      {Math.abs(change).toFixed(2)}%
      {change > 0 && <ArrowUpRight className="size-3.5" />}
      {change < 0 && <ArrowDownRight className="size-3.5" />}
    </span>
  );
}

function FlowConnection({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
}: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} />
      {data && (
        <EdgeLabelRenderer>
          <div
            className="border-border bg-card text-foreground absolute flex items-center gap-2 rounded-md border px-2 py-1 text-xs shadow-sm"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <span className="font-bold tabular-nums">
              {data.events.current.toLocaleString()}
            </span>
            <ChangeIndicator change={data.events.changePct} />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

function ClientCard({ data }: NodeProps<ClientNode>) {
  return (
    <div className="border-border bg-card text-card-foreground dark:bg-muted w-64 rounded-lg border px-4 py-3 shadow-sm">
      <div className="text-muted-foreground border-border dark:border-border-contrast flex items-center justify-between gap-3 border-b pb-3 text-xs">
        <span className="flex shrink-0 items-center gap-1.5">
          <Code2 className="size-3" />
          Client
        </span>
        <span
          className="text-foreground min-w-0 truncate text-right text-sm font-bold"
          title={data.name}
        >
          {data.name}
        </span>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
        <span>SDK version</span>
        <span className="text-foreground">{data.version}</span>
      </div>
      <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
        <span>Status</span>
        <span className="text-foreground capitalize">{data.status}</span>
      </div>
      <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
        <span>Last seen</span>
        <span className="text-foreground">
          {data.lastSeen
            ? new Date(data.lastSeen).toLocaleDateString()
            : "Never"}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="border-0! opacity-0!"
      />
    </div>
  );
}

function ProjectCard({ data }: NodeProps<ProjectNode>) {
  return (
    <div className="border-border bg-card text-card-foreground dark:bg-muted w-64 rounded-lg border px-4 py-3 shadow-sm">
      <div className="text-muted-foreground border-border dark:border-border-contrast flex items-center justify-between gap-3 border-b pb-3 text-xs">
        <span className="flex shrink-0 items-center gap-1.5">
          <FolderClosed className="size-3" />
          Project
        </span>
        <span
          className="text-foreground min-w-0 truncate text-right text-sm font-bold"
          title={data.name}
        >
          {data.name}
        </span>
      </div>
      <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
        <span>Observations</span>
        <span className="flex items-center gap-2">
          <span className="text-foreground font-bold tabular-nums">
            {data.events.current.toLocaleString()}
          </span>
          <ChangeIndicator change={data.events.changePct} />
        </span>
      </div>
      <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
        <span>Scores</span>
        <span className="flex items-center gap-2">
          <span className="text-foreground font-bold tabular-nums">
            {data.scores.current.toLocaleString()}
          </span>
          <ChangeIndicator change={data.scores.changePct} />
        </span>
      </div>
      <div className="border-border dark:border-border-contrast text-muted-foreground mt-2 flex items-center justify-between border-t pt-2 text-xs">
        <span>Billable units</span>
        <span className="text-foreground font-bold tabular-nums">
          {(data.events.current + data.scores.current).toLocaleString()}
        </span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="border-0! opacity-0!"
      />
    </div>
  );
}

const nodeTypes = { client: ClientCard, project: ProjectCard };
const edgeTypes = { flow: FlowConnection };

export function OrgOverviewGraph({
  data,
  initialZoom,
}: {
  data: OrganizationIngestionOverview;
  initialZoom?: number;
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let row = 0;

    for (const project of data.projects) {
      const projectNodeId = `project-${project.projectId}`;
      const firstRow = row;

      for (const [index, client] of project.clients.entries()) {
        const clientNodeId = `client-${project.projectId}-${index}`;
        nodes.push({
          id: clientNodeId,
          type: "client",
          data: {
            name: client.sdkName,
            version: client.sdkVersion,
            status: client.status,
            lastSeen: client.lastSeen,
          },
          position: { x: 0, y: row * 200 },
        });

        edges.push({
          id: `${clientNodeId}-${projectNodeId}`,
          source: clientNodeId,
          target: projectNodeId,
          type: "flow",
          data: { events: client.events },
          markerEnd: { type: MarkerType.ArrowClosed },
        });
        row++;
      }

      nodes.push({
        id: projectNodeId,
        type: "project",
        data: {
          name: project.projectName,
          events: project.events,
          scores: project.scores,
        },
        position: {
          x: 600,
          y:
            project.clients.length > 0
              ? ((firstRow + row - 1) / 2) * 200
              : row * 200,
        },
      });
      if (project.clients.length === 0) row++;
    }

    return { nodes, edges };
  }, [data]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{
          minZoom: initialZoom ?? 1,
          maxZoom: initialZoom ?? 1,
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}
