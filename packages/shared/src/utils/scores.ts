import z from "zod/v4";

export const applyScoreValidation = <T extends z.ZodType<any, any, any>>(
  schema: T,
) => {
  return schema.refine(
    (data) => {
      const hasTraceId = !!data.traceId;
      const hasSessionId = !!data.sessionId;
      const hasDatasetRunId = !!data.datasetRunId;

      return (
        (hasTraceId && !hasSessionId && !hasDatasetRunId) ||
        (hasSessionId &&
          !hasTraceId &&
          !hasDatasetRunId &&
          !data.observationId) ||
        (hasDatasetRunId && !hasTraceId && !hasSessionId && !data.observationId)
      );
    },
    {
      message:
        "Provide exactly one of the following: traceId (with optional observationId), sessionId or datasetRunId. ObservationId requires traceId.",
      path: ["traceId", "sessionId", "datasetRunId", "observationId"],
    },
  );
};
