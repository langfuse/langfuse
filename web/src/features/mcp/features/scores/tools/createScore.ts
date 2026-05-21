import { SpanKind } from "@opentelemetry/api";
import { PostScoresBodyV1, PostScoresResponseV1 } from "@langfuse/shared";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import { defineTool } from "../../../core/define-tool";

export const [createScoreTool, handleCreateScore] = defineTool({
  name: "createScore",
  description:
    "Create one score in the current Langfuse project using the v1 /api/public/scores route semantics. This is the v1 fallback because score creation has no v2 public route.",
  baseSchema: PostScoresBodyV1,
  inputSchema: PostScoresBodyV1,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.scores.create", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          ...(input.id ? { "mcp.score_id": input.id } : {}),
          "mcp.score_name": input.name,
        });

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
          const error = result.errors[0];
          throw new Error(
            error.error ?? error.message ?? "Failed to create score",
          );
        }

        if (result.successes.length !== 1) {
          throw new Error("Failed to create score");
        }

        return PostScoresResponseV1.parse({ id: scoreId });
      },
    );
  },
  destructiveHint: true,
});
