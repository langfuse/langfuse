import { SpanKind } from "@opentelemetry/api";
import { DeleteScoreQueryV1, DeleteScoreResponseV1 } from "@langfuse/shared";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { defineTool } from "../../../core/define-tool";

export const [deleteScoreTool, handleDeleteScore] = defineTool({
  name: "deleteScore",
  description:
    "Delete one score from the current Langfuse project using the v1 /api/public/scores/{scoreId} route semantics. This is the v1 fallback because score deletion has no v2 public route.",
  baseSchema: DeleteScoreQueryV1,
  inputSchema: DeleteScoreQueryV1,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.scores.delete", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.score_id": input.scoreId,
        });

        const scoresApiService = new ScoresApiService("v2");
        const result = await scoresApiService.deleteScore({
          scoreId: input.scoreId,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
        });

        return DeleteScoreResponseV1.parse(result);
      },
    );
  },
  destructiveHint: true,
});
