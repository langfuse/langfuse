import React, { useEffect, useRef, useMemo, useState } from "react";
import { Network, DataSet } from "vis-network/standalone";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

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
  disablePhysics?: boolean;
  nodeToObservationsMap?: Record<string, string[]>;
  currentObservationIndices?: Record<string, number>;
};

export const TraceGraphCanvas: React.FC<TraceGraphCanvasProps> = (props) => {
  const {
    graph: graphData,
    selectedNodeName,
    onCanvasNodeNameChange,
    disablePhysics = false,
    nodeToObservationsMap = {},
    currentObservationIndices = {},
  } = props;
  const [isHovering, setIsHovering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDataSetRef = useRef<DataSet<any> | null>(null);
  const onCanvasNodeNameChangeRef = useRef(onCanvasNodeNameChange);

  // Keep ref up to date without triggering Network recreation
  useEffect(() => {
    onCanvasNodeNameChangeRef.current = onCanvasNodeNameChange;
  }, [onCanvasNodeNameChange]);

  const getNodeStyle = (nodeType: string) => {
    switch (nodeType) {
      case "AGENT":
        return {
          border: "#c4b5fd", // purple-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#a78bfa", background: "#e5e7eb" }, // gray-200
        };
      case "TOOL":
        return {
          border: "#fed7aa", // orange-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#fdba74", background: "#e5e7eb" }, // gray-200
        };
      case "GENERATION":
        return {
          border: "#f0abfc", // fuchsia-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#e879f9", background: "#e5e7eb" }, // gray-200
        };
      case "SPAN":
        return {
          border: "#93c5fd", // blue-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#60a5fa", background: "#e5e7eb" }, // gray-200
        };
      case "CHAIN":
        return {
          border: "#f9a8d4", // pink-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#f472b6", background: "#e5e7eb" }, // gray-200
        };
      case "RETRIEVER":
        return {
          border: "#5eead4", // teal-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#2dd4bf", background: "#e5e7eb" }, // gray-200
        };
      case "EVENT":
        return {
          border: "#6ee7b7", // green-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#34d399", background: "#e5e7eb" }, // gray-200
        };
      case "EMBEDDING":
        return {
          border: "#fbbf24", // amber-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#f59e0b", background: "#e5e7eb" }, // gray-200
        };
      case "GUARDRAIL":
        return {
          border: "#fca5a5", // red-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#f87171", background: "#e5e7eb" }, // gray-200
        };
      case "LANGGRAPH_SYSTEM":
        return {
          border: "#d1d5db", // gray (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#9ca3af", background: "#e5e7eb" }, // gray-200
        };
      default:
        return {
          border: "#93c5fd", // blue-300 (former background)
          background: "#f3f4f6", // gray-100
          highlight: { border: "#60a5fa", background: "#e5e7eb" }, // gray-200
        };
    }
  };

  const nodes = useMemo(
    () =>
      graphData.nodes.map((node) => {
        const nodeData = {
          id: node.id,
          label: node.label,
          color: getNodeStyle(node.type),
        };

        // Special positioning and colors for system nodes
        if (
          node.id === LANGFUSE_START_NODE_NAME ||
          node.id === LANGGRAPH_START_NODE_NAME
        ) {
          return {
            ...nodeData,
            x: -200,
            y: 0,
            color: {
              border: "#166534", // green
              background: "#86efac",
              highlight: {
                border: "#15803d",
                background: "#4ade80",
              },
            },
          };
        }
        if (
          node.id === LANGFUSE_END_NODE_NAME ||
          node.id === LANGGRAPH_END_NODE_NAME
        ) {
          return {
            ...nodeData,
            x: 200,
            y: 0,
            color: {
              border: "#7f1d1d", // red
              background: "#fecaca",
              highlight: {
                border: "#991b1b",
                background: "#fca5a5",
              },
            },
          };
        }
        return nodeData;
      }),
    [graphData.nodes],
  );

  const options = useMemo(
    () => ({
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
        enabled: !disablePhysics,
        stabilization: {
          iterations: disablePhysics ? 0 : 500,
        },
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
        borderWidth: 2,
        font: {
          size: 14,
          color: "#000000",
        },
        shadow: {
          enabled: true,
          color: "rgba(0,0,0,0.2)",
          size: 3,
          x: 3,
          y: 3,
        },
        scaling: {
          label: {
            enabled: true,
            min: 14,
            max: 16,
          },
        },
      },
      edges: {
        arrows: {
          to: { enabled: true, scaleFactor: 0.5 },
        },
        width: 1.5,
        color: {
          color: "#64748b",
        },
        selectionWidth: 0,
        chosen: false,
      },
    }),
    [disablePhysics],
  );

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

    const nodesDataSet = new DataSet(nodes);
    nodesDataSetRef.current = nodesDataSet;

    // Create the network
    const network = new Network(
      containerRef.current,
      { ...graphData, nodes: nodesDataSet },
      options,
    );
    networkRef.current = network;

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
  }, [graphData, nodes, options]);

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
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
          <Button
            onClick={handleZoomIn}
            variant="ghost"
            size="icon"
            className="p-1.5 shadow-md dark:shadow-border"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleZoomOut}
            variant="ghost"
            size="icon"
            className="p-1.5 shadow-md dark:shadow-border"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleReset}
            variant="ghost"
            size="icon"
            className="p-1.5 shadow-md dark:shadow-border"
            title="Reset view"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
