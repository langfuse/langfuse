import {
  InvalidRequestError,
  LangfuseNotFoundError,
  PublicApiCreateScoreSourceDomain,
  PostScoresBodyV1,
  PostScoresResponseV1,
  UnauthorizedError,
} from "@langfuse/shared";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { ApiServerError } from "../../../core/errors";
import { z } from "zod";

type CreateScoreBatchError = {
  status: number;
  message?: string;
  error?: string;
};

const throwCreateScoreBatchError = (error: CreateScoreBatchError): never => {
  const message = error.error ?? error.message ?? "Failed to create score";

  if (error.status === 400) {
    throw new InvalidRequestError(message);
  }

  if (error.status === 401) {
    throw new UnauthorizedError(message);
  }

  if (error.status === 404) {
    throw new LangfuseNotFoundError(message);
  }

  throw new ApiServerError("Failed to create score");
};

const CreateScoreBaseSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  traceId: z.string().optional(),
  sessionId: z.string().optional(),
  datasetRunId: z.string().optional(),
  observationId: z.string().optional(),
  comment: z.string().optional(),
  metadata: z.any().optional(),
  environment: z.string().optional(),
  queueId: z.string().optional(),
  source: PublicApiCreateScoreSourceDomain.optional(),
  value: z
    .any()
    .describe(
      "Score value. Use number for NUMERIC and BOOLEAN scores; use string for CATEGORICAL, TEXT, and CORRECTION scores.",
    ),
  dataType: z
    .enum(["NUMERIC", "CATEGORICAL", "BOOLEAN", "CORRECTION", "TEXT"])
    .optional()
    .describe(
      "Score data type. When omitted, legacy scoring accepts string or number values.",
    ),
  configId: z.string().optional(),
});

export const [createScoreTool, handleCreateScore] = defineTool({
  name: "createScore",
  description:
    "Create one score in the current Langfuse project using the v1 /api/public/scores route semantics. This is the v1 fallback because score creation has no v2 public route.",
  baseSchema: CreateScoreBaseSchema,
  inputSchema: PostScoresBodyV1,
  destructiveHint: true,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.scores.create",
      context,
      attributes: {
        "mcp.score_id": input.id ?? undefined,
        "mcp.score_name": input.name,
      },
      fn: async (span) => {
        const scoresApiService = new ScoresApiService("v2");
        const { id: scoreId, result } = await scoresApiService.createScore({
          body: input,
          auth: {
            validKey: true,
            scope: {
              projectId: context.projectId,
              orgId: context.orgId,
              apiKeyId: context.apiKeyId,
              publicKey: context.publicKey,
              accessLevel: context.accessLevel,
              isIngestionSuspended: false,
            },
          },
        });
        span.setAttribute("mcp.score_id", scoreId);

        if (result.errors.length > 0) {
          throwCreateScoreBatchError(result.errors[0]);
        }

        if (result.successes.length !== 1) {
          throw new ApiServerError("Failed to create score");
        }

        return PostScoresResponseV1.parse({ id: scoreId });
      },
    });
  },
});
