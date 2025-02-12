import React, { useEffect, useRef } from "react";
import { Network } from "vis-network/standalone";

import type { GraphCanvasData } from "./types";

type TraceGraphCanvasProps = {
  graph: GraphCanvasData;
  selectedNodeName: string | null;
  onCanvasNodeNameChange: (nodeName: string | null) => void;
};

export const TraceGraphCanvas: React.FC<TraceGraphCanvasProps> = (props) => {
  const { graph: graphData, selectedNodeName, onCanvasNodeNameChange } = props;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const options = {
      layout: {
        randomSeed: 1,
      },
      physics: {
        enabled: true,
        stabilization: {
          iterations: 500,
        },
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
        color: {
          border: "#1e3a8a",
          background: "#93c5fd",
          highlight: {
            border: "#1e40af",
            background: "#60a5fa",
            borderWidth: 5,
          },
        },
        font: {
          size: 14,
          face: "arial",
          color: "#000000",
          highlight: {
            size: 16,
            bold: true,
          },
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
    };

    // Position start and end nodes
    const nodes = graphData.nodes.map((node) => {
      if (node.label === "__start__") {
        return {
          ...node,
          x: -200,
          y: 0,
          color: {
            border: "#166534",
            background: "#86efac",
            highlight: {
              border: "#15803d",
              background: "#4ade80",
              borderWidth: 5,
            },
          },
        };
      }
      if (node.label === "__end__") {
        return {
          ...node,
          x: 200,
          y: 0,
          color: {
            border: "#7f1d1d",
            background: "#fecaca",
            highlight: {
              border: "#991b1b",
              background: "#fca5a5",
              borderWidth: 5,
            },
          },
        };
      }
      return node;
    });

    // Create the network
    const network = new Network(
      containerRef?.current!,
      { ...graphData, nodes },
      options,
    );

    // Handle node selection
    network.on("selectNode", (params) => {
      onCanvasNodeNameChange(params.nodes[0]);
    });

    network.on("deselectNode", () => {
      onCanvasNodeNameChange(null);
    });

    // Update selected node when prop changes
    if (selectedNodeName) {
      network.selectNodes([selectedNodeName]);
    } else {
      network.unselectAll();
    }

    return () => {
      network.destroy();
    };
  }, [graphData, onCanvasNodeNameChange, selectedNodeName]);

  return (
    <div
      ref={containerRef}
      className="h-[100%] rounded-lg border border-border"
    />
  );
};
