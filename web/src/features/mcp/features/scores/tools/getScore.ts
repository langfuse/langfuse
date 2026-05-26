import {
  GetScoreQueryV2,
  GetScoreResponseV2,
  InternalServerError,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { logger, traceException } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";

export const [getScoreTool, handleGetScore] = defineTool({
  name: "getScore",
  description:
    "Fetch one score by ID from the current Langfuse project using the v2 /api/public/v2/scores/{scoreId} semantics. Returns the public score object directly.",
  baseSchema: GetScoreQueryV2,
  inputSchema: GetScoreQueryV2,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.scores.get",
      context,
      attributes: { "mcp.score_id": input.scoreId },
      fn: async () => {
        const scoresApiService = new ScoresApiService("v2");
        const score = await scoresApiService.getScoreById({
          projectId: context.projectId,
          scoreId: input.scoreId,
        });

        if (!score) {
          throw new LangfuseNotFoundError("Score not found");
        }

        const parsedScore = GetScoreResponseV2.safeParse(score);
        if (!parsedScore.success) {
          traceException(parsedScore.error);
          logger.error(`Incorrect score return type ${parsedScore.error}`);
          throw new InternalServerError("Requested score is corrupted");
        }

        return parsedScore.data;
      },
    });
  },
  readOnlyHint: true,
});
