import type { APIScore, Trace } from "@langfuse/shared";
import { z } from "zod";
import React, { useEffect, useState } from "react";
import { TraceGraphCanvas } from "./TraceGraphCanvas";
import type { GraphCanvasData } from "./types";
import { Trace as TraceView } from "@/src/components/trace";
import type { ObservationReturnType } from "@/src/server/api/routers/traces";
import { StringParam, useQueryParam } from "use-query-params";

type TraceGraphViewProps = {
  observations: Array<ObservationReturnType>;
  trace: Omit<Trace, "input" | "output"> & {
    input: string | undefined;
    output: string | undefined;
  };
  scores: APIScore[];
  projectId: string;
};

const LANGGRAPH_NODE_TAG = "langgraph_node";
const LANGGRAPH_STEP_TAG = "langgraph_step";

const LanggraphMetadataSchema = z.object({
  [LANGGRAPH_NODE_TAG]: z.string(),
  [LANGGRAPH_STEP_TAG]: z.number(),
});

export const TraceGraphView: React.FC<TraceGraphViewProps> = (props) => {
  const { trace, observations, scores, projectId } = props;
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const { graph, nodeToParentObservationMap } = parseGraph({ observations });

  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );

  useEffect(() => {
    const currentObservation = observations.find(
      (o) => o.id === currentObservationId,
    );
    const nodeName =
      currentObservation &&
      LanggraphMetadataSchema.safeParse(currentObservation.metadata).data?.[
        LANGGRAPH_NODE_TAG
      ];

    setSelectedNodeName(nodeName ?? null);
  }, [currentObservationId, observations]);

  return (
    <div className="grid h-full grid-rows-[1fr_1.618fr] gap-4">
      <TraceGraphCanvas
        graph={graph}
        selectedNodeName={selectedNodeName}
        setSelectedNodeName={setSelectedNodeName}
        onCanvasNodeNameChange={(nodeName: string | null) => {
          setSelectedNodeName(nodeName);

          if (nodeName) {
            const nodeParentObservationId =
              nodeToParentObservationMap[nodeName];

            if (nodeParentObservationId)
              setCurrentObservationId(nodeParentObservationId);
          }
        }}
      />
      <div className="h-full overflow-y-auto">
        <TraceView
          key={trace.id}
          trace={trace}
          scores={scores}
          projectId={projectId}
          observations={observations}
          defaultMinObservationLevel="DEBUG"
        />
      </div>
    </div>
  );
};

function parseGraph(params: {
  observations: TraceGraphViewProps["observations"];
}): {
  graph: GraphCanvasData;
  nodeToParentObservationMap: Record<string, string>;
} {
  const { observations } = params;

  const nodes = new Set<string>(["__end__"]);
  const stepToNode = new Map<number, string>();
  const adjByNode = new Map<string, Map<string | null, string[]>>();

  observations?.forEach((o) => {
    const parsedMetadata = LanggraphMetadataSchema.safeParse(o.metadata);

    if (!parsedMetadata.success) {
      return;
    }
    const { [LANGGRAPH_NODE_TAG]: node, [LANGGRAPH_STEP_TAG]: step } =
      parsedMetadata.data;

    nodes.add(node);
    stepToNode.set(step, node);

    const adj = adjByNode.get(node) ?? new Map<string | null, string[]>();
    adj.set(o.id, [...(adj.get(o.id) ?? [])]);
    adj.set(o.parentObservationId, [
      o.id,
      ...(adj.get(o.parentObservationId) ?? []),
    ]);
    adjByNode.set(node, adj);
  });

  const edges: [string, string][] = [];

  // Infer edges from the step indicator
  Array.from(stepToNode.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([_, node], idx, arr) => {
      edges.push([node, idx === arr.length - 1 ? "__end__" : arr[idx + 1][1]]);
    });

  // Get the parent observation ID for a given node
  const nodeToParentObservationMap = Object.fromEntries(
    [...adjByNode.entries()].map(([node, adj]) => {
      for (const [parentId, children] of adj.entries()) {
        if (parentId && children.length === 0) return [node, parentId];
      }

      return [];
    }),
  );

  return {
    graph: {
      nodes: new Array(...nodes).map((n) => ({ id: n, label: n })),
      edges: edges.map((e) => ({ from: e[0], to: e[1], arrows: "to" })),
    },
    nodeToParentObservationMap,
  };
}
