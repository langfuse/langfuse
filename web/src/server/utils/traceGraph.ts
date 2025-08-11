/**
 * Trace Graph Processing Utilities
 *
 * Contains logic for processing trace graph data that doesn't require database queries.
 * ONLY BACKEND
 */

import { GraphObservationTypes } from "@langfuse/shared";

export interface GraphNode {
  id: string;
  name: string;
  parent_observation_id?: string;
  type?: string;
  node?: string;
  step?: string | number;
  parent_node_id?: string | null;
  start_time?: string;
  end_time?: string;
}

export function processGraphRecords(records: unknown[]): GraphNode[] {
  const isRecord = (r: unknown): r is Record<string, any> =>
    typeof r === "object" && r !== null;

  const hasObservationTypes = records.some(
    (r) => isRecord(r) && r.node && !r.step,
  );
  const hasLangGraph = records.some(
    (r) => isRecord(r) && r.node && r.step != null,
  );
  const hasTypeBasedData = records.some(
    (r) => isRecord(r) && r.type && GraphObservationTypes.includes(r.type),
  );
  const hasTimingData = records.some((r) => isRecord(r) && r.start_time);

  // If only LangGraph data, return as-is
  if (hasLangGraph && !hasObservationTypes) {
    return records as GraphNode[];
  }

  if (hasTypeBasedData && hasTimingData) {
    return processTimingAwareGraph(records as GraphNode[]);
  }

  if (hasObservationTypes) {
    return deriveStepsFromSpanHierarchy(records as GraphNode[]);
  }

  return records as GraphNode[];
}

/**
 * Derives steps from span hierarchy using observation parent relationships
 * Uses BFS with observation IDs
 */
function deriveStepsFromSpanHierarchy(records: GraphNode[]): GraphNode[] {
  const rootObservations = records.filter((r) => !r.parent_observation_id);

  // Assign steps using BFS from span hierarchy
  const observationToStep = new Map<string, number>();
  let currentStep = 0;
  let currentLevel = rootObservations.map((r) => r.id);

  while (currentLevel.length > 0) {
    currentLevel.forEach((obsId) => {
      observationToStep.set(obsId, currentStep);
    });

    const nextLevel: string[] = [];
    records.forEach((r) => {
      if (
        r.parent_observation_id &&
        currentLevel.includes(r.parent_observation_id)
      ) {
        nextLevel.push(r.id);
      }
    });

    currentLevel = [...new Set(nextLevel)];
    currentStep++;
  }

  return records.map((r) => ({
    ...r,
    step: r.step ?? observationToStep.get(r.id) ?? 0,
  }));
}

export const TIMING_DELTAS = {
  TOOL_CALL: 500, // LLM → Tool
  RAG_FLOW: 10000, // Retrieval → LLM
  TOOL_RESPONSE: 1500, // Tool → LLM
} as const;

/**
 * Type compatibility rules for graph edges
 * Define which type can follow on another type to create a valid graph
 */
export const TYPE_COMPATIBILITY = {
  AGENT: [
    "AGENT",
    "CHAIN",
    "LLM",
    "GENERATION",
    "RETRIEVER",
    "TOOL",
  ] as string[],
  LLM: ["TOOL"] as string[],
  GENERATION: ["TOOL"] as string[],
  RETRIEVER: ["LLM", "GENERATION"] as string[],
  TOOL: ["AGENT", "LLM", "GENERATION"] as string[],
} as const;

function isWithinTimingWindow(
  sourceStart: string,
  sourceEnd: string | null,
  targetStart: string,
  deltaMs: number,
  allowDuringExecution = false,
): boolean {
  const sourceStartTime = new Date(sourceStart).getTime();
  const targetStartTime = new Date(targetStart).getTime();

  if (sourceEnd) {
    const sourceEndTime = new Date(sourceEnd).getTime();

    if (allowDuringExecution) {
      // Target can start during or after source execution
      return (
        targetStartTime >= sourceStartTime &&
        targetStartTime <= sourceEndTime + deltaMs
      );
    } else {
      // Target must start after source ends
      return (
        targetStartTime >= sourceEndTime &&
        targetStartTime <= sourceEndTime + deltaMs
      );
    }
  }

  // No end time - use sequential logic with optional buffer
  if (allowDuringExecution) {
    return (
      targetStartTime >= sourceStartTime &&
      targetStartTime <= sourceStartTime + deltaMs + 1000
    );
  } else {
    return targetStartTime > sourceStartTime;
  }
}

export function processTimingAwareGraph(records: GraphNode[]): GraphNode[] {
  const processedRecords = [...records];

  processedRecords.forEach((node) => {
    if (!node.type || !node.start_time) return;

    const potentialParents = processedRecords.filter((p) => p.id !== node.id);

    let bestParent: GraphNode | null = null;
    let bestParentTime = -1;

    potentialParents.forEach((potentialParent) => {
      if (!potentialParent.type || !potentialParent.start_time) return;

      const parentType =
        potentialParent.type as keyof typeof TYPE_COMPATIBILITY;
      const compatibleTypes = TYPE_COMPATIBILITY[parentType];

      if (!node.type || !compatibleTypes?.includes(node.type)) return;

      let shouldConnect = false;

      switch (`${parentType}_${node.type}`) {
        case "LLM_TOOL":
        case "GENERATION_TOOL":
          shouldConnect = isWithinTimingWindow(
            potentialParent.start_time!,
            potentialParent.end_time || null,
            node.start_time!,
            TIMING_DELTAS.TOOL_CALL,
            true, // Allow during execution
          );
          break;

        case "RETRIEVER_LLM":
        case "RETRIEVER_GENERATION":
          shouldConnect = isWithinTimingWindow(
            potentialParent.start_time!,
            potentialParent.end_time || null,
            node.start_time!,
            TIMING_DELTAS.RAG_FLOW,
          );
          break;

        case "TOOL_LLM":
        case "TOOL_GENERATION":
          shouldConnect = isWithinTimingWindow(
            potentialParent.start_time!,
            potentialParent.end_time || null,
            node.start_time!,
            TIMING_DELTAS.TOOL_RESPONSE,
          );
          break;

        case "AGENT_AGENT":
        case "AGENT_TOOL":
        case "AGENT_CHAIN":
        case "AGENT_RETRIEVER":
        case "AGENT_LLM":
        case "AGENT_GENERATION":
        default:
          shouldConnect =
            new Date(node.start_time!).getTime() >
            new Date(potentialParent.start_time!).getTime();
          break;
      }

      if (shouldConnect) {
        const parentStartTime = new Date(potentialParent.start_time!).getTime();
        // Only update if this parent is more recent than the current best parent
        if (parentStartTime > bestParentTime) {
          bestParent = potentialParent;
          bestParentTime = parentStartTime;
        }
      }
    });

    if (bestParent) {
      node.parent_node_id = bestParent.name;
    }
  });

  const nodeToRecord = new Map<string, GraphNode>();
  const parentToChildren = new Map<string, GraphNode[]>();

  processedRecords.forEach((record) => {
    if (record.name) {
      nodeToRecord.set(record.name, record);
      if (record.parent_node_id) {
        const siblings = parentToChildren.get(record.parent_node_id) || [];
        siblings.push(record);
        parentToChildren.set(record.parent_node_id, siblings);
      }
    }
  });

  const rootNodes = processedRecords.filter(
    (record) =>
      !record.parent_node_id || !nodeToRecord.has(record.parent_node_id),
  );

  const visited = new Set<string>();
  const queue = rootNodes.map((node) => ({ node, step: 0 }));

  while (queue.length > 0) {
    const { node: currentNode, step: currentStep } = queue.shift()!;

    if (visited.has(currentNode.name)) continue;
    visited.add(currentNode.name);

    currentNode.step = currentStep;

    const children = parentToChildren.get(currentNode.name) || [];
    children
      .filter((child) => !visited.has(child.name))
      .forEach((child) => {
        queue.push({ node: child, step: currentStep + 1 });
      });
  }

  return processedRecords;
}
