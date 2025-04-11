import z from "zod";

export const applyScoreValidation = <T extends z.ZodType<any, any, any>>(
  schema: T,
) => {
  return schema.refine(
    (data) => {
      const hasTraceId = !!data.traceId;
      const hasSessionId = !!data.sessionId;

      return (
        (hasTraceId && !hasSessionId) ||
        (hasSessionId && !hasTraceId && !data.observationId)
      );
    },
    {
      message:
        "Either provide traceId (with optional observationId) or sessionId, but not both. ObservationId requires traceId.",
      path: ["traceId", "sessionId", "observationId"],
    },
  );
};
