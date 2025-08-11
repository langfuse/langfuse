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

/**
 * Processes graph records to handle both LangGraph and manual instrumentation
 */
export function processGraphRecords(records: unknown[]): GraphNode[] {
  // Type guard to safely access record properties
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

  // If we have type-based data with timing, use timing-aware processing
  if (hasTypeBasedData && hasTimingData) {
    return processTimingAwareGraph(records as GraphNode[]);
  }

  // If observation type data without timing, derive steps from span hierarchy
  if (hasObservationTypes) {
    return deriveStepsFromSpanHierarchy(records as GraphNode[]);
  }

  return records as GraphNode[];
}

/**
 * Derives steps from span hierarchy using observation parent relationships
 * Uses BFS with observation IDs instead of node names
 */
function deriveStepsFromSpanHierarchy(records: GraphNode[]): GraphNode[] {
  // Find root observations (no parent)
  const rootObservations = records.filter((r) => !r.parent_observation_id);

  // Assign steps using BFS from span hierarchy
  const observationToStep = new Map<string, number>();
  let currentStep = 0;
  let currentLevel = rootObservations.map((r) => r.id);

  while (currentLevel.length > 0) {
    currentLevel.forEach((obsId) => {
      observationToStep.set(obsId, currentStep);
    });

    // Find all children of current level
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

  // Update records with calculated steps
  return records.map((r) => ({
    ...r,
    step: r.step ?? observationToStep.get(r.id) ?? 0,
  }));
}

/**
 * Timing deltas for timing-aware graph heuristics (in milliseconds)
 */
export const TIMING_DELTAS = {
  TOOL_CALL: 500, // LLM → Tool within 500ms
  RAG_FLOW: 10000, // Retrieval → LLM within 10s
  TOOL_RESPONSE: 1500, // Tool → LLM within 1.5s
} as const;

/**
 * Type compatibility rules for graph edges
 */
export const TYPE_COMPATIBILITY = {
  AGENT: ["AGENT", "CHAIN", "LLM", "GENERATION", "RETRIEVER", "TOOL"],
  LLM: ["TOOL"],
  GENERATION: ["TOOL"],
  RETRIEVER: ["LLM", "GENERATION"],
  TOOL: ["AGENT", "LLM", "GENERATION"],
} as const;

/**
 * Checks if target starts within timing window relative to source
 * @param sourceStart - Source start time
 * @param sourceEnd - Source end time (can be null)
 * @param targetStart - Target start time
 * @param deltaMs - Delta in milliseconds
 * @param allowDuringExecution - If true, allows target during source execution
 */
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

/**
 * Processes graph records with timing-aware heuristics for intelligent edge inference
 */
export function processTimingAwareGraph(records: GraphNode[]): GraphNode[] {
  const processedRecords = [...records];

  // Apply timing-based heuristics to infer parent relationships
  processedRecords.forEach((node) => {
    if (!node.type || !node.start_time) return;

    const potentialParents = processedRecords.filter((p) => p.id !== node.id);

    let bestParent: GraphNode | null = null;
    let bestParentTime = -1;

    // Find the best parent based on type compatibility and timing
    potentialParents.forEach((potentialParent) => {
      if (!potentialParent.type || !potentialParent.start_time) return;

      const parentType =
        potentialParent.type as keyof typeof TYPE_COMPATIBILITY;
      const compatibleTypes = TYPE_COMPATIBILITY[parentType] || [];

      if (!node.type || !compatibleTypes.includes(node.type)) return;

      let shouldConnect = false;

      // Apply specific timing heuristics
      switch (`${parentType}_${node.type}`) {
        case "LLM_TOOL":
        case "GENERATION_TOOL":
          // Tool calls starting within LLM execution + small delta
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
          // LLM starting within delta after retrieval ends
          shouldConnect = isWithinTimingWindow(
            potentialParent.start_time!,
            potentialParent.end_time || null,
            node.start_time!,
            TIMING_DELTAS.RAG_FLOW,
          );
          break;

        case "TOOL_LLM":
        case "TOOL_GENERATION":
          // LLM starting shortly after tool ends
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
          // Agent sequential flow and fallback: child starts after parent starts
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

  // Assign steps using BFS
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

  // BFS to assign steps
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
