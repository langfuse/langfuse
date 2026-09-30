import type { Observation } from "../../domain";

export { TraceIssue } from "../../features/tracelift/types";

export type TraceIssueObservation = Pick<
  Observation,
  "id" | "parentObservationId" | "type" | "name" | "input" | "output"
> & { isAppRoot?: boolean | null };
