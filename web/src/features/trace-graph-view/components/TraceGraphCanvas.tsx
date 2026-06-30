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
    edge: "#94a3b8", // slate-400
  },
  dark: {
    nodeBg: "#1e293b", // slate-800
    nodeBgSelected: "#334155", // slate-700
    nodeText: "#e2e8f0", // slate-200
    edge: "#64748b", // slate-500
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

const isStartNode = (id: string) =>
  id === LANGFUSE_START_NODE_NAME || id === LANGGRAPH_START_NODE_NAME;
const isEndNode = (id: string) =>
  id === LANGFUSE_END_NODE_NAME || id === LANGGRAPH_END_NODE_NAME;

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

  // Keep ref up to date without triggering Network recreation
  useEffect(() => {
    onCanvasNodeNameChangeRef.current = onCanvasNodeNameChange;
  }, [onCanvasNodeNameChange]);

  const handleZoomIn = () => {
    if (networkRef.current) {
      const currentScale = networkRef.current.getScale();
      networkRef.current.moveTo({
        scale: currentScale * 1.2,
      });
    }
  };

  const handleZoomOut = () => {
    if (networkRef.current) {
      const currentScale = networkRef.current.getScale();
      networkRef.current.moveTo({
        scale: currentScale / 1.2,
      });
    }
  };

  const handleReset = () => {
    if (networkRef.current) {
      networkRef.current.fit({
        animation: {
          duration: 300,
          easingFunction: "easeInOutQuad",
        },
      });
    }
  };

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const palette = isDark ? PALETTE.dark : PALETTE.light;

    const nodes = graphData.nodes.map((node) => {
      const base = {
        id: node.id,
        label: node.label,
      };

      if (isStartNode(node.id)) {
        return { ...base, color: START_COLOR, font: { color: "#ffffff" } };
      }
      if (isEndNode(node.id)) {
        return { ...base, color: END_COLOR, font: { color: "#ffffff" } };
      }

      const border = TYPE_BORDER_COLOR[node.type] ?? DEFAULT_BORDER_COLOR;
      return {
        ...base,
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
          levelSeparation: 60,
          nodeSpacing: 175,
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
      },
      nodes: {
        shape: "box",
        margin: {
          top: 10,
          right: 10,
          bottom: 10,
          left: 10,
        },
        borderWidth: 1.5,
        shapeProperties: {
          borderRadius: 6,
        },
        // Cap node width so long span names wrap instead of stretching the
        // node (and distorting the whole layout) into one giant box.
        widthConstraint: {
          maximum: 220,
        },
        font: {
          size: 14,
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
        width: 1.5,
        color: {
          color: palette.edge,
        },
        smooth: false,
        selectionWidth: 0,
        chosen: false,
      },
    };

    const nodesDataSet = new DataSet(nodes);
    nodesDataSetRef.current = nodesDataSet;

    // Create the network
    const network = new Network(
      containerRef.current,
      { ...graphData, nodes: nodesDataSet },
      options,
    );
    networkRef.current = network;

    // Frame the (already laid-out) graph once, without animation.
    network.once("afterDrawing", () => network.fit());

    // Use click event instead of selectNode/deselectNode to handle cycling properly
    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        // Node was clicked
        onCanvasNodeNameChangeRef.current(params.nodes[0]);
      } else {
        // Empty area was clicked
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
        constrainView();
      }
    });

    network.on("zoom", () => {
      constrainView();
    });

    // force redraw on resetting view
    const handleResize = () => {
      if (network) {
        network.redraw();
        network.fit();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
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
        const isSystemNode =
          node.id === LANGFUSE_START_NODE_NAME ||
          node.id === LANGFUSE_END_NODE_NAME ||
          node.id === LANGGRAPH_START_NODE_NAME ||
          node.id === LANGGRAPH_END_NODE_NAME;

        if (isSystemNode) return;

        const observations = nodeToObservationsMap[node.id] || [];
        const currentIndex = currentObservationIndices[node.id] || 0;
        const counter =
          observations.length > 1
            ? ` (${observations.length - currentIndex}/${observations.length})`
            : "";

        const newLabel = `${node.label}${counter}`;
        updates.push({ id: node.id, label: newLabel });
      });

      if (updates.length > 0) {
        nodesDataSet.update(updates);
      }
    } catch (error) {
      console.error("Error updating node labels:", error);
    }
  }, [graphData.nodes, nodeToObservationsMap, currentObservationIndices]);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;

    if (selectedNodeName) {
      // Validate that the node exists before trying to select it
      const nodeExists = graphData.nodes.some(
        (node) => node.id === selectedNodeName,
      );

      if (nodeExists) {
        try {
          network.selectNodes([selectedNodeName]);
        } catch (error) {
          console.error("Error selecting node:", selectedNodeName, error);
          // Fallback to clearing selection
          network.unselectAll();
        }
      } else {
        console.warn(
          "Cannot select node that doesn't exist:",
          selectedNodeName,
        );
        network.unselectAll();
      }
    } else {
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
      className="relative h-full min-h-[50dvh] w-full pb-2"
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
