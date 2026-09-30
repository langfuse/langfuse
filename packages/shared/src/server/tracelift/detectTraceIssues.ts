import { isRootObservation } from "../../eventsTable";
import { infrastructureNames } from "./constants";
import { isEmpty } from "./helpers";
import { type TraceIssueObservation, TraceIssue } from "./types";

/** Advisory signals for one loaded trace snapshot, not a validity verdict. */
export function detectTraceIssues(
  observations: readonly TraceIssueObservation[],
): TraceIssue[] {
  if (observations.length === 0) return [];
  const issues = new Set<TraceIssue>();
  const ids = new Set(observations.map(({ id }) => id));
  let hasGeneration = false;
  let hasParent = false;

  for (const observation of observations) {
    const { type, name, parentObservationId } = observation;
    const emptyIO = isEmpty(observation.input) && isEmpty(observation.output);
    if (type === "GENERATION") {
      hasGeneration = true;
      if (emptyIO) issues.add(TraceIssue.EMPTY_GENERATION_IO);
    }
    if (parentObservationId) {
      hasParent = true;
      if (!ids.has(parentObservationId)) issues.add(TraceIssue.MISSING_PARENT);
    }
    if (
      emptyIO &&
      isRootObservation({
        parentObservationId,
        isAppRoot: observation.isAppRoot,
      })
    )
      issues.add(TraceIssue.EMPTY_ROOT_IO);
    if (
      type === "SPAN" &&
      name &&
      emptyIO &&
      infrastructureNames.some((pattern) => pattern.test(name.trim()))
    )
      issues.add(TraceIssue.INFRASTRUCTURE_SPANS);
  }

  if (!hasGeneration) issues.add(TraceIssue.NO_GENERATIONS);
  if (observations.length > 1 && !hasParent) issues.add(TraceIssue.NO_NESTING);
  return [...issues].sort();
}
