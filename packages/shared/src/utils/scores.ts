import z from "zod";

export const applyScoreValidation = <T extends z.ZodType<any, any, any>>(
  schema: T,
) => {
  return schema.refine(
    (data) => {
      const hasTraceId = !!data.traceId;
      const hasSessionId = !!data.sessionId;
      const hasRunId = !!data.runId;

      return (
        (hasTraceId && !hasSessionId && !hasRunId) ||
        (hasSessionId && !hasTraceId && !hasRunId && !data.observationId) ||
        (hasRunId && !hasTraceId && !hasSessionId && !data.observationId)
      );
    },
    {
      message:
        "Provide exactly one of the following: traceId (with optional observationId), sessionId or runId. ObservationId requires traceId.",
      path: ["traceId", "sessionId", "runId", "observationId"],
    },
  );
};
