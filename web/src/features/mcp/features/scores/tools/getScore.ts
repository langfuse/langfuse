import { LangfuseNotFoundError, SCORE_FIELD_GROUPS_V3 } from "@langfuse/shared";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { listScoresV3ForPublicApi } from "@/src/features/public-api/server/scores-api-v3";
import { buildScoreSubjectUrl } from "../lib/subject-url";

const GetScoreInputSchema = z.object({ scoreId: z.string() }).strict();

export const [getScoreTool, handleGetScore] = defineTool({
  name: "getScore",
  description: [
    "Fetch one score by ID from the current Langfuse project.",
    "The score carries a polymorphic value matching its dataType (number, boolean, or string) and a subject describing what it scores: { kind: trace | observation | session | experiment, id }.",
    "Score reads are eventually consistent: a score created with createScore may not be returned by getScore immediately. If a newly created score is not found, wait briefly and retry.",
  ].join("\n"),
  baseSchema: GetScoreInputSchema,
  inputSchema: GetScoreInputSchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.scores.get",
      context,
      attributes: { "mcp.score_id": input.scoreId },
      fn: async () => {
        // v3 has no by-id route; a v3 list with an id filter is the lookup path.
        const result = await listScoresV3ForPublicApi({
          projectId: context.projectId,
          limit: 1,
          fields: [...SCORE_FIELD_GROUPS_V3],
          id: [input.scoreId],
        });

        const score = result.data[0];
        if (!score) {
          throw new LangfuseNotFoundError("Score not found");
        }

        const url = buildScoreSubjectUrl(context.projectId, score.subject);
        return url ? { ...score, url } : score;
      },
    });
  },
  readOnlyHint: true,
});
