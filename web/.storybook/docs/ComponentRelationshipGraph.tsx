import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import type { ElkNode } from "elkjs";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/src/components/design-system/Button/Button";

import { buildComponentRelationshipGraph } from "./componentRelationshipData";

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

type Layout = {
  width: number;
  height: number;
  nodes: {
    id: string;
    label: string;
    kind: "component" | "function" | "internal";
    group: string | null;
    x: number;
    y: number;
  }[];
  edges: { id: string; path: string }[];
  groupAreas: {
    label: string;
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
} as const;

const graph = buildComponentRelationshipGraph(sourceModules);

async function layoutGraph() {
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
      ...[...groupedNodes.entries()].map(([group, nodes]) => ({
        id: `group:${group}`,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.aspectRatio": "0.35",
          "elk.direction": "RIGHT",
          "elk.edgeRouting": "ORTHOGONAL",
          "elk.spacing.nodeNode": "24",
          "elk.padding": "[top=40,left=24,bottom=24,right=24]",
        },
        children: nodes.map((node) => leafNode(node.id)),
      })),
    ],
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
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
    groupAreas.push({
      label: node.id.slice("group:".length),
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
    width: result.width ?? 1,
    height: result.height ?? 1,
    nodes,
    edges,
    groupAreas,
  } satisfies Layout;
}

export function ComponentRelationshipGraph() {
  const [layout, setLayout] = useState<Layout>();
  const svgRef = useRef<SVGSVGElement>(null);
  const contentRef = useRef<SVGGElement>(null);
  const zoomBehavior = useMemo(
    () =>
      zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.25, 8])
        .on("zoom", (event) => {
          contentRef.current?.setAttribute("transform", event.transform);
        }),
    [],
  );

  useEffect(() => {
    let active = true;
    layoutGraph().then((nextLayout) => {
      if (active) setLayout(nextLayout);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    select(svg).call(zoomBehavior);
    return () => {
      select(svg).on(".zoom", null);
    };
  }, [layout, zoomBehavior]);

  const resetZoom = () => {
    if (!svgRef.current) return;
    select(svgRef.current).call(zoomBehavior.transform, zoomIdentity);
  };

  return (
    <div className="component-relationship-graph flex min-h-0 flex-1 flex-col gap-3">
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            {graph.nodes.length} nodes · {graph.edges.length} imports · arrows
            point toward dependencies
          </span>
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
        </div>
        <Button text="Reset view" variant="secondary" onClick={resetZoom} />
      </div>
      <div className="bg-background min-h-0 flex-1 overflow-hidden rounded-md border">
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
                  <text
                    x={area.x + 12}
                    y={area.y + 20}
                    className="fill-muted-foreground text-[10px] font-medium tracking-wide uppercase"
                  >
                    {area.label}
                  </text>
                </g>
              ))}
              {layout.edges.map((edge) => (
                <path
                  key={edge.id}
                  d={edge.path}
                  fill="none"
                  markerEnd="url(#dependency-arrow)"
                  className="stroke-muted-foreground/50"
                />
              ))}
              {layout.nodes.map((node) => (
                <g key={node.id} transform={`translate(${node.x} ${node.y})`}>
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
                    className="fill-foreground text-[11px] font-medium"
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
      <p className="text-muted-foreground text-xs">
        Drag to pan and scroll to zoom.
      </p>
    </div>
  );
}
