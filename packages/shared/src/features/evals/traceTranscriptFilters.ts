import {
  evalFilterFields,
  type EvalFilterDefinition,
  type ObservationEvalColumnDef,
} from "./filterFields";

/** One observation must satisfy every condition to select its whole trace. */
const traceTranscriptFilterColumns: ObservationEvalColumnDef[] = [
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
  evalFilterFields.statusMessage,
  evalFilterFields.providedModelName,
  evalFilterFields.promptName,
  evalFilterFields.experimentId,
  evalFilterFields.experimentName,
  evalFilterFields.experimentDatasetId,
  evalFilterFields.isRootObservation,
  evalFilterFields.isExperimentItemRootSpan,
];

/** Restrict operators to predicates exposed for matching a single observation. */
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
