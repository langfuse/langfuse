import {
  InvalidRequestError,
  SCORE_FIELD_GROUPS_V3,
  ScoreDataTypeDomain,
  ScoreSourceDomain,
} from "@langfuse/shared";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { EncodedScoresCursorV3 } from "@/src/features/public-api/types/scores";
import { buildScoreSubjectUrl } from "../lib/subject-url";

const ListScoresBaseSchema = z
  .object({
    limit: z.number().int().gte(1).lte(100).default(50),
    cursor: z
      .string()
      .optional()
      .describe(
        "Opaque pagination cursor from meta.cursor of a previous listScores response.",
      ),
    id: z.array(z.string()).optional().describe("Score IDs to match."),
    name: z.array(z.string()).optional().describe("Score names to match."),
    source: z.array(ScoreSourceDomain).optional(),
    dataType: z.array(ScoreDataTypeDomain).optional(),
    environment: z.array(z.string()).optional(),
    configId: z.array(z.string()).optional(),
    queueId: z
      .array(z.string())
      .optional()
      .describe("Annotation queue IDs to match."),
    authorUserId: z
      .array(z.string())
      .optional()
      .describe("Author (annotator) user IDs to match."),
    value: z
      .array(z.coerce.string())
      .optional()
      .describe(
        'Exact score values to match, encoded as strings (e.g. "0.5", "true", "good"). Requires a single dataType of NUMERIC, BOOLEAN, or CATEGORICAL.',
      ),
    valueMin: z
      .number()
      .optional()
      .describe(
        'Minimum score value (inclusive). Requires dataType: ["NUMERIC"].',
      ),
    valueMax: z
      .number()
      .optional()
      .describe(
        'Maximum score value (inclusive). Requires dataType: ["NUMERIC"].',
      ),
    traceId: z.array(z.string()).optional().describe("Trace IDs to match."),
    sessionId: z.array(z.string()).optional().describe("Session IDs to match."),
    observationId: z
      .array(z.string())
      .optional()
      .describe("Observation IDs to match. Requires traceId."),
    experimentId: z
      .array(z.string())
      .optional()
      .describe("Experiment (dataset run) IDs to match."),
    fromTimestamp: z.iso.datetime({ offset: true }).optional(),
    toTimestamp: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

// EncodedScoresCursorV3 throws InvalidRequestError for undecodable base64/JSON
// but a ZodError for decodable JSON with a mismatched schema (e.g. a future
// cursor version); normalize both to the same client-facing error.
const parseCursor = (cursor: string) => {
  try {
    return EncodedScoresCursorV3.parse(cursor);
  } catch (_e) {
    throw new InvalidRequestError("Invalid cursor format");
  }
};

const ListScoresInputSchema = ListScoresBaseSchema.superRefine((data, ctx) => {
  if (data.value !== undefined && data.value.length > 0) {
    const dataType = data.dataType?.length === 1 ? data.dataType[0] : undefined;
    if (
      !dataType ||
      !["NUMERIC", "BOOLEAN", "CATEGORICAL"].includes(dataType)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "value filter requires a single dataType from: NUMERIC, BOOLEAN, CATEGORICAL",
      });
    } else if (dataType === "NUMERIC") {
      for (const v of data.value) {
        if (!isFinite(Number(v))) {
          ctx.addIssue({
            code: "custom",
            message: `value filter with dataType=NUMERIC requires each value to be a finite number (got "${v}")`,
          });
        }
      }
    } else if (dataType === "BOOLEAN") {
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

  if (
    (data.valueMin !== undefined || data.valueMax !== undefined) &&
    !(data.dataType?.length === 1 && data.dataType[0] === "NUMERIC")
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        "valueMin and valueMax require dataType=NUMERIC as a single value",
    });
  }

  if (
    (data.observationId?.length ?? 0) > 0 &&
    (data.traceId?.length ?? 0) === 0
  ) {
    ctx.addIssue({
      code: "custom",
      message:
        "observationId filter requires traceId — observation IDs are scoped to a trace",
    });
  }

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

export const [listScoresTool, handleListScores] = defineTool({
  name: "listScores",
  description: [
    "Find scores in Langfuse.",
    "Use this to review quality, evaluation, or feedback scores for traces, observations, sessions, and experiments (dataset runs).",
    "Each score carries a polymorphic value matching its dataType (number, boolean, or string) and a subject describing what it scores: { kind: trace | observation | session | experiment, id }.",
    "Results are paginated with an opaque cursor: pass meta.cursor from the previous response to fetch the next page; a response without meta.cursor is the last page.",
    "Filtering by trace user or trace tags is not supported. To find scores for a specific user, first resolve the user's trace IDs (e.g. via listObservations with userId), then filter scores by traceId.",
    "Score reads are eventually consistent: a score created with createScore may not appear in listScores immediately. If a newly created score is missing, wait briefly and retry.",
  ].join("\n"),
  baseSchema: ListScoresBaseSchema,
  inputSchema: ListScoresInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.scores.list",
      context,
      attributes: {
        "mcp.pagination_limit": input.limit,
      },
      fn: async (span) => {
        const result = await listScoresV3ForPublicApi({
          projectId: context.projectId,
          limit: input.limit,
          cursor: input.cursor ? parseCursor(input.cursor) : undefined,
          // Always fetch every field group: subject feeds the url mapping below.
          fields: [...SCORE_FIELD_GROUPS_V3],
          id: input.id,
          name: input.name,
          source: input.source,
          dataType: input.dataType,
          environment: input.environment,
          configId: input.configId,
          queueId: input.queueId,
          authorUserId: input.authorUserId,
          value: input.value,
          valueMin: input.valueMin,
          valueMax: input.valueMax,
          traceId: input.traceId,
          sessionId: input.sessionId,
          observationId: input.observationId,
          experimentId: input.experimentId,
          fromTimestamp: input.fromTimestamp
            ? new Date(input.fromTimestamp)
            : undefined,
          toTimestamp: input.toTimestamp
            ? new Date(input.toTimestamp)
            : undefined,
        });

        const data = result.data.map((score) => {
          const url = buildScoreSubjectUrl(context.projectId, score.subject);
          return url ? { ...score, url } : score;
        });
        span.setAttribute("mcp.result_count", data.length);

        return {
          data,
          meta: {
            limit: input.limit,
            ...(result.cursor ? { cursor: result.cursor } : {}),
          },
        };
      },
    });
  },
  readOnlyHint: true,
});
