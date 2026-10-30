import { ObservationType } from "@langfuse/shared";
import {
  type AgentGraphDataResponse,
  LANGFUSE_START_NODE_NAME,
  LANGFUSE_END_NODE_NAME,
} from "./types";

function takeNextStepGroup(
  observations: AgentGraphDataResponse[],
  timestampCache: Map<string, { start: number; end: number }>,
): {
  cleanedGroup: AgentGraphDataResponse[];
  unprocessed: AgentGraphDataResponse[];
} {
  // create observation group and put the beginning observation in it
  const currentGroup = [observations[0]];
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

  // Inverted or otherwise invalid time ranges can cause cleanup to remove every
  // observation. Keep the original group so grouping always makes progress.
  if (cleanedGroup.length === 0) {
    cleanedGroup.push(...currentGroup);
    currentGroup.forEach((o) => processedIds.add(o.id));
  }

  return {
    cleanedGroup,
    unprocessed: observations.filter((obs) => !processedIds.has(obs.id)),
  };
}

function buildStepGroups(
  observations: AgentGraphDataResponse[],
  timestampCache: Map<string, { start: number; end: number }>,
): AgentGraphDataResponse[][] {
  const stepGroups: AgentGraphDataResponse[][] = [];
  let remaining = observations;

  // Iterative so a long sequential chain (one group per observation) cannot
  // overflow the call stack.
  while (remaining.length > 0) {
    const remainingCount = remaining.length;
    const { cleanedGroup, unprocessed } = takeNextStepGroup(
      remaining,
      timestampCache,
    );

    if (cleanedGroup.length === 0 || unprocessed.length >= remainingCount) {
      stepGroups.push([remaining[0]]);
      remaining = remaining.slice(1);
      continue;
    }

    stepGroups.push(cleanedGroup);
    remaining = unprocessed;
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
        const parentId = current.parentObservationId;
        // Cycle guard: parent pointers are acyclic by DB schema, but a malformed
        // chain (parent already seen) would otherwise loop this walk forever.
        if (ancestors.has(parentId)) break;
        ancestors.add(parentId);
        current = obsMap.get(parentId);
      }
      return ancestors;
    };

    // Child moves to requiredMinStep; later steps +1; ancestors stay.
    type StepViolation = { id: string; step: number; requiredMinStep: number };
    type ViolationMap = Map<string, StepViolation[]>;
    const requiredMinSteps: number[] = [];
    const violationsByChild: ViolationMap = new Map();
    const violationsByAncestor: ViolationMap = new Map();
    const pushTo = (map: ViolationMap, key: string, v: StepViolation) => {
      const list = map.get(key);
      if (list) list.push(v);
      else map.set(key, [v]);
    };

    for (const obs of result) {
      if (!obs.parentObservationId || obs.step === null) continue;
      const parent = obsMap.get(obs.parentObservationId);
      if (!parent || parent.step === null) continue;
      const requiredMinStep = parent.step + 1;
      if (obs.step >= requiredMinStep) continue;

      constraintViolations = true;
      const violation: StepViolation = {
        id: obs.id,
        step: obs.step,
        requiredMinStep,
      };
      requiredMinSteps.push(requiredMinStep);
      pushTo(violationsByChild, obs.id, violation);
      for (const ancestorId of getAncestors(obs.id)) {
        pushTo(violationsByAncestor, ancestorId, violation);
      }
    }

    if (requiredMinSteps.length > 0) {
      requiredMinSteps.sort((a, b) => a - b);
      const countAtOrBelow = (step: number) => {
        let lo = 0;
        let hi = requiredMinSteps.length;
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          if (requiredMinSteps[mid] <= step) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };

      for (const target of result) {
        if (target.step === null) continue;
        let shift = countAtOrBelow(target.step);
        for (const v of violationsByChild.get(target.id) ?? []) {
          shift += v.requiredMinStep - v.step;
          if (target.step >= v.requiredMinStep) shift -= 1;
        }
        for (const v of violationsByAncestor.get(target.id) ?? []) {
          if (v.id !== target.id && target.step >= v.requiredMinStep) {
            shift -= 1;
          }
        }
        if (shift !== 0) {
          adjustments.set(target.id, (adjustments.get(target.id) || 0) + shift);
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
