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
import { type RouterOutputs } from "@/src/utils/api";

type WeekOverWeekCount = {
  current: number;
  previous: number;
  changePct: number | null;
};

type IngestionActivityStatus = "new" | "stopped" | "active" | "idle";

export type OrganizationIngestionOverview =
  RouterOutputs["organizationIngestion"]["overview"];

function weekOverWeek(current: number, previous: number): WeekOverWeekCount {
  if (previous === 0) {
    return { current, previous, changePct: current === 0 ? 0 : null };
  }
  return {
    current,
    previous,
    changePct: ((current - previous) / previous) * 100,
  };
}

type ClientNode = Node<
  {
    name: string;
    version: string;
    status: IngestionActivityStatus;
    lastSeen: string | null;
    v4Migration: OrganizationIngestionOverview["eventRows"][number]["v4Migration"];
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

const migrationLabels = {
  required: "Required",
  not_required: "Not required",
  unknown: "Unknown",
} satisfies Record<ClientNode["data"]["v4Migration"], string>;

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
    <div className="border-border bg-card text-card-foreground dark:bg-muted w-64 rounded-lg border px-3 py-2 shadow-sm">
      <div className="text-muted-foreground border-border dark:border-border-contrast flex items-center justify-between gap-2 border-b pb-2 text-xs">
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
      <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
        <span>SDK version</span>
        <span className="text-foreground">{data.version}</span>
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
        <span>Status</span>
        <span className="text-foreground capitalize">{data.status}</span>
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
        <span>Last seen</span>
        <span className="text-foreground">
          {data.lastSeen
            ? new Date(data.lastSeen).toLocaleDateString()
            : "Never"}
        </span>
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
        <span>V4 migration</span>
        <span
          className={
            data.v4Migration === "required"
              ? "text-amber-600 dark:text-amber-400"
              : "text-foreground"
          }
        >
          {migrationLabels[data.v4Migration]}
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
    <div className="border-border bg-card text-card-foreground dark:bg-muted w-64 rounded-lg border px-3 py-2 shadow-sm">
      <div className="text-muted-foreground border-border dark:border-border-contrast flex items-center justify-between gap-2 border-b pb-2 text-xs">
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
      <div className="text-muted-foreground mt-1.5 flex items-center justify-between text-xs">
        <span>Observations (7d)</span>
        <span className="flex items-center gap-2">
          <span className="text-foreground font-bold tabular-nums">
            {data.events.current.toLocaleString()}
          </span>
          <ChangeIndicator change={data.events.changePct} />
        </span>
      </div>
      <div className="text-muted-foreground mt-1 flex items-center justify-between text-xs">
        <span>Scores (7d)</span>
        <span className="flex items-center gap-2">
          <span className="text-foreground font-bold tabular-nums">
            {data.scores.current.toLocaleString()}
          </span>
          <ChangeIndicator change={data.scores.changePct} />
        </span>
      </div>
      <div className="border-border dark:border-border-contrast text-muted-foreground mt-1.5 flex items-center justify-between border-t pt-1.5 text-xs">
        <span>Billable units (7d)</span>
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
const rowSpacing = 160;

export function OrgOverviewGraph({
  data,
  initialZoom,
  search,
  activityFilter,
  order,
}: {
  data: OrganizationIngestionOverview;
  initialZoom?: number;
  search?: string;
  activityFilter?: "active" | "inactive";
  order?: "billable" | "observations" | "scores" | "name";
}) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let row = 0;
    const query = search?.trim().toLowerCase() ?? "";
    const volumes = new Map<string, { observations: number; scores: number }>();
    for (const entry of data.eventRows) {
      const volume = volumes.get(entry.projectId) ?? {
        observations: 0,
        scores: 0,
      };
      volume.observations += entry.current;
      volumes.set(entry.projectId, volume);
    }
    for (const entry of data.scoreRows) {
      const volume = volumes.get(entry.projectId) ?? {
        observations: 0,
        scores: 0,
      };
      volume.scores += entry.current;
      volumes.set(entry.projectId, volume);
    }
    const projects = [...data.projects];
    if (order) {
      projects.sort((a, b) => {
        if (order === "name") return a.name.localeCompare(b.name);
        const left = volumes.get(a.id) ?? { observations: 0, scores: 0 };
        const right = volumes.get(b.id) ?? { observations: 0, scores: 0 };
        if (order === "observations")
          return right.observations - left.observations;
        if (order === "scores") return right.scores - left.scores;
        return (
          right.observations + right.scores - left.observations - left.scores
        );
      });
    }

    for (const project of projects) {
      const projectNodeId = `project-${project.id}`;
      const firstRow = row;
      const clients = new Map<
        string,
        {
          sdkName: string | null;
          sdkVersion: string | null;
          current: number;
          previous: number;
          scoreCurrent: number;
          scorePrevious: number;
          lastSeen: string | null;
          v4Migration: ClientNode["data"]["v4Migration"];
        }
      >();
      let eventCurrent = 0;
      let eventPrevious = 0;
      let scoreCurrent = 0;
      let scorePrevious = 0;
      for (const entry of [...data.eventRows, ...data.scoreRows]) {
        if (entry.projectId !== project.id) continue;
        const isEvent = "ingestionPath" in entry;
        if (isEvent) {
          eventCurrent += entry.current;
          eventPrevious += entry.previous;
        } else {
          scoreCurrent += entry.current;
          scorePrevious += entry.previous;
          // Evaluator and annotation scores contribute to project totals, not API client traffic.
          if (entry.source !== "API") continue;
        }
        const key = JSON.stringify([
          entry.sdkName,
          entry.sdkVersion,
          entry.publicKey,
          entry.isInternal,
        ]);
        const client = clients.get(key) ?? {
          sdkName: entry.sdkName,
          sdkVersion: entry.sdkVersion,
          current: 0,
          previous: 0,
          scoreCurrent: 0,
          scorePrevious: 0,
          lastSeen: null,
          v4Migration: entry.v4Migration,
        };
        if (isEvent) {
          client.current += entry.current;
          client.previous += entry.previous;
        } else {
          client.scoreCurrent += entry.current;
          client.scorePrevious += entry.previous;
        }
        if (
          !client.lastSeen ||
          Date.parse(entry.lastSeen) > Date.parse(client.lastSeen)
        )
          client.lastSeen = entry.lastSeen;
        clients.set(key, client);
      }

      const projectMatches = project.name.toLowerCase().includes(query);
      const visibleClients = [...clients].filter(([, client]) => {
        if (
          !projectMatches &&
          !(client.sdkName ?? "Unknown client").toLowerCase().includes(query)
        )
          return false;
        const current = client.current + client.scoreCurrent;
        if (activityFilter === "active" && current === 0) return false;
        if (activityFilter === "inactive" && current > 0) return false;
        return true;
      });
      if (activityFilter === "active" && eventCurrent + scoreCurrent === 0)
        continue;
      if (activityFilter === "inactive" && eventCurrent + scoreCurrent > 0)
        continue;
      if (!projectMatches && visibleClients.length === 0) continue;

      for (const [key, client] of visibleClients) {
        const clientNodeId = `client-${project.id}-${key}`;
        const current = client.current + client.scoreCurrent;
        const previous = client.previous + client.scorePrevious;
        let status: IngestionActivityStatus = "idle";
        if (current > 0 && previous > 0) status = "active";
        else if (current > 0) status = "new";
        else if (previous > 0) status = "stopped";
        nodes.push({
          id: clientNodeId,
          type: "client",
          data: {
            name: client.sdkName ?? "Unknown client",
            version: client.sdkVersion ?? "Unknown",
            status,
            lastSeen: client.lastSeen,
            v4Migration: client.v4Migration,
          },
          position: { x: 0, y: row * rowSpacing },
        });

        edges.push({
          id: `${clientNodeId}-${projectNodeId}`,
          source: clientNodeId,
          target: projectNodeId,
          type: "flow",
          data: { events: weekOverWeek(client.current, client.previous) },
          markerEnd: { type: MarkerType.ArrowClosed },
        });
        row++;
      }

      nodes.push({
        id: projectNodeId,
        type: "project",
        data: {
          name: project.name,
          events: weekOverWeek(eventCurrent, eventPrevious),
          scores: weekOverWeek(scoreCurrent, scorePrevious),
        },
        position: {
          x: 456,
          y:
            visibleClients.length > 0
              ? ((firstRow + row - 1) / 2) * rowSpacing
              : row * rowSpacing,
        },
      });
      if (visibleClients.length === 0) row++;
    }

    return { nodes, edges };
  }, [data, search, activityFilter, order]);

  return (
    <div className="h-full w-full">
      {nodes.length === 0 ? (
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          No matching projects or clients.
        </div>
      ) : (
        <ReactFlow
          key={JSON.stringify([search, activityFilter])}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{
            minZoom: 0.05,
            maxZoom: initialZoom ?? 1,
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        />
      )}
    </div>
  );
}
