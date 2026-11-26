import { ChevronDown, ChevronRight } from "@langfuse/icons";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import type { ElkNode } from "elkjs";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useRef, useState } from "react";

import { AsyncSelectInput } from "@/src/components/design-system/AsyncSelectInput/AsyncSelectInput";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";

import {
  buildComponentRelationshipGraph,
  COMPONENT_RELATIONSHIP_QUERY,
  focusComponentRelationshipGraph,
  type ComponentRelationshipGraph as GraphData,
  type RelationshipFocus,
} from "./componentRelationshipData";

const sourceModules = import.meta.glob(
  "../../src/components/design-system/**/*.{ts,tsx}",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

const NODE_WIDTH = 190;
const NODE_HEIGHT = 42;
const PADDING = 40;
const SEARCH_FOCUS_NODE_WIDTH = 240;

type ViewTarget = { nodeId: string } | "fit";

type LayoutRequest = {
  selection?: { nodeId: string; focusDirection?: RelationshipFocus };
  collapsedGroups: ReadonlySet<string>;
  viewTarget?: ViewTarget;
};

type Layout = {
  viewTarget?: ViewTarget;
  width: number;
  height: number;
  nodes: {
    id: string;
    label: string;
    kind: GraphData["nodes"][number]["kind"];
    group: string | null;
    x: number;
    y: number;
  }[];
  edges: { id: string; path: string }[];
  groupAreas: {
    label: string;
    status: "expanded" | "collapsed";
    memberCount: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
};

const NODE_CLASSES = {
  component: "component-relationship-node--component",
  function: "component-relationship-node--function",
  internal: "component-relationship-node--internal",
  constants: "component-relationship-node--constants",
} as const;

const graph = buildComponentRelationshipGraph(sourceModules);

function initialGraphSelection() {
  if (typeof window === "undefined") return undefined;

  const query = new URLSearchParams(window.location.search);
  let id = query.get(COMPONENT_RELATIONSHIP_QUERY);
  if (!id && window.parent !== window) {
    try {
      id = new URLSearchParams(window.parent.location.search).get(
        COMPONENT_RELATIONSHIP_QUERY,
      );
    } catch {
      // A cross-origin Storybook host cannot supply the manager query string.
    }
  }
  return id && graph.nodes.some((node) => node.id === id) ? id : undefined;
}

async function layoutGraph(
  graph: GraphData,
  collapsedGroups: ReadonlySet<string>,
  viewTarget: ViewTarget | undefined,
) {
  const elk = new ELK();
  const groupedNodes = new Map<string, typeof graph.nodes>();
  for (const node of graph.nodes) {
    if (node.group === null) continue;
    groupedNodes.set(node.group, [
      ...(groupedNodes.get(node.group) ?? []),
      node,
    ]);
  }
  const groupedNodeIds = new Set(
    [...groupedNodes.values()].flat().map((node) => node.id),
  );
  const rootNodes = graph.nodes.filter((node) => !groupedNodeIds.has(node.id));
  const collapsedEndpoints = new Map<string, string>();
  for (const [group, nodes] of groupedNodes) {
    if (!collapsedGroups.has(group)) continue;
    for (const node of nodes) collapsedEndpoints.set(node.id, `group:${group}`);
  }
  const collapsedConnections = new Set<string>();
  const edgesToLayout = graph.edges.flatMap((edge) => {
    const source = collapsedEndpoints.get(edge.source) ?? edge.source;
    const target = collapsedEndpoints.get(edge.target) ?? edge.target;
    if (source !== edge.source || target !== edge.target) {
      if (source === target) return [];
      const connection = JSON.stringify([source, target]);
      if (collapsedConnections.has(connection)) return [];
      collapsedConnections.add(connection);
    }
    return [{ id: edge.id, sources: [source], targets: [target] }];
  });
  const leafNode = (id: string): ElkNode => ({
    id,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
  });
  const elkGraph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.aspectRatio": "0.35",
      "elk.direction": "RIGHT",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "32",
      "elk.spacing.componentComponent": "64",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.padding": `[top=${PADDING},left=${PADDING},bottom=${PADDING},right=${PADDING}]`,
    },
    children: [
      ...rootNodes.map((node) => leafNode(node.id)),
      ...[...groupedNodes.entries()].map(([group, nodes]) => {
        const id = `group:${group}`;
        if (collapsedGroups.has(group)) return leafNode(id);
        return {
          id,
          layoutOptions: {
            "elk.algorithm": "layered",
            "elk.aspectRatio": "0.35",
            "elk.direction": "RIGHT",
            "elk.edgeRouting": "ORTHOGONAL",
            "elk.spacing.nodeNode": "24",
            "elk.padding": "[top=40,left=24,bottom=24,right=24]",
          },
          children: nodes.map((node) => leafNode(node.id)),
        };
      }),
    ],
    edges: edgesToLayout,
  };
  const result = await elk.layout(elkGraph);
  const graphNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes: Layout["nodes"] = [];
  const groupAreas: Layout["groupAreas"] = [];

  for (const node of result.children ?? []) {
    if (!node.id.startsWith("group:")) {
      const graphNode = graphNodes.get(node.id);
      if (!graphNode) continue;
      nodes.push({
        ...graphNode,
        x: node.x ?? 0,
        y: node.y ?? 0,
      });
      continue;
    }

    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const label = node.id.slice("group:".length);
    groupAreas.push({
      label,
      status: collapsedGroups.has(label) ? "collapsed" : "expanded",
      memberCount: groupedNodes.get(label)?.length ?? 0,
      x,
      y,
      width: node.width ?? 0,
      height: node.height ?? 0,
    });
    for (const child of node.children ?? []) {
      const graphNode = graphNodes.get(child.id);
      if (!graphNode) continue;
      nodes.push({
        ...graphNode,
        x: x + (child.x ?? 0),
        y: y + (child.y ?? 0),
      });
    }
  }

  const groupOffsets = new Map(
    (result.children ?? [])
      .filter((node) => node.id.startsWith("group:"))
      .map((node) => [node.id, { x: node.x ?? 0, y: node.y ?? 0 }]),
  );
  const edges = (result.edges ?? []).flatMap((edge) => {
    const section = edge.sections?.[0];
    if (!section) return [];
    const offset = edge.container
      ? (groupOffsets.get(edge.container) ?? { x: 0, y: 0 })
      : { x: 0, y: 0 };
    const points = [
      section.startPoint,
      ...(section.bendPoints ?? []),
      section.endPoint,
    ];
    return [
      {
        id: edge.id,
        path: points
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"}${point.x + offset.x},${point.y + offset.y}`,
          )
          .join(" "),
      },
    ];
  });

  return {
    viewTarget,
    width: result.width ?? 1,
    height: result.height ?? 1,
    nodes,
    edges,
    groupAreas,
  } satisfies Layout;
}

export function ComponentRelationshipGraph() {
  const [layout, setLayout] = useState<Layout>();
  const [request, setRequest] = useState<LayoutRequest>(() => {
    const selectedNodeId = initialGraphSelection();
    return {
      selection: selectedNodeId
        ? { nodeId: selectedNodeId, focusDirection: "both" }
        : undefined,
      collapsedGroups: new Set(),
      viewTarget: selectedNodeId ? { nodeId: selectedNodeId } : undefined,
    };
  });
  const { selection, collapsedGroups, viewTarget } = request;
  const highlightedNodeId = selection?.nodeId;
  const focusDirection = selection?.focusDirection;
  const [searchQuery, setSearchQuery] = useState("");
  const visibleGraph = useMemo(
    () =>
      highlightedNodeId && focusDirection
        ? focusComponentRelationshipGraph(
            graph,
            highlightedNodeId,
            focusDirection,
          )
        : graph,
    [highlightedNodeId, focusDirection],
  );
  const selectedNode = graph.nodes.find(
    (node) => node.id === highlightedNodeId,
  );
  const selectedGroup = selectedNode?.group;
  const collapsibleGroups = new Set(
    visibleGraph.nodes.flatMap(({ group }) =>
      group === null || group === selectedGroup ? [] : [group],
    ),
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const zoomBehavior = useMemo(() => {
    const behavior = zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 8]);
    const defaultFilter = behavior.filter();
    return behavior
      .filter(function (event: Event, datum) {
        if (
          event.type !== "wheel" &&
          event.target instanceof Element &&
          event.target.closest("[data-group-toggle]")
        ) {
          return false;
        }
        return defaultFilter.call(this, event, datum);
      })
      .on("zoom", (event) => {
        contentRef.current?.setAttribute("transform", event.transform);
      });
  }, []);

  useEffect(() => {
    let active = true;
    layoutGraph(visibleGraph, collapsedGroups, viewTarget).then(
      (nextLayout) => {
        if (active) setLayout(nextLayout);
      },
    );
    return () => {
      active = false;
    };
  }, [collapsedGroups, visibleGraph, viewTarget]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !layout) return;
    const viewport = select(svg).call(zoomBehavior);
    const target = layout.viewTarget;
    if (target === "fit") {
      viewport.call(zoomBehavior.transform, zoomIdentity);
    } else if (target) {
      const node = layout.nodes.find((node) => node.id === target.nodeId);
      if (node) {
        const viewportScale = Math.min(
          svg.clientWidth / layout.width,
          svg.clientHeight / layout.height,
        );
        const targetWidth = Math.min(
          SEARCH_FOCUS_NODE_WIDTH,
          svg.clientWidth / 2,
        );
        const [minZoom, maxZoom] = zoomBehavior.scaleExtent();
        const scale =
          viewportScale > 0
            ? Math.min(
                maxZoom,
                Math.max(minZoom, targetWidth / (NODE_WIDTH * viewportScale)),
              )
            : minZoom;
        viewport.call(
          zoomBehavior.transform,
          zoomIdentity
            .translate(layout.width / 2, layout.height / 2)
            .scale(scale)
            .translate(-node.x - NODE_WIDTH / 2, -node.y - NODE_HEIGHT / 2),
        );
      }
    }
    return () => {
      viewport.on(".zoom", null);
    };
  }, [layout, zoomBehavior]);

  const query = searchQuery.trim().toLowerCase();
  const allGroupsCollapsed = [...collapsibleGroups].every((group) =>
    collapsedGroups.has(group),
  );
  const searchOptions = graph.nodes.flatMap((node) => {
    const matchingPaths = node.paths.filter((path) =>
      path.toLowerCase().includes(query),
    );
    if (!node.label.toLowerCase().includes(query) && !matchingPaths.length) {
      return [];
    }
    return [
      {
        value: node.id,
        label: node.label,
        secondaryLabel: matchingPaths.join(", ") || node.paths[0],
      },
    ];
  });

  const resetZoom = () => {
    if (!svgRef.current) return;
    select(svgRef.current).call(zoomBehavior.transform, zoomIdentity);
  };

  return (
    <div className="component-relationship-graph flex min-h-0 flex-1 flex-col gap-3">
      <div className="bg-muted/30 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <AsyncSelectInput
            aria-label="Search components or files"
            placeholder="Search components or files…"
            emptyMessage="No matching components or files."
            value={
              selectedNode
                ? { value: selectedNode.id, label: selectedNode.label }
                : null
            }
            options={searchOptions}
            search={{
              placeholder: "Search names or paths…",
              value: searchQuery,
              onValueChange: setSearchQuery,
            }}
            onValueChange={({ value }) => {
              const node = graph.nodes.find((node) => node.id === value);
              if (!node) return;
              setRequest((current) => {
                const next = new Set(current.collapsedGroups);
                if (node.group !== null) next.delete(node.group);
                return {
                  selection: { nodeId: node.id, focusDirection: "both" },
                  collapsedGroups: next,
                  viewTarget: { nodeId: node.id },
                };
              });
            }}
          />
        </div>
        {selectedNode && (
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Focus:</span>
            <SelectInput<RelationshipFocus | "full">
              aria-label={`Focus graph on ${selectedNode.label}`}
              placeholder="Full graph"
              value={focusDirection ?? "full"}
              options={[
                { value: "full", label: "Full graph" },
                { value: "both", label: "Both" },
                { value: "dependencies", label: "Dependencies" },
                { value: "dependents", label: "Dependents" },
              ]}
              onValueChange={(direction) =>
                setRequest((current) => ({
                  ...current,
                  selection: {
                    nodeId: selectedNode.id,
                    focusDirection:
                      direction === "full" ? undefined : direction,
                  },
                  viewTarget: "fit",
                }))
              }
            />
          </div>
        )}
        {selectedNode && (
          <Button
            text="Clear component selection"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRequest((current) => ({
                collapsedGroups: current.collapsedGroups,
                viewTarget: "fit",
              }));
              for (const target of new Set([window, window.parent])) {
                try {
                  const url = new URL(target.location.href);
                  if (!url.searchParams.has(COMPONENT_RELATIONSHIP_QUERY)) {
                    continue;
                  }
                  url.searchParams.delete(COMPONENT_RELATIONSHIP_QUERY);
                  target.history.replaceState(target.history.state, "", url);
                } catch {
                  // A cross-origin manager owns its own URL.
                }
              }
            }}
          />
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {collapsibleGroups.size > 0 && (
            <Button
              text={
                allGroupsCollapsed ? "Expand all groups" : "Collapse all groups"
              }
              variant="secondary"
              onClick={() =>
                setRequest((current) => {
                  const next = new Set(current.collapsedGroups);
                  for (const group of collapsibleGroups) {
                    if (allGroupsCollapsed) next.delete(group);
                    else next.add(group);
                  }
                  return {
                    ...current,
                    collapsedGroups: next,
                    viewTarget: "fit",
                  };
                })
              }
            />
          )}
          <Button text="Reset view" variant="secondary" onClick={resetZoom} />
        </div>
      </div>
      <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
        <div className="text-muted-foreground flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b px-3 py-2 text-xs">
          <span>
            {visibleGraph.nodes.length} nodes · {visibleGraph.edges.length}{" "}
            imports · arrows point toward dependencies
          </span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="component-relationship-key--component size-2.5 rounded-sm border" />
              Component
            </span>
            <span className="flex items-center gap-1.5">
              <span className="component-relationship-key--function size-2.5 rounded-sm border" />
              Function
            </span>
            <span className="flex items-center gap-1.5">
              <span className="component-relationship-key--internal size-2.5 rounded-sm border" />
              Internal component
            </span>
            <span className="flex items-center gap-1.5">
              <span className="component-relationship-key--constants size-2.5 rounded-sm border" />
              Constants
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {layout ? (
            <svg
              ref={svgRef}
              className="size-full cursor-grab active:cursor-grabbing"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              aria-label="Design-system component import graph"
            >
              <defs>
                <marker
                  id="dependency-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 5 L 0 10 z"
                    className="fill-muted-foreground"
                  />
                </marker>
              </defs>
              <g ref={contentRef}>
                {layout.groupAreas.map((area) => (
                  <g key={area.label}>
                    <rect
                      x={area.x}
                      y={area.y}
                      width={area.width}
                      height={area.height}
                      rx="8"
                      className="fill-muted/30 stroke-border stroke-dashed"
                    />
                    <foreignObject
                      x={area.x + 4}
                      y={area.y + 2}
                      width={area.width - 8}
                      height={34}
                    >
                      <div data-group-toggle className="inline-flex p-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={
                            area.status === "collapsed"
                              ? ChevronRight
                              : ChevronDown
                          }
                          text={
                            area.status === "collapsed"
                              ? `${area.label} (${area.memberCount})`
                              : area.label
                          }
                          disabled={area.label === selectedGroup}
                          aria-expanded={area.status === "expanded"}
                          onClick={() =>
                            setRequest((current) => {
                              const next = new Set(current.collapsedGroups);
                              if (next.has(area.label)) next.delete(area.label);
                              else next.add(area.label);
                              return {
                                ...current,
                                collapsedGroups: next,
                                viewTarget: undefined,
                              };
                            })
                          }
                        />
                      </div>
                    </foreignObject>
                  </g>
                ))}
                {layout.edges.map((edge) => (
                  <path
                    key={edge.id}
                    d={edge.path}
                    fill="none"
                    markerEnd="url(#dependency-arrow)"
                    className="stroke-muted-foreground/50 pointer-events-none"
                  />
                ))}
                {layout.nodes.map((node) => (
                  <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
                    {node.id === highlightedNodeId && (
                      <rect
                        x={-4}
                        y={-4}
                        width={NODE_WIDTH + 8}
                        height={NODE_HEIGHT + 8}
                        rx="10"
                        className="stroke-ring pointer-events-none fill-none stroke-[3]"
                      />
                    )}
                    <rect
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx="6"
                      className={NODE_CLASSES[node.kind]}
                    />
                    <text
                      x={NODE_WIDTH / 2}
                      y={NODE_HEIGHT / 2}
                      dominantBaseline="middle"
                      textAnchor="middle"
                      className={
                        node.id === highlightedNodeId
                          ? "fill-foreground text-[12px] font-bold"
                          : "fill-foreground text-[11px] font-medium"
                      }
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </g>
            </svg>
          ) : (
            <div className="text-muted-foreground flex size-full items-center justify-center text-sm">
              Laying out component graph…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
