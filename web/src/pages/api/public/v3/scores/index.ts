import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQueryV3,
  GetScoresResponseV3,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { EncodedScoresCursorV3 } from "@/src/features/public-api/types/scores";
import { env } from "@/src/env.mjs";

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
  if (data.value !== undefined) {
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
  const entityFilters = [
    data.traceId,
    data.sessionId,
    data.observationId,
    data.experimentId,
  ].filter(Boolean);
  if (entityFilters.length > 1) {
    ctx.addIssue({
      code: "custom",
      message:
        "At most one of traceId, sessionId, observationId, experimentId may be specified",
    });
  }
});

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Scores V3",
    querySchema: GetScoresV3Query,
    responseSchema: GetScoresResponseV3,
    fn: async ({ query, auth }) => {
      if (env.LANGFUSE_ENABLE_SCORES_V3_API !== "true") {
        // Generic message to avoid disclosing the feature-flag existence to
        // unauthenticated probes. Cloud has the flag on; self-hosted gets 404.
        throw new LangfuseNotFoundError("Not Found");
      }

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
