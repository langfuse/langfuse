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

  // Track max end time for early termination optimization
  let maxGroupEndTime = timestampCache.get(observations[0].id)!.end;

  // loop through all remaining observations that are not added to any group yet
  for (const obs of remainingObs) {
    const obsStart = timestampCache.get(obs.id)!.start;

    // Optimization: early break if current observation starts after all current group members finish
    if (obsStart >= maxGroupEndTime) {
      break;
    }

    // if observation starts before any observations in current group finished, add it to the current group
    const startsBeforeAnyFinishes = currentGroup.some((groupObs) => {
      const groupEnd = timestampCache.get(groupObs.id)!.end;
      return obsStart < groupEnd;
    });

    if (startsBeforeAnyFinishes) {
      currentGroup.push(obs);
      // Update max end time for this group
      const obsEnd = timestampCache.get(obs.id)!.end;
      if (obsEnd > maxGroupEndTime) {
        maxGroupEndTime = obsEnd;
      }
    }
  }

  const cleanedGroup: AgentGraphDataResponse[] = [];
  // Track unprocessed incrementally during cleanup phase
  const processedIds = new Set<string>();

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
      processedIds.add(obs.id);
    }
  });

  stepGroups.push(cleanedGroup);

  // Optimization: use incrementally built processedIds set
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
    const adjustments = new Map<string, number>();
    const obsMap = new Map(result.map((o) => [o.id, o]));

    // helper to get all ancestors of an observation
    const getAncestors = (obsId: string): Set<string> => {
      const ancestors = new Set<string>();
      let current = obsMap.get(obsId);
      while (current?.parentObservationId) {
        ancestors.add(current.parentObservationId);
        current = obsMap.get(current.parentObservationId);
      }
      return ancestors;
    };

    // identify spans which must be pushed (violations) and calculate adjustments
    for (const obs of result) {
      if (!obs.parentObservationId || obs.step === null) continue;

      const parent = obsMap.get(obs.parentObservationId);
      if (!parent || parent.step === null) continue;

      const requiredMinStep = parent.step + 1;
      if (obs.step < requiredMinStep) {
        constraintViolations = true;
        const ancestors = getAncestors(obs.id);

        // adjust the violating child and push all observations at future steps forward (except ancestors)
        for (const target of result) {
          if (target.step === null) continue;

          if (target.id === obs.id) {
            // child adjustment
            adjustments.set(
              target.id,
              (adjustments.get(target.id) || 0) + (requiredMinStep - obs.step),
            );
          } else if (
            target.step >= requiredMinStep &&
            !ancestors.has(target.id)
          ) {
            // Push forward observations at future steps except for ancestors
            adjustments.set(target.id, (adjustments.get(target.id) || 0) + 1);
          }
        }
      }
    }

    result = result.map((obs) => ({
      ...obs,
      step:
        obs.step !== null
          ? obs.step + (adjustments.get(obs.id) || 0)
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
