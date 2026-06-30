import React, { useEffect, useRef, useState } from "react";
import { Network, DataSet } from "vis-network/standalone";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import { useTheme } from "next-themes";

import type { GraphCanvasData } from "../types";
import {
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
  LANGGRAPH_START_NODE_NAME,
  LANGGRAPH_END_NODE_NAME,
} from "../types";
import { Button } from "@/src/components/ui/button";

type TraceGraphCanvasProps = {
  graph: GraphCanvasData;
  selectedNodeName: string | null;
  onCanvasNodeNameChange: (nodeName: string | null) => void;
  nodeToObservationsMap?: Record<string, string[]>;
  currentObservationIndices?: Record<string, number>;
};

/**
 * Per-observation-type accent colors, kept in sync with the canonical
 * trace-UI type colors in `ItemBadge.tsx` (the -600 family). vis-network is
 * canvas-based and can't consume Tailwind classes, so the hex values are
 * mirrored here.
 */
const TYPE_BORDER_COLOR: Record<string, string> = {
  AGENT: "#9333ea", // purple-600
  TOOL: "#ea580c", // orange-600
  GENERATION: "#c026d3", // fuchsia-600
  SPAN: "#2563eb", // blue-600
  CHAIN: "#db2777", // pink-600
  RETRIEVER: "#0d9488", // teal-600
  EVENT: "#16a34a", // green-600
  EMBEDDING: "#d97706", // amber-600
  GUARDRAIL: "#dc2626", // red-600
  LANGGRAPH_SYSTEM: "#94a3b8", // slate-400
};
const DEFAULT_BORDER_COLOR = "#2563eb"; // blue-600

/**
 * Light/dark surfaces, kept close to the app's slate palette so the canvas
 * reads consistently with the rest of the trace UI in both themes.
 */
const PALETTE = {
  light: {
    nodeBg: "#f1f5f9", // slate-100
    nodeBgSelected: "#e2e8f0", // slate-200
    nodeText: "#0f172a", // slate-900
    edge: "rgba(100,116,139,0.55)", // slate-500, dimmed
    edgeHighlight: "#2563eb", // blue-600
  },
  dark: {
    nodeBg: "#1e293b", // slate-800
    nodeBgSelected: "#334155", // slate-700
    nodeText: "#e2e8f0", // slate-200
    edge: "rgba(148,163,184,0.5)", // slate-400, dimmed
    edgeHighlight: "#60a5fa", // blue-400
  },
} as const;

// Saturated start/end markers that read on both themes (white label on fill).
const START_COLOR = {
  border: "#15803d", // green-700
  background: "#16a34a", // green-600
  highlight: { border: "#166534", background: "#22c55e" },
};
const END_COLOR = {
  border: "#b91c1c", // red-700
  background: "#dc2626", // red-600
  highlight: { border: "#991b1b", background: "#ef4444" },
};

const BASE_FONT_SIZE = 14;
// Below this zoom scale, labels are unreadable noise — hide them and show only
// the node shapes/colors (structure). Zoom in past it to reveal labels again.
const LABEL_HIDE_SCALE = 0.62;
const MAX_LABEL_LENGTH = 28;
// When revealing a selection from a zoomed-out overview, settle at one
// consistent readable scale, so navigating between nodes pans rather than
// re-zooms (avoids "zoom jumping").
const SELECTION_REVEAL_SCALE = 0.9;

const isStartNode = (id: string) =>
  id === LANGFUSE_START_NODE_NAME || id === LANGGRAPH_START_NODE_NAME;
const isEndNode = (id: string) =>
  id === LANGFUSE_END_NODE_NAME || id === LANGGRAPH_END_NODE_NAME;
const isSystemNode = (id: string) => isStartNode(id) || isEndNode(id);

const truncate = (value: string) =>
  value.length > MAX_LABEL_LENGTH
    ? `${value.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`
    : value;

export const TraceGraphCanvas: React.FC<TraceGraphCanvasProps> = (props) => {
  const {
    graph: graphData,
    selectedNodeName,
    onCanvasNodeNameChange,
    nodeToObservationsMap = {},
    currentObservationIndices = {},
  } = props;
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [isHovering, setIsHovering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDataSetRef = useRef<DataSet<any> | null>(null);
  const onCanvasNodeNameChangeRef = useRef(onCanvasNodeNameChange);
  // True once the user has panned/zoomed — stops auto-fit from yanking the view.
  const userControlledRef = useRef(false);
  // The node id (or null for an empty-area click) of the latest in-canvas
  // click. The selection effect re-frames only when the incoming selection
  // does NOT match this — i.e. it came from the tree/timeline, not the canvas.
  const lastCanvasClickRef = useRef<string | null | undefined>(undefined);
  // Whether labels are currently hidden (zoomed out); avoids redundant updates.
  const labelsHiddenRef = useRef(false);

  // Keep ref up to date without triggering Network recreation
  useEffect(() => {
    onCanvasNodeNameChangeRef.current = onCanvasNodeNameChange;
  }, [onCanvasNodeNameChange]);

  const handleZoomIn = () => {
    if (networkRef.current) {
      userControlledRef.current = true;
      const currentScale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: currentScale * 1.2 });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      userControlledRef.current = true;
      const currentScale = networkRef.current.getScale();
      networkRef.current.moveTo({ scale: currentScale / 1.2 });
    }
  };

  const handleReset = () => {
    if (networkRef.current) {
      // Re-enable auto-fit: the user asked to frame everything again.
      userControlledRef.current = false;
      networkRef.current.fit({
        animation: { duration: 300, easingFunction: "easeInOutQuad" },
      });
    }
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const palette = isDark ? PALETTE.dark : PALETTE.light;

    const nodes = graphData.nodes.map((node) => {
      // Keep nodes compact and uniform: truncate the label. Only carry a
      // tooltip when it adds information (the full name behind a truncated
      // label); a tooltip echoing the visible label is just noise.
      const label = truncate(node.label);
      const titleProp = label === node.label ? {} : { title: node.label };

      if (isStartNode(node.id)) {
        return {
          id: node.id,
          label,
          ...titleProp,
          color: START_COLOR,
          font: { color: "#ffffff" },
        };
      }
      if (isEndNode(node.id)) {
        return {
          id: node.id,
          label,
          ...titleProp,
          color: END_COLOR,
          font: { color: "#ffffff" },
        };
      }

      const border = TYPE_BORDER_COLOR[node.type] ?? DEFAULT_BORDER_COLOR;
      return {
        id: node.id,
        label,
        ...titleProp,
        color: {
          border,
          background: palette.nodeBg,
          highlight: { border, background: palette.nodeBgSelected },
        },
      };
    });

    // Deterministic hierarchical layout with physics disabled: nodes appear
    // laid out, not settling. No force simulation = no jiggle and no idle CPU.
    const options = {
      autoResize: true,
      layout: {
        hierarchical: {
          enabled: true,
          direction: "UD", // Up-Down (top to bottom)
          levelSeparation: 90,
          nodeSpacing: 180,
          sortMethod: "hubsize",
          shakeTowards: "roots",
        },
        randomSeed: 1,
      },
      physics: {
        enabled: false,
      },
      interaction: {
        zoomView: false,
        // Layout is fixed/deterministic — let drags pan the view rather than
        // shuffle nodes (which would only slide along the level axis anyway).
        dragNodes: false,
        // Hovering or selecting a node highlights its connected edges, so its
        // relations stand out from the rest of the graph.
        hover: true,
        hoverConnectedEdges: true,
        selectConnectedEdges: true,
      },
      nodes: {
        shape: "box",
        margin: { top: 10, right: 10, bottom: 10, left: 10 },
        borderWidth: 1.5,
        borderWidthSelected: 3,
        shapeProperties: {
          borderRadius: 6,
        },
        font: {
          size: BASE_FONT_SIZE,
          color: palette.nodeText,
        },
        shadow: {
          enabled: false,
        },
      },
      edges: {
        arrows: {
          to: { enabled: true, scaleFactor: 0.5 },
        },
        width: 1,
        selectionWidth: 1.5,
        color: {
          color: palette.edge,
          highlight: palette.edgeHighlight,
          hover: palette.edgeHighlight,
        },
        smooth: false,
      },
    };

    const nodesDataSet = new DataSet<any>(nodes);
    nodesDataSetRef.current = nodesDataSet;

    // Create the network
    const network = new Network(
      containerRef.current,
      { ...graphData, nodes: nodesDataSet },
      options,
    );
    networkRef.current = network;

    // Hide/show labels based on zoom, so a zoomed-out graph shows clean
    // structure instead of a wall of unreadable text. Toggling the font *colour*
    // (not size) keeps node geometry fixed, so the layout never shifts — no
    // jump when crossing the threshold mid-zoom. (Start/end nodes set their own
    // white font per-node, so their markers stay visible.)
    const updateLabelVisibility = () => {
      const hide = network.getScale() < LABEL_HIDE_SCALE;
      if (hide === labelsHiddenRef.current) return;
      labelsHiddenRef.current = hide;
      network.setOptions({
        nodes: { font: { color: hide ? "rgba(0,0,0,0)" : palette.nodeText } },
      });
    };

    // Use click event instead of selectNode/deselectNode to handle cycling properly
    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        // Remember the clicked node so the selection effect doesn't re-frame
        // on the resulting selection change.
        lastCanvasClickRef.current = params.nodes[0];
        onCanvasNodeNameChangeRef.current(params.nodes[0]);
      } else {
        // Empty area was clicked
        lastCanvasClickRef.current = null;
        onCanvasNodeNameChangeRef.current(null);
        network.unselectAll();
      }
    });

    // Prevent dragging the view completely out of bounds
    // this resets the graph position so that always a little bit is visible
    const constrainView = () => {
      const position = network.getViewPosition();
      const scale = network.getScale();
      const container = containerRef.current;

      if (!container) return;
      const containerRect = container.getBoundingClientRect();

      const nodePositions = network.getPositions();
      const nodeIds = Object.keys(nodePositions);

      if (nodeIds.length === 0) {
        return;
      }

      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;

      nodeIds.forEach((nodeId) => {
        const pos = nodePositions[nodeId];
        minX = Math.min(minX, pos.x);
        maxX = Math.max(maxX, pos.x);
        minY = Math.min(minY, pos.y);
        maxY = Math.max(maxY, pos.y);
      });

      // Add some padding for node sizes (approximate node width/height)
      const nodePadding = 100;
      const graphWidth = (maxX - minX + nodePadding * 2) * scale;
      const graphHeight = (maxY - minY + nodePadding * 2) * scale;

      // max amount that a graph can be dragged on respective axis
      const maxDragX = (containerRect.width / 2 + graphWidth * 0.35) / scale;
      const maxDragY = (containerRect.height / 2 + graphHeight * 0.35) / scale;

      // Clamp position within bounds
      const constrainedX = Math.max(-maxDragX, Math.min(maxDragX, position.x));
      const constrainedY = Math.max(-maxDragY, Math.min(maxDragY, position.y));

      if (constrainedX !== position.x || constrainedY !== position.y) {
        network.moveTo({
          position: { x: constrainedX, y: constrainedY },
          scale: scale,
          animation: false,
        });
      }
    };

    // Apply constraints after drag ends
    network.on("dragEnd", (params) => {
      // only if dragging graph not nodes
      if (params.nodes.length === 0) {
        userControlledRef.current = true;
        constrainView();
      }
    });

    // Only toggle labels on zoom. Do NOT constrain the view here: clamping the
    // position inside the zoom handler fights the zoom buttons (each moveTo
    // re-fires zoom), which makes zooming "jump around". Bounds are enforced on
    // drag end instead.
    network.on("zoom", () => {
      updateLabelVisibility();
    });

    // Auto-fit on (re)size until the user takes control. This also fixes the
    // initial render, where the panel gets its real size a tick after mount
    // (a single mount-time fit() framed the graph against the wrong size).
    let rafId = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el || el.clientWidth === 0 || el.clientHeight === 0) return;
        if (!userControlledRef.current) {
          network.fit();
          updateLabelVisibility();
        }
      });
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      networkRef.current = null;
      nodesDataSetRef.current = null;
      network.destroy();
    };
  }, [graphData, isDark]);

  // Update node labels when observation indices change, without recreating network
  useEffect(() => {
    const nodesDataSet = nodesDataSetRef.current;
    if (!nodesDataSet) return;

    try {
      const updates: { id: string; label: string }[] = [];

      graphData.nodes.forEach((node) => {
        if (isSystemNode(node.id)) return;

        const observations = nodeToObservationsMap[node.id] || [];
        const currentIndex = currentObservationIndices[node.id] || 0;
        const counter =
          observations.length > 1
            ? ` (${observations.length - currentIndex}/${observations.length})`
            : "";

        const newLabel = `${truncate(node.label)}${counter}`;
        updates.push({ id: node.id, label: newLabel });
      });

      if (updates.length > 0) {
        nodesDataSet.update(updates);
      }
    } catch (error) {
      console.error("Error updating node labels:", error);
    }
  }, [graphData.nodes, nodeToObservationsMap, currentObservationIndices]);

  // Reflect external selection (tree/timeline) in the graph: select the node,
  // bring it into view, and highlight its relations.
  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;

    // The selection matches the last in-canvas click → it originated here, so
    // don't re-frame. Anything else came from the tree/timeline.
    const cameFromClick = lastCanvasClickRef.current === selectedNodeName;
    lastCanvasClickRef.current = undefined;

    const animation = {
      duration: 300,
      easingFunction: "easeInOutQuad" as const,
    };

    const nodeExists =
      !!selectedNodeName &&
      graphData.nodes.some((node) => node.id === selectedNodeName);

    if (!selectedNodeName || !nodeExists) {
      network.unselectAll();
      // External deselection (e.g. selecting the trace root) returns to the
      // full-graph overview; an in-canvas empty click just clears selection.
      if (!cameFromClick) {
        userControlledRef.current = false;
        network.fit({ animation });
      }
      return;
    }

    try {
      network.selectNodes([selectedNodeName]);

      // Re-frame only for selections from the tree/timeline (an in-canvas click
      // shouldn't move the view). Pan to the node at the CURRENT zoom — or, when
      // zoomed out below readability, settle at one consistent reveal scale.
      // Keeping the scale fixed across selections means navigating pans rather
      // than re-zooms, so the view doesn't jump.
      if (!cameFromClick) {
        userControlledRef.current = true;
        const currentScale = network.getScale();
        const scale =
          currentScale >= LABEL_HIDE_SCALE
            ? currentScale
            : SELECTION_REVEAL_SCALE;
        network.focus(selectedNodeName, { scale, animation });
      }
    } catch (error) {
      console.error("Error selecting node:", selectedNodeName, error);
      network.unselectAll();
    }
  }, [selectedNodeName, graphData.nodes]);

  if (!graphData.nodes.length) {
    return (
      <div className="flex h-full items-center justify-center">
        No graph data available
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full pb-2"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {isHovering && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <Button
            onClick={handleZoomIn}
            variant="outline"
            size="icon"
            className="bg-background/80 h-7 w-7 backdrop-blur"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleZoomOut}
            variant="outline"
            size="icon"
            className="bg-background/80 h-7 w-7 backdrop-blur"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleReset}
            variant="outline"
            size="icon"
            className="bg-background/80 h-7 w-7 backdrop-blur"
            title="Fit to view"
          >
            <Maximize className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
