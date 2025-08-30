import { useState, useCallback } from "react";
import { Network, DataSet } from "vis-network/standalone";
import type { GraphCanvasData } from "../types";
import { LANGFUSE_START_NODE_NAME, LANGGRAPH_START_NODE_NAME } from "../types";

interface UseGraphPlaybackProps {
  graphData: GraphCanvasData;
  nodes: any[];
  networkRef: React.MutableRefObject<Network | null>;
}

export const useGraphPlayback = ({
  graphData,
  nodes,
  networkRef,
}: UseGraphPlaybackProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTimer, setPlaybackTimer] = useState<NodeJS.Timeout | null>(
    null,
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [playbackSequence, setPlaybackSequence] = useState<string[]>([]);
  const [nodesDataSet, setNodesDataSet] = useState<DataSet<any> | null>(null);
  const [edgesDataSet, setEdgesDataSet] = useState<DataSet<any> | null>(null);
  const [isInPlaybackMode, setIsInPlaybackMode] = useState(false);

  const buildPlaybackSequence = useCallback(
    (startNodeIds: string[]) => {
      const adj = new Map<string, string[]>();
      graphData.edges.forEach((edge) => {
        if (!adj.has(edge.from)) adj.set(edge.from, []);
        adj.get(edge.from)!.push(edge.to);
      });

      const seen = new Set<string>();
      const sequence: string[] = [];
      const queue: string[] = [];

      // Add unique start nodes to sequence and queue
      const uniqueStartNodes = [...new Set(startNodeIds)];
      uniqueStartNodes.forEach((id) => {
        seen.add(id);
        sequence.push(id);
        queue.push(id);
      });

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adj.get(current) ?? [];

        for (const neighbor of neighbors) {
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            sequence.push(neighbor);
            queue.push(neighbor);
          }
        }
      }

      return sequence;
    },
    [graphData.edges],
  );

  const convertToDataSets = useCallback(() => {
    const hiddenNodes = nodes.map((node) => ({
      ...node,
      hidden: true,
    }));

    const nodesDS = new DataSet(hiddenNodes);

    const hiddenEdges = graphData.edges.map((edge, index) => ({
      id: `edge-${edge.from}-${edge.to}-${index}`,
      ...edge,
      hidden: true,
    }));

    const edgesDS = new DataSet(hiddenEdges);

    setNodesDataSet(nodesDS);
    setEdgesDataSet(edgesDS);

    return { nodesDS, edgesDS };
  }, [nodes, graphData.edges]);

  const revealNode = useCallback(
    (
      nodeId: string,
      nodesDS: DataSet<any>,
      edgesDS: DataSet<any>,
      onComplete?: () => void,
    ) => {
      if (!nodesDS || !edgesDS || !networkRef.current) {
        onComplete?.();
        return;
      }

      // Check if node exists in DataSet
      const existingNode = nodesDS.get(nodeId);
      if (!existingNode) {
        onComplete?.();
        return;
      }

      // Update node visibility
      nodesDS.update({ id: nodeId, hidden: false });

      // Verify the update worked
      const updatedNode = nodesDS.get(nodeId);

      const connectedEdgeIds = networkRef.current.getConnectedEdges(nodeId);
      connectedEdgeIds.forEach((edgeId) => {
        const edge = edgesDS.get(edgeId);
        if (edge) {
          const fromNode = nodesDS.get(edge.from);
          const toNode = nodesDS.get(edge.to);

          if (fromNode && toNode && !fromNode.hidden && !toNode.hidden) {
            edgesDS.update({ id: edgeId, hidden: false });
          }
        }
      });

      // Force network redraw
      networkRef.current.redraw();

      // Keep the view zoomed out to show the entire graph
      networkRef.current.fit({
        animation: {
          duration: 300,
          easingFunction: "easeInOutQuad",
        },
      });

      // Use both animationFinished event and fallback timer
      let completed = false;

      const complete = () => {
        if (completed) return;
        completed = true;
        onComplete?.();
      };

      // Primary: listen for animation finished event
      networkRef.current.once("animationFinished", complete);

      // Fallback: timer in case animationFinished doesn't fire
      setTimeout(complete, 800);
    },
    [networkRef],
  );

  const startPlayback = useCallback(() => {
    if (!networkRef.current) return;

    const startNodes = [
      LANGFUSE_START_NODE_NAME,
      LANGGRAPH_START_NODE_NAME,
    ].filter((startId) => graphData.nodes.some((node) => node.id === startId));

    if (startNodes.length === 0) {
      return;
    }

    const sequence = buildPlaybackSequence(startNodes);
    setPlaybackSequence(sequence);

    const { nodesDS, edgesDS } = convertToDataSets();

    // Reveal unique start nodes
    const uniqueStartNodes = [...new Set(startNodes)];
    uniqueStartNodes.forEach((startId) => {
      nodesDS.update({ id: startId, hidden: false });
    });

    if (networkRef.current) {
      networkRef.current.setData({ nodes: nodesDS, edges: edgesDS });
      networkRef.current.redraw();
    }

    setIsInPlaybackMode(true);
    setIsPlaying(true);

    // Start from the first non-start node
    let stepIndex = uniqueStartNodes.length;
    setCurrentStep(stepIndex);

    const playStep = () => {
      if (stepIndex >= sequence.length) {
        setIsPlaying(false);
        setCurrentStep(sequence.length);
        return;
      }

      const nextNodeId = sequence[stepIndex];

      stepIndex++;
      setCurrentStep(stepIndex);

      revealNode(nextNodeId, nodesDS, edgesDS, () => {
        const timer = setTimeout(playStep, 300);
        setPlaybackTimer(timer);
      });
    };

    setTimeout(playStep, 700);
  }, [
    networkRef,
    graphData.nodes,
    buildPlaybackSequence,
    convertToDataSets,
    revealNode,
  ]);

  const pausePlayback = useCallback(() => {
    setIsPlaying(false);
    if (playbackTimer) {
      clearTimeout(playbackTimer);
      setPlaybackTimer(null);
    }
  }, [playbackTimer]);

  const resumePlayback = useCallback(() => {
    if (!isInPlaybackMode || !playbackSequence.length) return;

    setIsPlaying(true);

    const resumeStep = () => {
      if (currentStep >= playbackSequence.length) {
        setIsPlaying(false);
        return;
      }

      const nextNodeId = playbackSequence[currentStep];

      setCurrentStep((prev) => prev + 1);

      if (nodesDataSet && edgesDataSet) {
        revealNode(nextNodeId, nodesDataSet, edgesDataSet, () => {
          const timer = setTimeout(resumeStep, 300);
          setPlaybackTimer(timer);
        });
      }
    };

    setTimeout(resumeStep, 300);
  }, [
    currentStep,
    isInPlaybackMode,
    playbackSequence,
    nodesDataSet,
    edgesDataSet,
    revealNode,
  ]);

  const resetPlayback = useCallback(() => {
    setIsPlaying(false);
    setIsInPlaybackMode(false);
    setCurrentStep(0);
    setPlaybackSequence([]);
    setNodesDataSet(null);
    setEdgesDataSet(null);

    if (playbackTimer) {
      clearTimeout(playbackTimer);
      setPlaybackTimer(null);
    }

    if (networkRef.current) {
      networkRef.current.setData({ nodes, edges: graphData.edges });
      networkRef.current.fit();
    }
  }, [playbackTimer, networkRef, nodes, graphData.edges]);

  return {
    isPlaying,
    isInPlaybackMode,
    startPlayback,
    pausePlayback,
    resumePlayback,
    resetPlayback,
    playbackTimer,
  };
};
