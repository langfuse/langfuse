import type { Observation } from "../../domain";

export enum TraceIssue {
  NO_GENERATIONS = "NO_GENERATIONS",
  NO_NESTING = "NO_NESTING",
  INFRASTRUCTURE_SPANS = "INFRASTRUCTURE_SPANS",
  EMPTY_GENERATION_IO = "EMPTY_GENERATION_IO",
  EMPTY_ROOT_IO = "EMPTY_ROOT_IO",
  MISSING_PARENT = "MISSING_PARENT",
}

export type TraceIssueObservation = Pick<
  Observation,
  "id" | "parentObservationId" | "type" | "name" | "input" | "output"
> & { isAppRoot?: boolean | null };
