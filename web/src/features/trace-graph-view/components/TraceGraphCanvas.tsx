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
};

export const TraceGraphCanvas: React.FC<TraceGraphCanvasProps> = (props) => {
  const { graph: graphData, selectedNodeName, onCanvasNodeNameChange } = props;
  const [isHovering, setIsHovering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  const getNodeStyle = (nodeType: string) => {
    switch (nodeType) {
      case "AGENT":
        return {
          border: "#9333ea", // purple-600 (text-purple-600)
          background: "#c4b5fd", // purple-300
          highlight: { border: "#7c3aed", background: "#a78bfa" },
        };
      case "TOOL":
        return {
          border: "#ea580c", // orange-600 (text-orange-600)
          background: "#fed7aa", // orange-300
          highlight: { border: "#dc2626", background: "#fdba74" },
        };
      case "GENERATION":
        return {
          border: "#c026d3", // magenta/fuchsia-600 (text-muted-magenta)
          background: "#f0abfc", // fuchsia-300
          highlight: { border: "#a21caf", background: "#e879f9" },
        };
      case "SPAN":
        return {
          border: "#2563eb", // blue-600 (text-muted-blue)
          background: "#93c5fd", // blue-300
          highlight: { border: "#1d4ed8", background: "#60a5fa" },
        };
      case "CHAIN":
        return {
          border: "#db2777", // pink-600 (text-pink-600)
          background: "#f9a8d4", // pink-300
          highlight: { border: "#be185d", background: "#f472b6" },
        };
      case "RETRIEVER":
        return {
          border: "#0d9488", // teal-600 (text-teal-600)
          background: "#5eead4", // teal-300
          highlight: { border: "#0f766e", background: "#2dd4bf" },
        };
      case "EVENT":
        return {
          border: "#059669", // green-600 (text-muted-green)
          background: "#6ee7b7", // green-300
          highlight: { border: "#047857", background: "#34d399" },
        };
      case "EMBEDDING":
        return {
          border: "#d97706", // amber-600 (text-amber-600)
          background: "#fbbf24", // amber-300
          highlight: { border: "#b45309", background: "#f59e0b" },
        };
      case "GUARDRAIL":
        return {
          border: "#dc2626", // red-600 (text-red-600)
          background: "#fca5a5", // red-300
          highlight: { border: "#b91c1c", background: "#f87171" },
        };
      case "LANGGRAPH_SYSTEM":
        return {
          border: "#374151", // gray
          background: "#d1d5db",
          highlight: { border: "#1f2937", background: "#9ca3af" },
        };
      default:
        return {
          border: "#1e3a8a", // default blue
          background: "#93c5fd",
          highlight: { border: "#1e40af", background: "#60a5fa" },
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
        enabled: true,
        stabilization: {
          iterations: 500,
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
    [],
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
    // Create the network
    const network = new Network(
      containerRef?.current!,
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
