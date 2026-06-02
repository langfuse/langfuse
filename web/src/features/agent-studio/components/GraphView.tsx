import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  type LangGraphGraphDef,
  type LangGraphGraphNode,
  type LangGraphGraphEdge,
} from "../types";

type Props = {
  graphDef: LangGraphGraphDef | undefined;
  isLoading: boolean;
  activeNodeName?: string | null;
};

const NODE_W = 140;
const NODE_H = 36;
const H_GAP = 56;
const V_GAP = 64;
const SUB_PAD = 20;
const SUB_LABEL_H = 28;

type LayoutItem = {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  inner?: LayoutResult;
};

type LayoutResult = {
  items: LayoutItem[];
  edges: LangGraphGraphEdge[];
  totalW: number;
  totalH: number;
};

function getInnerGraph(node: LangGraphGraphNode): LangGraphGraphDef | null {
  if (node.type !== "subgraph") return null;
  const d = node.data as Record<string, unknown> | undefined;
  if (!d) return null;

  // Format 1: data.nodes + data.edges  (LangGraph ≤ 0.2)
  if (Array.isArray(d.nodes)) {
    return {
      nodes: d.nodes as LangGraphGraphNode[],
      edges: Array.isArray(d.edges) ? (d.edges as LangGraphGraphEdge[]) : [],
    };
  }

  // Format 2: data.graph.nodes + data.graph.edges  (LangGraph 0.3+)
  const g = d.graph as Record<string, unknown> | undefined;
  if (g && Array.isArray(g.nodes)) {
    return {
      nodes: g.nodes as LangGraphGraphNode[],
      edges: Array.isArray(g.edges) ? (g.edges as LangGraphGraphEdge[]) : [],
    };
  }

  return null;
}

// Returns true if a node is a subgraph even when inner data isn't inlined
function isSubgraphMarker(node: LangGraphGraphNode): boolean {
  return node.type === "subgraph";
}

function doLayout(
  nodes: LangGraphGraphNode[],
  edges: LangGraphGraphEdge[],
): LayoutResult {
  if (nodes.length === 0)
    return { items: [], edges, totalW: NODE_W, totalH: NODE_H };

  const inDegree: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  for (const n of nodes) {
    inDegree[n.id] = 0;
    adj[n.id] = [];
  }
  for (const e of edges) {
    adj[e.source] = adj[e.source] ?? [];
    adj[e.source].push(e.target);
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1;
  }

  const layers: string[][] = [];
  let queue = nodes.map((n) => n.id).filter((id) => inDegree[id] === 0);
  const visited = new Set<string>();
  while (queue.length > 0) {
    layers.push(queue);
    queue.forEach((id) => visited.add(id));
    const next: string[] = [];
    for (const id of queue) {
      for (const t of adj[id] ?? []) {
        if (!visited.has(t)) next.push(t);
      }
    }
    queue = [...new Set(next)];
  }
  const remaining = nodes.map((n) => n.id).filter((id) => !visited.has(id));
  if (remaining.length > 0) layers.push(remaining);

  const innerLayouts: Record<string, LayoutResult> = {};
  const sizes: Record<string, { w: number; h: number }> = {};
  for (const n of nodes) {
    const inner = getInnerGraph(n);
    if (inner && inner.nodes.length > 0) {
      const il = doLayout(inner.nodes, inner.edges);
      innerLayouts[n.id] = il;
      sizes[n.id] = {
        w: Math.max(il.totalW + SUB_PAD * 2, NODE_W + SUB_PAD * 2),
        h: il.totalH + SUB_LABEL_H + SUB_PAD,
      };
    } else if (isSubgraphMarker(n)) {
      // Subgraph node but inner data not available — show a placeholder container
      sizes[n.id] = {
        w: NODE_W + SUB_PAD * 2,
        h: NODE_H + SUB_LABEL_H + SUB_PAD,
      };
    } else {
      sizes[n.id] = { w: NODE_W, h: NODE_H };
    }
  }

  const layerWidths = layers.map(
    (layer) =>
      layer.reduce((s, id) => s + (sizes[id]?.w ?? NODE_W), 0) +
      Math.max(0, layer.length - 1) * H_GAP,
  );
  const totalW = Math.max(...layerWidths, NODE_W);

  const positions: Record<string, { x: number; y: number }> = {};
  let curY = 0;
  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const layerH = Math.max(...layer.map((id) => sizes[id]?.h ?? NODE_H));
    const layerW = layerWidths[li] ?? 0;
    const offsetX = (totalW - layerW) / 2;
    let curX = offsetX;
    for (const id of layer) {
      positions[id] = { x: curX, y: curY };
      curX += (sizes[id]?.w ?? NODE_W) + H_GAP;
    }
    curY += layerH + V_GAP;
  }
  const totalH = Math.max(curY - V_GAP, NODE_H);

  const items: LayoutItem[] = nodes.map((n) => {
    const pos = positions[n.id] ?? { x: 0, y: 0 };
    const sz = sizes[n.id] ?? { w: NODE_W, h: NODE_H };
    return {
      id: n.id,
      label: n.name ?? n.id,
      type: n.type ?? "runnable",
      x: pos.x,
      y: pos.y,
      w: sz.w,
      h: sz.h,
      inner: innerLayouts[n.id],
    };
  });

  return { items, edges, totalW, totalH };
}

function containsActive(inner: LayoutResult, name: string): boolean {
  return inner.items.some(
    (it) =>
      it.id === name ||
      it.label === name ||
      (it.inner ? containsActive(it.inner, name) : false),
  );
}

function renderLevel(
  layout: LayoutResult,
  activeNodeName: string | null | undefined,
  ox: number,
  oy: number,
): React.ReactNode[] {
  const { items, edges } = layout;
  const byId: Record<string, LayoutItem> = {};
  for (const it of items) byId[it.id] = it;
  const elems: React.ReactNode[] = [];

  edges.forEach((edge, i) => {
    const src = byId[edge.source];
    const tgt = byId[edge.target];
    if (!src || !tgt) return;
    const x1 = ox + src.x + src.w / 2;
    const y1 = oy + src.y + src.h;
    const x2 = ox + tgt.x + tgt.w / 2;
    const y2 = oy + tgt.y;
    const my = (y1 + y2) / 2;
    elems.push(
      <path
        key={`e-${i}-${edge.source}-${edge.target}`}
        d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`}
        fill="none"
        stroke={
          edge.conditional
            ? "hsl(var(--muted-foreground))"
            : "hsl(var(--border))"
        }
        strokeWidth={1.5}
        strokeDasharray={edge.conditional ? "4 3" : undefined}
        markerEnd="url(#arrow)"
      />,
    );
  });

  for (const item of items) {
    const nx = ox + item.x;
    const ny = oy + item.y;
    const isSpecial = item.id === "__start__" || item.id === "__end__";
    // Match bare name OR "parent:child" namespaced name (stream_subgraphs=true)
    const baseName = activeNodeName?.includes(":")
      ? activeNodeName.split(":").pop()
      : activeNodeName;
    const isDirect =
      activeNodeName === item.id ||
      activeNodeName === item.label ||
      baseName === item.id ||
      baseName === item.label;
    const isParent =
      !isDirect && item.inner != null && activeNodeName != null
        ? containsActive(item.inner, activeNodeName) ||
          containsActive(item.inner, baseName ?? "")
        : false;

    if (item.type === "subgraph") {
      // Subgraph container — with or without inner node data
      const isActiveContainer = isDirect || isParent;
      elems.push(
        <g key={item.id}>
          <rect
            x={nx}
            y={ny}
            width={item.w}
            height={item.h}
            rx={10}
            fill={
              isActiveContainer
                ? "hsl(var(--primary) / 0.07)"
                : "hsl(var(--accent) / 0.25)"
            }
            stroke={
              isActiveContainer ? "hsl(var(--primary))" : "hsl(var(--border))"
            }
            strokeWidth={isActiveContainer ? 2 : 1.5}
            strokeDasharray={isActiveContainer ? undefined : "6 4"}
          />
          {/* subgraph label */}
          <text
            x={nx + 10}
            y={ny + 18}
            fontSize={10}
            fontFamily="monospace"
            fill="hsl(var(--muted-foreground))"
            className="select-none"
          >
            ⊞{" "}
            {item.label.length > 22
              ? item.label.slice(0, 20) + "…"
              : item.label}
          </text>
          {item.inner ? (
            renderLevel(
              item.inner,
              activeNodeName,
              nx + SUB_PAD,
              ny + SUB_LABEL_H,
            )
          ) : (
            /* No inner data — show a placeholder node inside the container */
            <g>
              <rect
                x={nx + SUB_PAD}
                y={ny + SUB_LABEL_H}
                width={item.w - SUB_PAD * 2}
                height={NODE_H}
                rx={6}
                fill={isDirect ? "hsl(var(--primary))" : "hsl(var(--card))"}
                stroke={isDirect ? "hsl(var(--primary))" : "hsl(var(--border))"}
                strokeWidth={isDirect ? 2 : 1}
              />
              <text
                x={nx + item.w / 2}
                y={ny + SUB_LABEL_H + NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontFamily="monospace"
                fill={
                  isDirect
                    ? "hsl(var(--primary-foreground))"
                    : "hsl(var(--muted-foreground))"
                }
                className="select-none"
              >
                {item.label.length > 17
                  ? item.label.slice(0, 15) + "…"
                  : item.label}
              </text>
            </g>
          )}
        </g>,
      );
    } else {
      elems.push(
        <g key={item.id}>
          <rect
            x={nx}
            y={ny}
            width={item.w}
            height={item.h}
            rx={isSpecial ? item.h / 2 : 6}
            fill={
              isDirect
                ? "hsl(var(--primary))"
                : isSpecial
                  ? "hsl(var(--muted))"
                  : "hsl(var(--card))"
            }
            stroke={isDirect ? "hsl(var(--primary))" : "hsl(var(--border))"}
            strokeWidth={isDirect ? 2 : 1}
          />
          <text
            x={nx + item.w / 2}
            y={ny + item.h / 2 + 4}
            textAnchor="middle"
            fontSize={11}
            fontFamily="monospace"
            fill={
              isDirect
                ? "hsl(var(--primary-foreground))"
                : "hsl(var(--foreground))"
            }
            className="select-none"
          >
            {item.label.length > 17
              ? item.label.slice(0, 15) + "…"
              : item.label}
          </text>
        </g>,
      );
    }
  }

  return elems;
}

export function GraphView({ graphDef, isLoading, activeNodeName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 20, y: 20, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Compute layout once per graphDef
  const layout =
    graphDef && graphDef.nodes.length > 0
      ? doLayout(graphDef.nodes, graphDef.edges)
      : null;
  const pad = 28;
  const svgW = layout ? layout.totalW + pad * 2 : 0;
  const svgH = layout ? layout.totalH + pad * 2 : 0;

  // Auto-fit to container when graph changes
  useLayoutEffect(() => {
    if (!layout || !containerRef.current || svgW === 0 || svgH === 0) return;
    const el = containerRef.current;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw === 0 || ch === 0) return;
    const margin = 32;
    const scale = Math.min((cw - margin) / svgW, (ch - margin) / svgH, 1);
    setTransform({
      x: (cw - svgW * scale) / 2,
      y: (ch - svgH * scale) / 2,
      scale,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphDef?.nodes.length]);

  // Wheel-to-zoom toward cursor (passive: false required)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.9;
      setTransform((prev) => {
        const ns = Math.min(Math.max(prev.scale * factor, 0.1), 5);
        const r = ns / prev.scale;
        return {
          scale: ns,
          x: cx - r * (cx - prev.x),
          y: cy - r * (cy - prev.y),
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setTransform((prev) => ({
      ...prev,
      x: dragRef.current.tx + (e.clientX - dragRef.current.x),
      y: dragRef.current.ty + (e.clientY - dragRef.current.y),
    }));
  };
  const stopDrag = () => setDragging(false);

  const fitView = () => {
    const el = containerRef.current;
    if (!el || !layout || svgW === 0) return;
    const margin = 32;
    const scale = Math.min(
      (el.clientWidth - margin) / svgW,
      (el.clientHeight - margin) / svgH,
      1,
    );
    setTransform({
      x: (el.clientWidth - svgW * scale) / 2,
      y: (el.clientHeight - svgH * scale) / 2,
      scale,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
        No graph structure available
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      style={{ cursor: dragging ? "grabbing" : "grab", userSelect: "none" }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <Button
          variant="outline"
          size="icon"
          className="bg-background/80 h-7 w-7 backdrop-blur-sm"
          onClick={() =>
            setTransform((p) => {
              const s = Math.min(p.scale * 1.2, 5);
              return { ...p, scale: s };
            })
          }
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-background/80 h-7 w-7 backdrop-blur-sm"
          onClick={() =>
            setTransform((p) => {
              const s = Math.max(p.scale / 1.2, 0.1);
              return { ...p, scale: s };
            })
          }
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-background/80 h-7 w-7 backdrop-blur-sm"
          onClick={fitView}
          title="Fit to view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Zoom level indicator */}
      <div className="bg-background/70 text-muted-foreground absolute right-2 bottom-2 z-10 rounded px-1.5 py-0.5 text-xs backdrop-blur-sm">
        {Math.round(transform.scale * 100)}%
      </div>

      <svg
        width={svgW}
        height={svgH}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: `translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
          willChange: "transform",
          overflow: "visible",
        }}
      >
        <defs>
          <marker
            id="arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill="hsl(var(--muted-foreground))" />
          </marker>
        </defs>
        {renderLevel(layout, activeNodeName, pad, pad)}
      </svg>
    </div>
  );
}
