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
  zoomTransform,
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
  /**
   * Node names "playing" at the timeline playhead. Nodes in the set glow so the
   * active run stands out as the playhead sweeps. `null`/empty = nothing glows
   * (resting state stays fully visible — no dimming).
   */
  activeNodeNames?: ReadonlySet<string> | null;
};

type Transform = { x: number; y: number; k: number };

const FIT_PADDING = 24;
const SCALE_MIN = 0.05;
const SCALE_MAX = 2;
const MAX_FIT_SCALE = 1.2;
const ZOOM_STEP = 1.4;
// Below this scale labels are unreadable noise — show only node shape + icon.
const LABEL_HIDE_SCALE = 0.5;
const CLICK_MOVE_THRESHOLD = 4; // px; beyond this a pointerup is a drag, not a click

function toPath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function toCss({ x, y, k }: Transform): string {
  return `translate(${x}px, ${y}px) scale(${k})`;
}

/** Edge strokes scale with the world's CSS transform (the SVG is inside the
 * transformed div, so vector-effect can't help) — compensate so they keep a
 * constant on-screen width when zoomed OUT and never vanish. */
function strokeCompensation(k: number): number {
  return Math.max(1, 1 / k);
}

/**
 * Custom read-only graph renderer: ELK lays out the DAG, we draw HTML nodes over
 * an SVG edge layer inside a single transformed "world" container. d3-zoom owns
 * the pan/zoom transform (one source of truth → no view-state drift), and gives
 * us drag-pan, wheel + pinch zoom, and programmatic fit/focus for free.
 *
 * Per-frame gestures stay out of React: the zoom handler writes the world
 * transform (and the edge stroke compensation CSS var) straight to the DOM.
 * React state holds only the discrete derivations — `compact` (labels hidden
 * below a zoom threshold) and `fitted` (first framing applied).
 */
export const ElkGraphRenderer: React.FC<ElkGraphRendererProps> = ({
  graph,
  selectedNodeName = null,
  onCanvasNodeNameChange,
  nodeToObservationsMap = {},
  currentObservationIndices = {},
  activeNodeNames = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<Transform>({ x: 0, y: 0, k: 1 });
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const selectionRef = useRef<Selection<
    HTMLDivElement,
    unknown,
    null,
    undefined
  > | null>(null);
  // THE deterministic viewport model: the rendered transform is always
  //   overrideRef.current ?? fit(layout, size)
  // The user's last explicit viewport (drag/wheel/pinch/toolbar zoom) is the
  // ONLY real state; everything else derives. No override → the fit re-applies
  // on every layout/size change (peek panels settling, divider drags, window
  // resizes can never leave a stale frame). Selection does NOT move the
  // viewport — it's a ring/glow, and under fit the node is always visible.
  // Fit button and a graph change clear the override.
  const overrideRef = useRef<Transform | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);

  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [layoutError, setLayoutError] = useState(false);
  const [layoutAttempt, setLayoutAttempt] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Discrete zoom derivation: labels hide below LABEL_HIDE_SCALE.
  const [compact, setCompact] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Keep the world hidden until the first fit is applied, so we never flash one
  // frame of the unfitted (scale-1, top-left) graph after layout resolves.
  const [fitted, setFitted] = useState(false);

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

  // Compute layout via ELK whenever the graph changes (or a retry is asked).
  useEffect(() => {
    let cancelled = false;
    setLayout(null);
    setLayoutError(false);
    setFitted(false);
    // A new graph gets a fresh fit; stale hover highlighting drops too.
    overrideRef.current = null;
    setHoveredId(null);
    computeGraphLayout(graph, nodeToObservationsMap)
      .then((result) => {
        if (!cancelled) setLayout(result);
      })
      .catch((error) => {
        console.error("Graph layout failed:", error);
        // Guarded so a superseded effect's rejection can't stomp newer state.
        if (!cancelled) setLayoutError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, nodeToObservationsMap, layoutAttempt]);

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

  // Wire up d3-zoom once (drag-pan + wheel/pinch zoom). Per-frame transform
  // updates are written imperatively to the world div — pan/zoom frames commit
  // ZERO React renders (compact/fitted bail on unchanged values).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const selection = select(el);
    const zoomBehavior = createZoom<HTMLDivElement, unknown>()
      .scaleExtent([SCALE_MIN, SCALE_MAX])
      .on("zoom", (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
        const { x, y, k } = event.transform;
        // sourceEvent is set only for real gestures (drag/wheel/pinch) — they
        // become the override; programmatic fits keep deriving.
        if (event.sourceEvent) overrideRef.current = { x, y, k };
        transformRef.current = { x, y, k };
        const world = worldRef.current;
        if (world) {
          world.style.transform = toCss(transformRef.current);
          world.style.setProperty(
            "--graph-stroke-comp",
            String(strokeCompensation(k)),
          );
        }
        setCompact(k < LABEL_HIDE_SCALE);
        // First transform (auto-fit or focus) means the graph is framed — reveal it.
        setFitted(true);
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

  // Bound panning to a generous frame around the laid-out graph so a drag can
  // never strand the user on a blank canvas (d3-zoom's default translate
  // extent is infinite).
  useEffect(() => {
    const zoomBehavior = zoomRef.current;
    if (!zoomBehavior || !layout) return;
    zoomBehavior.translateExtent([
      [-layout.width, -layout.height],
      [layout.width * 2, layout.height * 2],
    ]);
  }, [layout]);

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
    // Clamp within d3-zoom's scaleExtent — below SCALE_MIN, applyTransform
    // would write a scale d3 then snaps back on the first gesture (a jump).
    const k = Math.max(
      SCALE_MIN,
      Math.min(
        (size.width - FIT_PADDING * 2) / layout.width,
        (size.height - FIT_PADDING * 2) / layout.height,
        MAX_FIT_SCALE,
      ),
    );
    return {
      k,
      x: (size.width - layout.width * k) / 2,
      y: (size.height - layout.height * k) / 2,
    };
  }, [layout, size]);

  // THE framing effect — the whole model. The viewport derives from data:
  // no override → fit(layout, size), re-applied on every layout/size change
  // (deterministic; a peek panel settling late or a divider drag can never
  // strand a stale frame). With an override (user gesture) the view is the
  // user's — untouched until Fit or a graph change clears it.
  useEffect(() => {
    if (overrideRef.current) return;
    const fit = computeFit();
    if (fit) applyTransform(fit);
  }, [computeFit, applyTransform]);

  const handleSelect = useCallback(
    (id: string) => {
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
    onCanvasNodeNameChange?.(null);
  };

  const zoomBy = (factor: number) => {
    const selection = selectionRef.current;
    const zoomBehavior = zoomRef.current;
    if (!selection || !zoomBehavior) return;
    zoomBehavior.scaleBy(selection, factor);
    // Toolbar zoom is a user decision — it becomes the override (scaleBy goes
    // through d3 without a sourceEvent, so record it explicitly).
    if (containerRef.current) {
      const { x, y, k } = zoomTransform(containerRef.current);
      overrideRef.current = { x, y, k };
    }
  };

  const handleFit = () => {
    overrideRef.current = null;
    const fit = computeFit();
    if (fit) applyTransform(fit);
  };

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
      role="group"
      aria-label="Trace agent graph"
      className="bg-background/50 relative h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
      onPointerDown={(e) =>
        (pointerDownPos.current = { x: e.clientX, y: e.clientY })
      }
      onClick={handleBackgroundClick}
    >
      {!layout && !layoutError && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Laying out graph…
        </div>
      )}
      {layoutError && (
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
          <span>Could not lay out the graph.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation(); // don't treat the retry as a canvas deselect
              setLayoutAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {layout && (
        <div
          ref={worldRef}
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            // Seed from the last known transform so a layout-change remount
            // paints in place instead of at identity; the zoom handler owns
            // every subsequent update imperatively.
            transform: toCss(transformRef.current),
            ["--graph-stroke-comp" as string]: String(
              strokeCompensation(transformRef.current.k),
            ),
            opacity: fitted ? 1 : 0,
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
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path
                  d="M0,0 L8,4 L0,8 Z"
                  className="fill-muted-foreground/50"
                />
              </marker>
              <marker
                id="graph-arrow-active"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,0 L8,4 L0,8 Z" className="fill-primary" />
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
                  // Strokes scale with the world transform (vector-effect can't
                  // reach across the HTML ancestor) — the CSS var, written by
                  // the zoom handler, keeps them visible when zoomed out.
                  style={{
                    strokeWidth: `calc(${active ? 2 : 1.5}px * var(--graph-stroke-comp, 1))`,
                  }}
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
                active={activeNodeNames?.has(node.id) ?? false}
                compact={compact}
                onSelect={handleSelect}
                onHover={setHoveredId}
              />
            );
          })}
        </div>
      )}

      <div
        className="absolute top-2 right-2 z-10 flex flex-col gap-1"
        onClick={(e) => e.stopPropagation()} // controls shouldn't deselect
      >
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
