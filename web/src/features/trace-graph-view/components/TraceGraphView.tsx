import React, { useEffect, useState, useMemo, useCallback } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import type { APIScore, Trace } from "@langfuse/shared";
import type { ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";

import { TraceGraphCanvas } from "./TraceGraphCanvas";
import {
  type GraphCanvasData,
  LANGGRAPH_STEP_TAG,
  LANGGRAPH_NODE_TAG,
  LANGGRAPH_END_NODE_NAME,
  LanggraphMetadataSchema,
} from "../types";

type TraceGraphViewProps = {
  observations: ObservationReturnTypeWithMetadata[];
  trace: Omit<Trace, "input" | "output"> & {
    input: string | undefined;
    output: string | undefined;
  };
  scores: APIScore[];
  projectId: string;
};

export const TraceGraphView: React.FC<TraceGraphViewProps> = (props) => {
  const { observations } = props;
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null);
  const { graph, nodeToParentObservationMap } = useMemo(
    () => parseGraph({ observations }),
    [observations],
  );

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

  const onCanvasNodeNameChange = useCallback(
    (nodeName: string | null) => {
      setSelectedNodeName(nodeName);

      if (nodeName) {
        const nodeParentObservationId = nodeToParentObservationMap[nodeName];

        if (nodeParentObservationId)
          setCurrentObservationId(nodeParentObservationId);
      }
    },
    [nodeToParentObservationMap, setCurrentObservationId],
  );

  return (
    <div className="grid h-full w-full gap-4">
      <TraceGraphCanvas
        graph={graph}
        selectedNodeName={selectedNodeName}
        onCanvasNodeNameChange={onCanvasNodeNameChange}
      />
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

  const stepToNodeMap = new Map<number, string>();
  const nodeToParentObservationMap = new Map<string, string>();

  observations?.forEach((o) => {
    const parsedMetadata = LanggraphMetadataSchema.safeParse(o.metadata);

    if (!parsedMetadata.success) return;

    const { [LANGGRAPH_NODE_TAG]: node, [LANGGRAPH_STEP_TAG]: step } =
      parsedMetadata.data;

    stepToNodeMap.set(step, node);

    // Check if parent is in the same node. If not, observation must be top-most observation of the node
    if (o.parentObservationId) {
      const parent = observations.find(
        (obs) => obs.id === o.parentObservationId,
      );
      const parsedParentMetadata = LanggraphMetadataSchema.safeParse(
        parent?.metadata,
      );

      if (parent && !parsedParentMetadata.success) {
        nodeToParentObservationMap.set(LANGGRAPH_END_NODE_NAME, parent.id);
      }

      if (
        !parsedParentMetadata.success ||
        parsedParentMetadata.data[LANGGRAPH_NODE_TAG] !== node
      ) {
        nodeToParentObservationMap.set(node, o.id);
      }
    } else {
      nodeToParentObservationMap.set(node, o.id);
    }
  });

  const nodes = [...nodeToParentObservationMap.keys()];
  const edges = [...stepToNodeMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([_, node], idx, arr) => ({
      from: node,
      to: idx === arr.length - 1 ? LANGGRAPH_END_NODE_NAME : arr[idx + 1][1],
    }));

  return {
    graph: {
      nodes,
      edges,
    },
    nodeToParentObservationMap: Object.fromEntries(
      nodeToParentObservationMap.entries(),
    ),
  };
}
