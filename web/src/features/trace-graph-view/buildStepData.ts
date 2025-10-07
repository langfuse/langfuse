import { ObservationType } from "@langfuse/shared";
import {
  type AgentGraphDataResponse,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "./types";

function buildStepGroups(
  observations: AgentGraphDataResponse[],
  timestampCache: Map<string, { start: number; end: number }>,
): AgentGraphDataResponse[][] {
  if (observations.length === 0) return [];

  const stepGroups: AgentGraphDataResponse[][] = [];

  // create observation group and put the beginning observation in it
  let currentGroup = [observations[0]];
  const remainingObs = observations.slice(1);

  // loop through all remaining observations that are not added to any group yet
  for (const obs of remainingObs) {
    const obsStart = timestampCache.get(obs.id)!.start;

    // TODO: perf, could break early if current observation starts after all current group members finish

    // if observation starts before any observations in current group finished, add it to the current group
    const startsBeforeAnyFinishes = currentGroup.some((groupObs) => {
      const groupEnd = timestampCache.get(groupObs.id)!.end;
      return obsStart < groupEnd;
    });

    if (startsBeforeAnyFinishes) {
      currentGroup.push(obs);
    }
  }

  const cleanedGroup: AgentGraphDataResponse[] = [];

  // build final current group. check if observation doesn't start after any finishes, only then add it
  currentGroup.forEach((obs) => {
    const obsStart = timestampCache.get(obs.id)!.start;

    const startsAfterAnyOtherFinishes = currentGroup.some((otherObs) => {
      if (otherObs === obs) return false;

      const otherEnd = timestampCache.get(otherObs.id)!.end;
      return obsStart > otherEnd; // handle simultaneous events gracefully
    });

    if (!startsAfterAnyOtherFinishes) {
      cleanedGroup.push(obs);
    }
  });

  stepGroups.push(cleanedGroup);

  // Find unprocessed by checking what's not in cleanedGroup
  // TODO: perf, can track unprocessed while building cleanedGroup
  const processedIds = new Set(cleanedGroup.map((obs) => obs.id));
  const unprocessed = observations.filter((obs) => !processedIds.has(obs.id));

  // process remaining observations in recursion
  if (unprocessed.length > 0) {
    const remainingStepGroups = buildStepGroups(unprocessed, timestampCache);
    stepGroups.push(...remainingStepGroups);
  }

  return stepGroups;
}

function assignGlobalTimingSteps(
  data: AgentGraphDataResponse[],
): AgentGraphDataResponse[] {
  const dataCopy: AgentGraphDataResponse[] = [];
  const timestampCache = new Map<string, { start: number; end: number }>();
  for (const obs of data) {
    const obsCopy = { ...obs };
    dataCopy.push(obsCopy);
    timestampCache.set(obs.id, {
      start: new Date(obs.startTime).getTime(),
      end: obs.endTime
        ? new Date(obs.endTime).getTime()
        : new Date(obs.startTime).getTime(),
    });
  }

  // sort observations by start time
  const sortedObs = [...dataCopy].sort(
    (a, b) => timestampCache.get(a.id)!.start - timestampCache.get(b.id)!.start,
  );

  const stepGroups = buildStepGroups(sortedObs, timestampCache);

  // assign step numbers and flatten
  let result: AgentGraphDataResponse[] = [];
  stepGroups.forEach((group, stepIndex) => {
    group.forEach((obs) => {
      obs.step = stepIndex + 1;
      obs.node = obs.name;
      result.push(obs);
    });
  });

  // apply span parent-child step constraint: any child must be at least parent_step + 1
  // any step groups down the line will be pushed down by the same amount
  let constraintViolations = true;
  let iterationCount = 0;
  const MAX_ITERATIONS = 1500;

  while (constraintViolations) {
    iterationCount++;

    if (iterationCount > MAX_ITERATIONS) {
      console.debug("Aborting graph processing due to excessive iterations.");
      break;
    }

    constraintViolations = false;

    // Track step adjustments to apply during result building
    const stepAdjustments = new Map<string, number>();
    const idToStepMap = new Map<string, number>();

    // build step map while tracking step adjustments
    for (const obs of result) {
      stepAdjustments.set(obs.id, 0); // Initialize adjustment
      idToStepMap.set(obs.id, obs.step!); // we checked against null already
    }

    const stepPushes: Array<{ fromStep: number; pushCount: number }> = [];
    // identify if any spans must be pushed down
    for (const obs of result) {
      if (obs.parentObservationId) {
        const parentStep = idToStepMap.get(obs.parentObservationId);
        const currentStep = obs.step;
        if (
          parentStep !== undefined &&
          parentStep !== null &&
          currentStep !== null
        ) {
          const requiredMinStep = parentStep + 1;
          if (currentStep < requiredMinStep) {
            // Track step push: all observations at requiredMinStep+ need +1
            stepPushes.push({ fromStep: requiredMinStep, pushCount: 1 });

            stepAdjustments.set(obs.id, requiredMinStep - currentStep);
            constraintViolations = true;
          }
        }
      }
    }

    // apply step pushes by directly incrementing affected observations
    for (const push of stepPushes) {
      for (const obs of result) {
        if (obs.step !== null && obs.step >= push.fromStep) {
          const currentAdjustment = stepAdjustments.get(obs.id) || 0;
          stepAdjustments.set(obs.id, currentAdjustment + push.pushCount);
        }
      }
    }

    // Build result with step adjustments applied
    result = result.map((obs) => ({
      ...obs,
      step:
        obs.step !== null
          ? obs.step + (stepAdjustments.get(obs.id) || 0)
          : obs.step,
    }));
  } // end loop to check if parent-child constraints require step adjustments

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
  // for now, we don't want to show SPAN/EVENTs in our agent graphs
  // TODO: move this filter to a separate function
  const filteredData = agentGraphData.filter(
    (item) =>
      // Just not show events for now
      // item.observationType !== ObservationType.SPAN &&
      // item.observationType !== ObservationType.GENERATION &&
      item.observationType !== ObservationType.EVENT,
  );

  // Assign step numbers based on global timing analysis
  const dataWithSteps = assignGlobalTimingSteps(filteredData);

  // Add Langfuse system nodes to make it consistent with LangGraph path
  const dataWithSystemNodes = addLangfuseSystemNodes(dataWithSteps);

  return dataWithSystemNodes;
}
