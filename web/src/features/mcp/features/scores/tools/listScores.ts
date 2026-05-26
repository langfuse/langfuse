import {
  filterAndValidateV2GetScoreList,
  InvalidRequestError,
  ScoreDataTypeDomain,
  ScoreSourceDomain,
  singleFilter,
  publicApiPaginationZod,
} from "@langfuse/shared";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";

const ScoreFieldsSchema = z
  .array(z.enum(["score", "trace"]))
  .default(["score", "trace"])
  .describe(
    "Response field groups to include. 'score' is always required. Include 'trace' when filtering by userId or traceTags.",
  );

const ListScoresInputSchema = z.object({
  ...publicApiPaginationZod,
  fields: ScoreFieldsSchema,
  userId: z.string().optional(),
  dataType: ScoreDataTypeDomain.optional(),
  configId: z.string().optional(),
  queueId: z.string().optional(),
  traceTags: z
    .array(z.string())
    .optional()
    .describe("Trace tags to filter by."),
  environment: z
    .array(z.string())
    .optional()
    .describe("Score environments to filter by."),
  name: z.string().optional(),
  fromTimestamp: z.iso.datetime({ offset: true }).optional(),
  toTimestamp: z.iso.datetime({ offset: true }).optional(),
  source: ScoreSourceDomain.optional(),
  value: z.number().optional(),
  operator: z.enum(["<", ">", "<=", ">=", "!=", "="]).optional(),
  scoreIds: z.array(z.string()).optional(),
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  datasetRunId: z.string().optional(),
  observationId: z.array(z.string()).optional(),
  filter: z
    .array(singleFilter)
    .optional()
    .describe(
      "Advanced score filters as JSON objects with column, operator, value, and type.",
    ),
});

type ListScoresInput = z.infer<typeof ListScoresInputSchema>;

const assertValidScoreFields = (input: ListScoresInput) => {
  if (!input.fields.includes("score")) {
    throw new InvalidRequestError("Scores needs to be selected always.");
  }

  const hasTraceFilters =
    Boolean(input.userId) || (input.traceTags?.length ?? 0) > 0;
  if (!input.fields.includes("trace") && hasTraceFilters) {
    throw new InvalidRequestError(
      "Cannot filter by trace properties (userId, traceTags) when 'trace' field is not included. Please add 'trace' to the fields parameter or remove trace filters.",
    );
  }
};

export const [listScoresTool, handleListScores] = defineTool({
  name: "listScores",
  description: [
    "Find scores in the current Langfuse project.",
    "Uses the v2 /api/public/v2/scores semantics for numeric, categorical, boolean, correction, and text scores across traces, observations, sessions, and dataset runs.",
    "Results are paginated with page and limit and return exactly data and meta at the top level.",
  ].join("\n"),
  baseSchema: ListScoresInputSchema,
  inputSchema: ListScoresInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.scores.list",
      context,
      attributes: {
        "mcp.pagination_page": input.page,
        "mcp.pagination_limit": input.limit,
        "mcp.score_fields": input.fields.join(","),
      },
      fn: async (span) => {
        assertValidScoreFields(input);

        const scoreParams = {
          projectId: context.projectId,
          page: input.page,
          limit: input.limit,
          userId: input.userId,
          name: input.name,
          configId: input.configId,
          sessionId: input.sessionId,
          traceId: input.traceId,
          observationId: input.observationId,
          datasetRunId: input.datasetRunId,
          queueId: input.queueId,
          traceTags: input.traceTags,
          dataType: input.dataType,
          fromTimestamp: input.fromTimestamp,
          toTimestamp: input.toTimestamp,
          environment: input.environment,
          source: input.source,
          value: input.value,
          operator: input.operator,
          scoreIds: input.scoreIds,
          fields: input.fields,
          advancedFilters: input.filter,
        };

        const scoresApiService = new ScoresApiService("v2");
        const [items, count] = await Promise.all([
          scoresApiService.generateScoresForPublicApi(scoreParams),
          scoresApiService.getScoresCountForPublicApi(scoreParams),
        ]);

        const totalItems = count ?? 0;
        const data = filterAndValidateV2GetScoreList(items);
        span.setAttribute("mcp.result_count", data.length);

        return {
          data,
          meta: {
            page: input.page,
            limit: input.limit,
            totalItems,
            totalPages: Math.ceil(totalItems / input.limit),
          },
        };
      },
    });
  },
  readOnlyHint: true,
});
