import {
  evalFilterFields,
  type EvalFilterDefinition,
  type ObservationEvalColumnDef,
} from "./filterFields";

/** One observation must satisfy every condition to select its whole trace. */
export const traceTranscriptFilterColumns: ObservationEvalColumnDef[] = [
  evalFilterFields.traceName,
  evalFilterFields.userId,
  evalFilterFields.sessionId,
  evalFilterFields.tags,
  evalFilterFields.metadata,
  evalFilterFields.name,
  evalFilterFields.type,
  evalFilterFields.environment,
  evalFilterFields.version,
  evalFilterFields.release,
  evalFilterFields.level,
  evalFilterFields.experimentId,
  evalFilterFields.experimentName,
  evalFilterFields.experimentDatasetId,
  evalFilterFields.isRootObservation,
];

/** Positive predicates select a trace as soon as one span matches. */
export const traceTranscriptFilterDefinition: EvalFilterDefinition = {
  columns: traceTranscriptFilterColumns,
  operators: {
    string: ["=", "contains", "starts with", "ends with", "is not empty"],
    stringOptions: ["any of"],
    arrayOptions: ["any of", "all of"],
    stringObject: ["=", "contains", "starts with", "ends with", "is set"],
    boolean: ["="],
    null: [],
  },
};
