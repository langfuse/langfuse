import { PostScoreBodyV1 } from "@langfuse/shared";
import { randomUUID } from "crypto";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateScoreBaseSchema, createScoreForMcp } from "./createScore";

const MAX_BATCH_CREATE_SCORES = 100;

const BatchCreateScoresBaseSchema = z.object({
  scores: z.array(CreateScoreBaseSchema).min(1).max(MAX_BATCH_CREATE_SCORES),
});

const BatchCreateScoresInputSchema = z.object({
  scores: z.array(PostScoreBodyV1).min(1).max(MAX_BATCH_CREATE_SCORES),
});

export const [batchCreateScoresTool, handleBatchCreateScores] = defineTool({
  name: "batchCreateScores",
  description: [
    `Create up to ${MAX_BATCH_CREATE_SCORES} scores in the current Langfuse project. Each score accepts the same fields as createScore.`,
    "All scores are validated before any is created. Scores are then created in order; the operation stops on the first failure, names the failing index, and is not atomic.",
    "Score reads are eventually consistent: after creation, getScore and listScores may not return the new scores immediately. Wait briefly and retry reads when confirming creation.",
  ].join("\n"),
  action: "scores:save",
  baseSchema: BatchCreateScoresBaseSchema,
  inputSchema: BatchCreateScoresInputSchema,
  destructiveHint: true,
  expensiveHint: true,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.scores.batch_create",
      context,
      attributes: {
        "mcp.score_count": input.scores.length,
      },
      fn: async () => {
        const data = [];

        for (const [index, score] of input.scores.entries()) {
          data.push(
            await createScoreForMcp({
              input: { ...score, id: score.id ?? randomUUID() },
              context,
              errorMessagePrefix: `scores[${index}]: `,
            }),
          );
        }

        return { data };
      },
    }),
});
