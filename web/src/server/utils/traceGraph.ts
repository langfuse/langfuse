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
 * Processes raw graph data to calculate steps and parent relationships for different types of graph spans
 */
export function processGraphData(rawResult: any[]): GraphNode[] {
  console.log("🔍 Processing graph data:", rawResult);

  // Calculate steps and parent relationships for different types of graph spans
  const result = rawResult.map((item: any) => {
    // If this is a LangGraph node (has step already), return as-is
    if (item.step && item.step !== "") {
      return {
        ...item,
        step: parseInt(item.step, 10),
      };
    }

    // For type-based spans, derive parent relationships from OpenTelemetry hierarchy
    if (item.type && GraphObservationTypes.includes(item.type as any)) {
      return {
        ...item,
        // For type-based spans, we'll calculate parent_node_id from the span hierarchy
        parent_node_id: item.parent_node_id || null, // Keep existing if set, otherwise null for now
      };
    }

    // For manual graphs, we'll calculate steps using BFS from parent relationships
    return item;
  });

  // Calculate parent relationships for type-based spans
  const typeBasedNodes = result.filter(
    (item: any) =>
      item.type && GraphObservationTypes.includes(item.type as any),
  );

  if (typeBasedNodes.length > 0) {
    processTypeBasedNodeRelationships(result, typeBasedNodes);

    // Apply timing-aware heuristics if we have timing data
    const hasTimingData = typeBasedNodes.some(
      (node: any) => node.start_time && node.end_time,
    );

    if (hasTimingData) {
      console.log("🔍 Applying timing-aware graph processing");
      return processTimingAwareGraph(result);
    }
  }

  // Calculate steps for manual graph nodes using BFS
  const manualNodes = result.filter(
    (item: any) => !item.step || item.step === "",
  );

  if (manualNodes.length > 0) {
    processManualGraphSteps(result, manualNodes);
  }

  console.log("🔍 Final processed result with steps:", result);
  return result;
}

/**
 * Processes parent relationships for type-based nodes
 */
function processTypeBasedNodeRelationships(
  result: any[],
  typeBasedNodes: any[],
) {
  // Create a map of observation ID to span data for quick lookup
  const observationIdToNode = new Map();
  result.forEach((item: any) => {
    observationIdToNode.set(item.id, item);
  });

  // For each type-based span, find its parent and set parent_node_id if parent also has type
  typeBasedNodes.forEach((item: any) => {
    if (item.parent_observation_id) {
      const parentSpan = observationIdToNode.get(item.parent_observation_id);
      if (
        parentSpan &&
        parentSpan.type &&
        GraphObservationTypes.includes(parentSpan.type as any)
      ) {
        // Parent is also a type-based span, use its name as parent_node_id
        item.parent_node_id = parentSpan.name;
      }
    }
  });
}

/**
 * Calculates steps for manual graph nodes using BFS algorithm
 */
function processManualGraphSteps(result: any[], manualNodes: any[]) {
  // Build parent-child map
  const nodeMap = new Map();
  manualNodes.forEach((item: any) => {
    nodeMap.set(item.node, item);
  });

  // Find root nodes (no parent or parent not in the graph)
  const rootNodes = manualNodes.filter(
    (item: any) =>
      !item.parent_node_id ||
      item.parent_node_id === "" ||
      !nodeMap.has(item.parent_node_id),
  );

  // BFS to assign steps
  const visited = new Set();
  const queue = rootNodes.map((node) => ({ node, step: 0 }));

  while (queue.length > 0) {
    const { node: currentNode, step: currentStep } = queue.shift()!;

    if (visited.has(currentNode.node)) continue;
    visited.add(currentNode.node);

    // Update the step for this node
    const resultIndex = result.findIndex(
      (item) => item.node === currentNode.node,
    );
    if (resultIndex !== -1) {
      result[resultIndex] = { ...result[resultIndex], step: currentStep };
    }

    // Find children and add them to queue
    const children = manualNodes.filter(
      (item: any) =>
        item.parent_node_id === currentNode.node && !visited.has(item.node),
    );

    children.forEach((child) => {
      queue.push({ node: child, step: currentStep + 1 });
    });
  }
}

/**
 * Processes graph records to handle both LangGraph and manual instrumentation
 * Originally from traces router - handles higher-level record processing
 */
export function processGraphRecords(records: any[]): any[] {
  console.log("🔍 processGraphRecords called with", records.length, "records");

  const hasObservationTypes = records.some((r) => r.node && !r.step);
  const hasLangGraph = records.some((r) => r.node && r.step != null);
  const hasTypeBasedData = records.some(
    (r) => r.type && GraphObservationTypes.includes(r.type as any),
  );
  const hasTimingData = records.some((r) => r.start_time);

  console.log("🔍 processGraphRecords detection:", {
    hasObservationTypes,
    hasLangGraph,
    hasTypeBasedData,
    hasTimingData,
  });

  // If only LangGraph data, return as-is
  if (hasLangGraph && !hasObservationTypes) {
    console.log("🔍 Using LangGraph data as-is");
    return records;
  }

  // If we have type-based data with timing, use timing-aware processing
  if (hasTypeBasedData && hasTimingData) {
    console.log("🔍 Using timing-aware processing");
    return processTimingAwareGraph(records);
  }

  // If observation type data without timing, derive steps from span hierarchy
  if (hasObservationTypes) {
    console.log("🔍 Using span hierarchy processing");
    return deriveStepsFromSpanHierarchy(records);
  }

  console.log("🔍 Returning records unchanged");
  return records;
}

/**
 * Derives steps from span hierarchy using observation parent relationships
 * Alternative approach to BFS - works with observation IDs instead of node names
 */
function deriveStepsFromSpanHierarchy(records: any[]): any[] {
  // Build observation hierarchy from parent_observation_id
  const idToRecord = new Map<string, any>();
  const childToParent = new Map<string, string>();

  records.forEach((r) => {
    if (r.id) {
      idToRecord.set(r.id, r);
      if (r.parent_observation_id) {
        childToParent.set(r.id, r.parent_observation_id);
      }
    }
  });

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
  TOOL_CALL: 100, // LLM → Tool within 100ms
  RAG_FLOW: 2000, // Retrieval → LLM within 2s
  TOOL_RESPONSE: 500, // Tool → LLM within 500ms
} as const;

/**
 * Type compatibility rules for graph edges
 */
export const TYPE_COMPATIBILITY = {
  AGENT: [
    "AGENT",
    "CHAIN",
    "LLM",
    "GENERATION",
    "PLANNER",
    "RETRIEVER",
    "TOOL",
  ],
  LLM: ["TOOL"],
  GENERATION: ["TOOL"],
  RETRIEVER: ["LLM", "GENERATION"],
  TOOL: ["AGENT", "LLM", "GENERATION"],
} as const;

/**
 * Checks if target starts within delta milliseconds after source ends
 * If sourceEnd is null, falls back to checking against sourceStart + estimated duration
 */
function isWithinTimingWindow(
  sourceStart: string,
  sourceEnd: string | null,
  targetStart: string,
  deltaMs: number,
): boolean {
  const sourceStartTime = new Date(sourceStart).getTime();
  const targetStartTime = new Date(targetStart).getTime();

  // If we have an end time, use the normal logic
  if (sourceEnd) {
    const sourceEndTime = new Date(sourceEnd).getTime();
    return (
      targetStartTime >= sourceEndTime &&
      targetStartTime <= sourceEndTime + deltaMs
    );
  }

  // If no end time, assume source started before target (sequential)
  return targetStartTime > sourceStartTime;
}

/**
 * Checks if target starts during or shortly after source execution
 * If sourceEnd is null, assumes a reasonable execution duration
 */
function isWithinExecutionWindow(
  sourceStart: string,
  sourceEnd: string | null,
  targetStart: string,
  deltaMs: number,
): boolean {
  const sourceStartTime = new Date(sourceStart).getTime();
  const targetStartTime = new Date(targetStart).getTime();

  // If no end time, assume source started before target (sequential within window)
  if (!sourceEnd) {
    return (
      targetStartTime >= sourceStartTime &&
      targetStartTime <= sourceStartTime + deltaMs + 1000
    ); // Add 1s buffer
  }

  const sourceEndTime = new Date(sourceEnd).getTime();
  return (
    targetStartTime >= sourceStartTime &&
    targetStartTime <= sourceEndTime + deltaMs
  );
}

/**
 * Processes graph records with timing-aware heuristics for intelligent edge inference
 */
export function processTimingAwareGraph(records: GraphNode[]): GraphNode[] {
  console.log("🔍 Processing timing-aware graph with", records.length, "nodes");

  // First, handle direct parent-child relationships from OpenTelemetry span hierarchy
  const processedRecords = [...records];

  // Group nodes by parent for efficient lookup
  const nodesByParent = new Map<string, GraphNode[]>();
  processedRecords.forEach((node) => {
    if (node.parent_observation_id) {
      const siblings = nodesByParent.get(node.parent_observation_id) || [];
      siblings.push(node);
      nodesByParent.set(node.parent_observation_id, siblings);
    }
  });

  // Apply timing-based heuristics to infer additional parent relationships
  processedRecords.forEach((node) => {
    console.log(
      `🔍 Processing node ${node.name}(${node.type}) for timing relationships`,
    );
    if (!node.type || !node.start_time) {
      console.log(`🔍 Skipping node ${node.name}: missing type/start_time`);
      return;
    }

    // Consider all other nodes as potential parents for timing-aware heuristics
    const potentialParents = processedRecords.filter((p) => p.id !== node.id);
    console.log(
      `🔍 Found ${potentialParents.length} potential parents for node ${node.name}:`,
      potentialParents.map((p) => p.name),
    );

    let bestParent: GraphNode | null = null;
    let bestParentTime = -1;

    // Find the best parent based on type compatibility and timing (most recent valid parent)
    potentialParents.forEach((potentialParent) => {
      console.log(
        `🔍 Checking potential parent ${potentialParent.name}(${potentialParent.type}) for ${node.name}(${node.type})`,
      );

      if (
        potentialParent.id === node.id ||
        !potentialParent.type ||
        !potentialParent.start_time
      ) {
        console.log(
          `🔍 Skipping ${potentialParent.name}: same node or missing data`,
        );
        return;
      }

      const parentType =
        potentialParent.type as keyof typeof TYPE_COMPATIBILITY;
      const compatibleTypes = TYPE_COMPATIBILITY[parentType] || [];

      console.log(
        `🔍 Type compatibility check: ${parentType} → ${node.type}, allowed targets:`,
        compatibleTypes,
      );

      if (!compatibleTypes.includes(node.type as any)) {
        console.log(
          `🔍 Type incompatible: ${parentType} cannot connect to ${node.type}`,
        );
        return;
      }

      let shouldConnect = false;

      // Apply specific timing heuristics
      switch (`${parentType}_${node.type}`) {
        case "LLM_TOOL":
        case "GENERATION_TOOL":
          // Tool calls starting within LLM execution + small delta
          shouldConnect = isWithinExecutionWindow(
            potentialParent.start_time,
            potentialParent.end_time || null,
            node.start_time,
            TIMING_DELTAS.TOOL_CALL,
          );
          console.log(
            `🔍 ${parentType}→${node.type} timing check:`,
            shouldConnect,
          );
          break;

        case "RETRIEVER_LLM":
        case "RETRIEVER_GENERATION":
          // LLM starting within delta after retrieval ends
          shouldConnect = isWithinTimingWindow(
            potentialParent.start_time,
            potentialParent.end_time || null,
            node.start_time,
            TIMING_DELTAS.RAG_FLOW,
          );
          console.log(
            `🔍 ${parentType}→${node.type} RAG timing check:`,
            shouldConnect,
          );
          break;

        case "TOOL_LLM":
        case "TOOL_GENERATION":
          // LLM starting shortly after tool ends
          shouldConnect = isWithinTimingWindow(
            potentialParent.start_time,
            potentialParent.end_time || null,
            node.start_time,
            TIMING_DELTAS.TOOL_RESPONSE,
          );
          console.log(
            `🔍 ${parentType}→${node.type} tool response timing check:`,
            shouldConnect,
          );
          break;

        case "AGENT_AGENT":
        case "AGENT_TOOL":
        case "AGENT_CHAIN":
        case "AGENT_RETRIEVER":
        case "AGENT_LLM":
        case "AGENT_GENERATION":
          // Agent sequential flow: child starts after parent starts (sequential execution)
          const parentStartTime = new Date(
            potentialParent.start_time,
          ).getTime();
          const nodeStartTime = new Date(node.start_time).getTime();
          shouldConnect = nodeStartTime > parentStartTime;
          console.log(
            `🔍 ${parentType}→${node.type} sequential timing check: ${nodeStartTime} > ${parentStartTime} = ${shouldConnect}`,
          );
          break;

        default:
          // For other relationships, use sequential timing as fallback
          const defaultParentStart = new Date(
            potentialParent.start_time,
          ).getTime();
          const defaultNodeStart = new Date(node.start_time).getTime();
          shouldConnect = defaultNodeStart > defaultParentStart;
          console.log(
            `🔍 ${parentType}→${node.type} default sequential check: ${defaultNodeStart} > ${defaultParentStart} = ${shouldConnect}`,
          );
          break;
      }

      if (shouldConnect) {
        const parentStartTime = new Date(potentialParent.start_time).getTime();
        // Only update if this parent is more recent than the current best parent
        if (parentStartTime > bestParentTime) {
          bestParent = potentialParent;
          bestParentTime = parentStartTime;
          console.log(
            `🔍 New best parent for ${node.name}: ${potentialParent.name}(${parentType}) at ${parentStartTime}`,
          );
        }
      }
    });

    // Set the best parent as the timing-aware edge
    if (bestParent) {
      console.log(
        `🔍 Timing-aware edge selected: ${bestParent.name}(${bestParent.type}) → ${node.name}(${node.type})`,
      );
      node.parent_node_id = bestParent.name;
    }
  });

  // After timing-aware edge inference, assign steps using BFS
  console.log("🔍 Assigning steps to timing-aware graph");

  // Find root nodes (no parent_node_id or parent not in the graph)
  const nodeToRecord = new Map<string, any>();
  processedRecords.forEach((record) => {
    if (record.name) {
      nodeToRecord.set(record.name, record);
    }
  });

  const rootNodes = processedRecords.filter(
    (record) =>
      !record.parent_node_id || !nodeToRecord.has(record.parent_node_id),
  );

  console.log(
    "🔍 Found root nodes:",
    rootNodes.map((r) => r.name),
  );

  // BFS to assign steps
  const visited = new Set<string>();
  const queue = rootNodes.map((node) => ({ node, step: 0 }));

  while (queue.length > 0) {
    const { node: currentNode, step: currentStep } = queue.shift()!;

    if (visited.has(currentNode.name)) continue;
    visited.add(currentNode.name);

    // Update the step for this node
    currentNode.step = currentStep;
    console.log(`🔍 Assigned step ${currentStep} to node ${currentNode.name}`);

    // Find children and add them to queue
    const children = processedRecords.filter(
      (record) =>
        record.parent_node_id === currentNode.name && !visited.has(record.name),
    );

    console.log(
      `🔍 Found ${children.length} children for ${currentNode.name}:`,
      children.map((c) => c.name),
    );

    children.forEach((child) => {
      console.log(
        `🔍 Adding child ${child.name} to queue with step ${currentStep + 1}`,
      );
      queue.push({ node: child, step: currentStep + 1 });
    });
  }

  console.log("🔍 Timing-aware processing complete");
  return processedRecords;
}
