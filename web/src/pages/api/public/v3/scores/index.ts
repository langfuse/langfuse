import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { GetScoresQueryV3, GetScoresResponseV3 } from "@langfuse/shared";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { EncodedScoresCursorV3 } from "@/src/features/public-api/types/scores";

const GetScoresV3Query = GetScoresQueryV3.extend({
  cursor: EncodedScoresCursorV3.optional(),
}).superRefine((data, ctx) => {
  if (data.userId !== undefined) {
    ctx.addIssue({
      code: "custom",
      message:
        "userId filter requires a trace JOIN and is not supported in v3 — use v2 or omit this filter",
    });
  }
  if (data.traceTags !== undefined) {
    ctx.addIssue({
      code: "custom",
      message:
        "traceTags filter requires a trace JOIN and is not supported in v3 — use v2 or omit this filter",
    });
  }
  if (data.value !== undefined && data.value.length > 0) {
    if (!data.dataType || data.dataType.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message:
          "value filter requires a single dataType from: NUMERIC, BOOLEAN, CATEGORICAL",
      });
    } else {
      const dt = data.dataType[0];
      if (!["NUMERIC", "BOOLEAN", "CATEGORICAL"].includes(dt)) {
        ctx.addIssue({
          code: "custom",
          message: `value filter requires dataType to be NUMERIC, BOOLEAN, or CATEGORICAL (got "${dt}")`,
        });
      } else if (dt === "NUMERIC") {
        for (const v of data.value) {
          if (!isFinite(Number(v))) {
            ctx.addIssue({
              code: "custom",
              message: `value filter with dataType=NUMERIC requires each value to be a finite number (got "${v}")`,
            });
          }
        }
      } else if (dt === "BOOLEAN") {
        for (const v of data.value) {
          if (v !== "true" && v !== "false") {
            ctx.addIssue({
              code: "custom",
              message: `value filter with dataType=BOOLEAN requires each value to be "true" or "false" (got "${v}")`,
            });
          }
        }
      }
    }
  }
  if (data.valueMin !== undefined || data.valueMax !== undefined) {
    if (
      !data.dataType ||
      data.dataType.length !== 1 ||
      data.dataType[0] !== "NUMERIC"
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "valueMin and valueMax require dataType=NUMERIC as a single value",
      });
    }
  }
  const hasTraceId = (data.traceId?.length ?? 0) > 0;
  const hasObservationId = (data.observationId?.length ?? 0) > 0;

  if (hasObservationId && !hasTraceId) {
    ctx.addIssue({
      code: "custom",
      message:
        "observationId filter requires traceId — observation IDs are scoped to a trace",
    });
  }

  // traceId, sessionId, experimentId remain mutually exclusive with each other.
  // observationId is allowed alongside traceId (enforced above).
  const exclusiveEntityFilters = [
    data.traceId,
    data.sessionId,
    data.experimentId,
  ].filter((arr) => arr && arr.length > 0);
  if (exclusiveEntityFilters.length > 1) {
    ctx.addIssue({
      code: "custom",
      message:
        "At most one of traceId, sessionId, experimentId may be specified",
    });
  }
});

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores V3",
    querySchema: GetScoresV3Query,
    responseSchema: GetScoresResponseV3,
    fn: async ({ query, auth }) => {
      const result = await listScoresV3ForPublicApi({
        projectId: auth.scope.projectId,
        limit: query.limit,
        cursor: query.cursor,
        fields: query.fields,
        id: query.id,
        name: query.name,
        source: query.source,
        dataType: query.dataType,
        environment: query.environment,
        configId: query.configId,
        queueId: query.queueId,
        authorUserId: query.authorUserId,
        value: query.value,
        valueMin: query.valueMin,
        valueMax: query.valueMax,
        traceId: query.traceId,
        sessionId: query.sessionId,
        observationId: query.observationId,
        experimentId: query.experimentId,
        fromTimestamp: query.fromTimestamp,
        toTimestamp: query.toTimestamp,
      });

      return {
        data: result.data,
        meta: {
          limit: query.limit,
          ...(result.cursor ? { cursor: result.cursor } : {}),
        },
      };
    },
  }),
});
