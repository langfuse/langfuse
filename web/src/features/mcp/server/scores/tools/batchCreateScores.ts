import { PostScoreBodyV1 } from "@langfuse/shared";
import { idSchema } from "@langfuse/shared/src/server";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { formatErrorForUser } from "../../../core/error-formatting";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateScoreBaseSchema, handleCreateScore } from "./createScore";

const MAX_BATCH_CREATE_SCORES = 10;

const BatchCreateScoresBaseSchema = z.object({
  scores: z.array(CreateScoreBaseSchema).min(1).max(MAX_BATCH_CREATE_SCORES),
});

const BatchCreateScoresInputSchema = z.object({
  scores: z
    .array(PostScoreBodyV1)
    .min(1)
    .max(MAX_BATCH_CREATE_SCORES)
    .superRefine((scores, ctx) => {
      const seenIds = new Set<string>();
      for (const [index, score] of scores.entries()) {
        if (score.id === undefined || score.id === null) continue;
        // Ingestion checks ids per score, which would fail mid-batch.
        for (const issue of idSchema.safeParse(score.id).error?.issues ?? []) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: [index, "id"],
          });
        }
        if (seenIds.has(score.id)) {
          ctx.addIssue({
            code: "custom",
            message: "Score id must be unique within a batch",
            path: [index, "id"],
          });
        }
        seenIds.add(score.id);
      }
    }),
});

export const [batchCreateScoresTool, handleBatchCreateScores] = defineTool({
  name: "batchCreateScores",
  description: [
    `Create up to ${MAX_BATCH_CREATE_SCORES} scores in the current Langfuse project in one call. Each score accepts the same fields as createScore.`,
    "All scores are validated before any is created; an invalid score rejects the whole call. Scores that fail during creation are listed in errors by index while the others are still created.",
    "Score reads are eventually consistent: after creation, getScore and listScores may not return the new scores immediately. Wait briefly and retry reads when confirming creation.",
  ].join("\n"),
  action: "scores:save",
  baseSchema: BatchCreateScoresBaseSchema,
  inputSchema: BatchCreateScoresInputSchema,
  destructiveHint: true,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.scores.batch_create",
      context,
      attributes: {
        "mcp.score_count": input.scores.length,
      },
      fn: async () => {
        const data = [];
        const errors = [];

        // Creates scores one at a time so each gets createScore's audit log.
        // Switch to one batched ingestion call once the batch score service
        // writes audit logs.
        for (const [index, score] of input.scores.entries()) {
          try {
            const created = await handleCreateScore(score, context);
            data.push({ index, ...(created as { id: string; url?: string }) });
          } catch (error) {
            errors.push({ index, message: formatErrorForUser(error).message });
          }
        }

        return { data, errors };
      },
    }),
});
