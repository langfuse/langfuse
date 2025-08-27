import { ObservationType } from "@langfuse/shared";
import {
  type AgentGraphDataResponse,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "./types";

const MAX_NODE_NUMBER_FOR_PERFORMANCE = 250;

function buildStepGroups(
  observations: AgentGraphDataResponse[],
): AgentGraphDataResponse[][] {
  if (observations.length === 0) return [];

  // Cache timestamp parsing to avoid repeated Date.parse calls
  const timestampCache = new Map<string, { start: number; end: number }>();
  for (const obs of observations) {
    timestampCache.set(obs.id, {
      start: new Date(obs.startTime).getTime(),
      end: obs.endTime
        ? new Date(obs.endTime).getTime()
        : new Date(obs.startTime).getTime(),
    });
  }

  const stepGroups: AgentGraphDataResponse[][] = [];

  // create observation group and put the beginning observation in it
  let currentGroup = [observations[0]];
  const remainingObs = observations.slice(1);

  // loop through all remaining observations
  remainingObs.forEach((obs) => {
    const obsStart = timestampCache.get(obs.id)!.start;

    // if observation starts before any observations in current group finished, add it to group
    const startsBeforeAnyFinishes = currentGroup.some((groupObs) => {
      const groupEnd = timestampCache.get(groupObs.id)!.end;
      return obsStart < groupEnd;
    });

    if (startsBeforeAnyFinishes) {
      currentGroup.push(obs);
    }
  });

  // loop through current group, remove observations that start after any other finishes
  // the removed observation will be added to a different group (probably next)
  const cleanedGroup = currentGroup.filter((obs) => {
    const obsStart = timestampCache.get(obs.id)!.start;

    const startsAfterAnyOtherFinishes = currentGroup.some((otherObs) => {
      if (otherObs === obs) return false; // Don't compare with self

      const otherEnd = timestampCache.get(otherObs.id)!.end;
      return obsStart >= otherEnd;
    });

    return !startsAfterAnyOtherFinishes;
  });

  stepGroups.push(cleanedGroup);

  // Loop again through remaining observations (kicked out ones + those not added)
  const processedIds = new Set(cleanedGroup.map((obs) => obs.id));
  const unprocessed = observations.filter((obs) => !processedIds.has(obs.id));

  // Recursively process remaining observations
  if (unprocessed.length > 0) {
    const remainingStepGroups = buildStepGroups(unprocessed);
    stepGroups.push(...remainingStepGroups);
  }

  return stepGroups;
}

function assignGlobalTimingSteps(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  // Create a copy of the data to avoid mutation
  const dataCopy = data.map((obs) => ({ ...obs }));

  // Cache timestamp parsing for efficient sorting
  const timestampCache = new Map<string, number>();
  for (const obs of dataCopy) {
    timestampCache.set(obs.id, new Date(obs.startTime).getTime());
  }

  // sort observations by start time using cached timestamps
  const sortedObs = [...dataCopy].sort(
    (a, b) => timestampCache.get(a.id)! - timestampCache.get(b.id)!,
  );

  // Build step groups recursively
  const stepGroups = buildStepGroups(sortedObs);

  // Assign step numbers based on final groups
  stepGroups.forEach((group, stepIndex) => {
    group.forEach((obs) => {
      obs.step = stepIndex + 1;
      obs.node = obs.name;
    });
  });

  // Get all observations with initial step assignments
  let result = stepGroups.flat();

  // Enforce parent-child step constraint: child must be at least parent_step + 1

  let constraintViolations = true;
  let iterations = 0;
  const maxIterations = 10; // Prevent infinite loops

  while (constraintViolations && iterations < maxIterations) {
    constraintViolations = false;
    iterations++;

    // Create new array with updated steps to avoid mutation
    const updatedResult: AgentGraphDataResponse[] = [];
    const idToStepMap = new Map(result.map((obs) => [obs.id, obs.step]));

    for (const obs of result) {
      let newStep = obs.step;

      if (obs.parentObservationId) {
        const parentStep = idToStepMap.get(obs.parentObservationId);
        if (
          parentStep !== undefined &&
          parentStep !== null &&
          newStep !== null
        ) {
          const requiredMinStep = parentStep + 1;
          if (newStep < requiredMinStep) {
            // Push all observations at requiredMinStep and beyond forward by 1
            for (const otherObs of result) {
              if (
                otherObs.id !== obs.id &&
                otherObs.step !== null &&
                otherObs.step >= requiredMinStep
              ) {
                otherObs.step = otherObs.step + 1;
              }
            }

            newStep = requiredMinStep;
            constraintViolations = true;
          }
        }
      }

      updatedResult.push({ ...obs, step: newStep });
    }

    result = updatedResult;
  }

  if (iterations >= maxIterations) {
    console.warn("Parent-child constraint enforcement reached max iterations");
  }
  return result;
}

function addLangfuseSystemNodes(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  const systemNodes: AgentGraphDataResponse[] = [];

  // Find the top-level parent for system node mapping
  const topLevelObs = data.find((obs) => !obs.parentObservationId);

  // Use deterministic timestamp to avoid infinite re-renders
  const systemTimestamp = "2024-01-01T00:00:00.000Z";

  // Add __start_lf__ node at step 0
  systemNodes.push({
    id: LANGFUSE_START_NODE_NAME,
    name: LANGFUSE_START_NODE_NAME,
    node: LANGFUSE_START_NODE_NAME,
    step: 0,
    parentObservationId: topLevelObs?.parentObservationId || null,
    startTime: systemTimestamp,
    endTime: systemTimestamp,
    observationType: "LANGGRAPH_SYSTEM",
  });

  // Add __end_lf__ node at max step + 1
  const maxStep = Math.max(...data.map((obs) => obs.step || 0));
  systemNodes.push({
    id: LANGFUSE_END_NODE_NAME,
    name: LANGFUSE_END_NODE_NAME,
    node: LANGFUSE_END_NODE_NAME,
    step: maxStep + 1,
    parentObservationId: topLevelObs?.parentObservationId || null,
    startTime: systemTimestamp,
    endTime: systemTimestamp,
    observationType: "LANGGRAPH_SYSTEM",
  });

  return [...data, ...systemNodes];
}

export function buildStepData(
  agentGraphData: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  if (agentGraphData.length >= MAX_NODE_NUMBER_FOR_PERFORMANCE) {
    return [];
  }

  // for now, we don't want to show SPAN/EVENTs in our agent graphs
  // TODO: move this filter to a separate function
  const filteredData = agentGraphData.filter(
    (item) =>
      item.observationType !== ObservationType.SPAN &&
      item.observationType !== ObservationType.EVENT,
  );

  // Assign step numbers based on global timing analysis
  const dataWithSteps = assignGlobalTimingSteps(filteredData);

  // Add Langfuse system nodes to make it consistent with LangGraph path
  const dataWithSystemNodes = addLangfuseSystemNodes(dataWithSteps);

  return dataWithSystemNodes;
}
