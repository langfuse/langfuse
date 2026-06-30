import React, { useEffect, useMemo, useRef, useState } from "react";

import { type GraphCanvasData, type GraphNodeData } from "../types";
import { computeGraphLayout, type GraphLayout } from "../layout/elkLayout";
import { GraphNode } from "./GraphNode";

type ElkGraphRendererProps = {
  graph: GraphCanvasData;
  // Wired in phase 2 (selection / hover / tree sync); accepted now so this is a
  // drop-in for the previous canvas component.
  selectedNodeName?: string | null;
  onCanvasNodeNameChange?: (nodeName: string | null) => void;
  nodeToObservationsMap?: Record<string, string[]>;
  currentObservationIndices?: Record<string, number>;
};

const FIT_PADDING = 24;
const MAX_FIT_SCALE = 1.2;

function toPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/**
 * Phase 1 (static) renderer for the custom graph view: ELK lays the graph out,
 * we fit it into the container, then draw HTML nodes over an SVG edge layer.
 * Pan/zoom/selection come next; this proves the layout → render pipeline.
 */
export const ElkGraphRenderer: React.FC<ElkGraphRendererProps> = ({
  graph,
  selectedNodeName = null,
  onCanvasNodeNameChange,
  nodeToObservationsMap = {},
  currentObservationIndices = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodeMeta = useMemo(() => {
    const map = new Map<string, GraphNodeData>();
    graph.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [graph.nodes]);

  // The node whose relations are highlighted: hover takes precedence over the
  // sticky selection.
  const focusNode = hoveredId ?? selectedNodeName;

  // Observation-cycling counter per node, e.g. " (2/3)".
  const counters = useMemo(() => {
    const map = new Map<string, string>();
    for (const [node, observations] of Object.entries(nodeToObservationsMap)) {
      if (observations.length > 1) {
        const index = currentObservationIndices[node] ?? 0;
        map.set(
          node,
          ` (${observations.length - index}/${observations.length})`,
        );
      }
    }
    return map;
  }, [nodeToObservationsMap, currentObservationIndices]);

  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    computeGraphLayout(graph)
      .then((result) => {
        if (!cancelled) setLayout(result);
      })
      .catch((error) => console.error("Graph layout failed:", error));
    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const transform = useMemo(() => {
    if (
      !layout ||
      layout.width === 0 ||
      layout.height === 0 ||
      size.width === 0
    ) {
      return { x: 0, y: 0, k: 1 };
    }
    const k = Math.min(
      (size.width - FIT_PADDING * 2) / layout.width,
      (size.height - FIT_PADDING * 2) / layout.height,
      MAX_FIT_SCALE,
    );
    const x = (size.width - layout.width * k) / 2;
    const y = (size.height - layout.height * k) / 2;
    return { x, y, k };
  }, [layout, size]);

  if (!graph.nodes.length) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        No graph data available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      onClick={() => onCanvasNodeNameChange?.(null)}
    >
      {!layout && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Laying out graph…
        </div>
      )}
      {layout && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
          >
            <defs>
              <marker
                id="graph-arrow"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path
                  d="M0,0 L6,3 L0,6 Z"
                  className="fill-muted-foreground/50"
                />
              </marker>
              <marker
                id="graph-arrow-active"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="M0,0 L6,3 L0,6 Z" className="fill-primary" />
              </marker>
            </defs>
            {layout.edges.map((edge) => {
              const active =
                focusNode != null &&
                (edge.source === focusNode || edge.target === focusNode);
              return (
                <path
                  key={edge.id}
                  d={toPath(edge.points)}
                  className={
                    active
                      ? "stroke-primary fill-none"
                      : "stroke-muted-foreground/40 fill-none"
                  }
                  strokeWidth={active ? 2 : 1.5}
                  markerEnd={
                    active ? "url(#graph-arrow-active)" : "url(#graph-arrow)"
                  }
                />
              );
            })}
          </svg>
          {layout.nodes.map((node) => {
            const meta = nodeMeta.get(node.id);
            if (!meta) return null;
            return (
              <GraphNode
                key={node.id}
                id={node.id}
                label={meta.label}
                type={meta.type}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                counter={counters.get(node.id)}
                selected={node.id === selectedNodeName}
                onSelect={(id) => onCanvasNodeNameChange?.(id)}
                onHover={setHoveredId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
