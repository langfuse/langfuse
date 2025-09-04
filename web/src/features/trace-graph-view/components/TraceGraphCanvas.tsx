import React, { useEffect, useRef, useMemo, useState } from "react";
import { Network } from "vis-network/standalone";
import { ZoomIn, ZoomOut } from "lucide-react";

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
};

export const TraceGraphCanvas: React.FC<TraceGraphCanvasProps> = (props) => {
  const {
    graph: graphData,
    selectedNodeName,
    onCanvasNodeNameChange,
    disablePhysics = false,
  } = props;
  const [isHovering, setIsHovering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

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
        borderWidth: 1,
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

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    // Create the network
    const network = new Network(
      containerRef.current,
      { ...graphData, nodes },
      options,
    );
    networkRef.current = network;

    network.on("selectNode", (params) => {
      onCanvasNodeNameChange(params.nodes[0]);
    });

    network.on("deselectNode", () => {
      onCanvasNodeNameChange(null);
    });

    // Add window resize handler to force network redraw
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
      network.destroy();
    };
  }, [graphData, nodes, options, onCanvasNodeNameChange]);

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
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
};
