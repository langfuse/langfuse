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
    `Create up to ${MAX_BATCH_CREATE_SCORES} scores in one call, each as in createScore; ids must be unique within the batch.`,
    "A schema error in any score rejects the whole call before anything is created. Otherwise scores are created one by one and the call returns { data, errors } keyed by input index; a score that fails is listed in errors while the others are still created.",
    "Reads are eventually consistent: getScore and listScores may not return new scores immediately; wait briefly and retry.",
  ].join("\n"),
  action: "scores:save",
  baseSchema: BatchCreateScoresBaseSchema,
  inputSchema: BatchCreateScoresInputSchema,
  annotations: { destructiveHint: true },
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
