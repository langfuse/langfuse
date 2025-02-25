import React, { useEffect, useRef, useMemo } from "react";
import { Network } from "vis-network/standalone";

import type { GraphCanvasData } from "../types";

type TraceGraphCanvasProps = {
  graph: GraphCanvasData;
  selectedNodeName: string | null;
  onCanvasNodeNameChange: (nodeName: string | null) => void;
};

export const TraceGraphCanvas: React.FC<TraceGraphCanvasProps> = (props) => {
  const { graph: graphData, selectedNodeName, onCanvasNodeNameChange } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  const nodes = useMemo(
    () =>
      graphData.nodes.map((node) => {
        const nodeData = {
          id: node,
          label: node,
        };
        if (node === "__start__") {
          return {
            ...nodeData,
            x: -200,
            y: 0,
            color: {
              border: "#166534",
              background: "#86efac",
              highlight: {
                border: "#15803d",
                background: "#4ade80",
              },
            },
          };
        }
        if (node === "__end__") {
          return {
            ...nodeData,
            x: 200,
            y: 0,
            color: {
              border: "#7f1d1d",
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
          },
        },
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

    return () => {
      networkRef.current = null;
      network.destroy();
    };
  }, [graphData, nodes, options, onCanvasNodeNameChange]);

  useEffect(() => {
    const network = networkRef.current;
    if (!network) return;

    if (selectedNodeName) {
      network.selectNodes([selectedNodeName]);
    } else {
      network.unselectAll();
    }
  }, [selectedNodeName]);

  if (!graphData.nodes.length) {
    return (
      <div className="flex h-full items-center justify-center">
        No graph data available
      </div>
    );
  }

  return <div ref={containerRef} className="h-[100%]" />;
};
