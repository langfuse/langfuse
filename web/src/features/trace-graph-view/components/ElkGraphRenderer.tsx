import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { select, type Selection } from "d3-selection";
import {
  zoom as createZoom,
  zoomIdentity,
  type D3ZoomEvent,
  type ZoomBehavior,
} from "d3-zoom";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { type GraphCanvasData, type GraphNodeData } from "../types";
import { computeGraphLayout, type GraphLayout } from "../layout/elkLayout";
import { GraphNode } from "./GraphNode";

type ElkGraphRendererProps = {
  graph: GraphCanvasData;
  selectedNodeName?: string | null;
  onCanvasNodeNameChange?: (nodeName: string | null) => void;
  nodeToObservationsMap?: Record<string, string[]>;
  currentObservationIndices?: Record<string, number>;
};

type Transform = { x: number; y: number; k: number };

const FIT_PADDING = 24;
const SCALE_MIN = 0.05;
const SCALE_MAX = 2;
const MAX_FIT_SCALE = 1.2;
const ZOOM_STEP = 1.4;
// Below this scale labels are unreadable noise — show only node shape + icon.
const LABEL_HIDE_SCALE = 0.5;
// One consistent scale to reveal a selection from a zoomed-out overview, so
// navigating between nodes pans rather than re-zooms (no "zoom jumping").
const SELECTION_REVEAL_SCALE = 0.9;
const CLICK_MOVE_THRESHOLD = 4; // px; beyond this a pointerup is a drag, not a click

function toPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

/**
 * Custom read-only graph renderer: ELK lays out the DAG, we draw HTML nodes over
 * an SVG edge layer inside a single transformed "world" container. d3-zoom owns
 * the pan/zoom transform (one source of truth → no view-state drift), and gives
 * us drag-pan, wheel + pinch zoom, and programmatic fit/focus for free.
 */
export const ElkGraphRenderer: React.FC<ElkGraphRendererProps> = ({
  graph,
  selectedNodeName = null,
  onCanvasNodeNameChange,
  nodeToObservationsMap = {},
  currentObservationIndices = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const selectionRef = useRef<Selection<
    HTMLDivElement,
    unknown,
    null,
    undefined
  > | null>(null);
  // Once the user pans/zooms, stop auto-fitting on resize.
  const userControlledRef = useRef(false);
  // The node id (or null for an empty click) of the last in-canvas selection, so
  // the focus effect re-frames only for selections from the tree/timeline.
  const lastCanvasClickRef = useRef<string | null | undefined>(undefined);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Mirror transform in a ref so the focus effect can read the current zoom
  // without depending on it (which would re-focus on every pan).
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const nodeMeta = useMemo(() => {
    const map = new Map<string, GraphNodeData>();
    graph.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [graph.nodes]);

  // Highlighted node: hover takes precedence over the sticky selection.
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

  // Compute layout via ELK whenever the graph changes.
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    userControlledRef.current = false;
    computeGraphLayout(graph)
      .then((result) => {
        if (!cancelled) setLayout(result);
      })
      .catch((error) => console.error("Graph layout failed:", error));
    return () => {
      cancelled = true;
    };
  }, [graph]);

  // Track container size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Wire up d3-zoom once (drag-pan + wheel/pinch zoom).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const selection = select(el);
    const zoomBehavior = createZoom<HTMLDivElement, unknown>()
      .scaleExtent([SCALE_MIN, SCALE_MAX])
      .on("zoom", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (event.sourceEvent) userControlledRef.current = true;
        const { x, y, k } = event.transform;
        setTransform({ x, y, k });
      });
    selection.call(zoomBehavior);
    selection.on("dblclick.zoom", null); // don't zoom on double-click
    zoomRef.current = zoomBehavior;
    selectionRef.current = selection;
    return () => {
      selection.on(".zoom", null);
      zoomRef.current = null;
      selectionRef.current = null;
    };
  }, []);

  // Drive all transform changes through d3-zoom so its internal state stays in
  // sync with what's displayed (otherwise the next gesture jumps).
  const applyTransform = useCallback((next: Transform) => {
    const selection = selectionRef.current;
    const zoomBehavior = zoomRef.current;
    if (!selection || !zoomBehavior) return;
    zoomBehavior.transform(
      selection,
      zoomIdentity.translate(next.x, next.y).scale(next.k),
    );
  }, []);

  const computeFit = useCallback((): Transform | null => {
    if (
      !layout ||
      layout.width === 0 ||
      layout.height === 0 ||
      size.width === 0
    )
      return null;
    const k = Math.min(
      (size.width - FIT_PADDING * 2) / layout.width,
      (size.height - FIT_PADDING * 2) / layout.height,
      MAX_FIT_SCALE,
    );
    return {
      k,
      x: (size.width - layout.width * k) / 2,
      y: (size.height - layout.height * k) / 2,
    };
  }, [layout, size]);

  // Auto-fit on layout/size until the user takes control.
  useEffect(() => {
    if (userControlledRef.current) return;
    const fit = computeFit();
    if (fit) applyTransform(fit);
  }, [computeFit, applyTransform]);

  // Reflect external selection (tree/timeline): bring the node into view at the
  // current zoom (or one reveal scale when zoomed out). In-canvas clicks don't
  // move the view; selecting the root/empty returns to the full-graph overview.
  useEffect(() => {
    const cameFromClick = lastCanvasClickRef.current === selectedNodeName;
    lastCanvasClickRef.current = undefined;
    if (cameFromClick || !layout || size.width === 0) return;

    if (!selectedNodeName) {
      userControlledRef.current = false;
      const fit = computeFit();
      if (fit) applyTransform(fit);
      return;
    }

    const node = layout.nodes.find((n) => n.id === selectedNodeName);
    if (!node) return;
    userControlledRef.current = true;
    const current = transformRef.current.k;
    const k = current >= LABEL_HIDE_SCALE ? current : SELECTION_REVEAL_SCALE;
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    applyTransform({
      k,
      x: size.width / 2 - cx * k,
      y: size.height / 2 - cy * k,
    });
  }, [selectedNodeName, layout, size, computeFit, applyTransform]);

  const handleSelect = useCallback(
    (id: string) => {
      lastCanvasClickRef.current = id;
      onCanvasNodeNameChange?.(id);
    },
    [onCanvasNodeNameChange],
  );

  const handleBackgroundClick = (event: React.MouseEvent) => {
    // Ignore the click that ends a drag-pan.
    const down = pointerDownPos.current;
    if (
      down &&
      Math.hypot(event.clientX - down.x, event.clientY - down.y) >
        CLICK_MOVE_THRESHOLD
    ) {
      return;
    }
    lastCanvasClickRef.current = null;
    onCanvasNodeNameChange?.(null);
  };

  const zoomBy = (factor: number) => {
    const selection = selectionRef.current;
    const zoomBehavior = zoomRef.current;
    if (!selection || !zoomBehavior) return;
    userControlledRef.current = true;
    zoomBehavior.scaleBy(selection, factor);
  };

  const handleFit = () => {
    userControlledRef.current = false;
    const fit = computeFit();
    if (fit) applyTransform(fit);
  };

  const compact = transform.k < LABEL_HIDE_SCALE;

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
      className="bg-background/50 relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      onPointerDown={(e) =>
        (pointerDownPos.current = { x: e.clientX, y: e.clientY })
      }
      onClick={handleBackgroundClick}
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
                compact={compact}
                onSelect={handleSelect}
                onHover={setHoveredId}
              />
            );
          })}
        </div>
      )}

      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <Button
          onClick={() => zoomBy(ZOOM_STEP)}
          variant="outline"
          size="icon"
          className="bg-background/80 h-7 w-7 backdrop-blur"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          variant="outline"
          size="icon"
          className="bg-background/80 h-7 w-7 backdrop-blur"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleFit}
          variant="outline"
          size="icon"
          className="bg-background/80 h-7 w-7 backdrop-blur"
          title="Fit to view"
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};
