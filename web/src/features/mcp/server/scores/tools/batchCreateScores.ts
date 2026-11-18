import { PostScoreBodyV1 } from "@langfuse/shared";
import { ScoresApiService } from "@/src/features/public-api/server/scores-api-service";
import {
  buildScoreTargetUrl,
  createUnknownSdkIngestionAttribution,
} from "@langfuse/shared/src/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateScoreBaseSchema } from "./createScore";

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
    `Create up to ${MAX_BATCH_CREATE_SCORES} scores in the current Langfuse project in one call. Each score accepts the same fields as createScore.`,
    "All scores are validated before any is created; an invalid score rejects the whole call. Scores that fail during ingestion are listed in errors by index while the others are still created.",
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
      fn: async (span) => {
        const scores = input.scores.map((score) => ({
          ...score,
          id: score.id ?? randomUUID(),
        }));
        const auth = {
          validKey: true as const,
          scope: {
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            publicKey: context.publicKey,
            accessLevel: context.accessLevel,
            isIngestionSuspended: false,
          },
        };

        const { result, eventIds } = await new ScoresApiService(
          "v2",
        ).createScores({
          bodies: scores,
          auth,
          auditScope: context,
          attribution: createUnknownSdkIngestionAttribution({
            authCheck: auth,
          }),
        });
        span.setAttribute("mcp.score_rejected_count", result.errors.length);

        const errorByEventId = new Map(
          result.errors.map((error) => [error.id, error]),
        );
        const created = [];
        const errors = [];

        for (const [index, score] of scores.entries()) {
          const error = errorByEventId.get(eventIds[index]);
          if (error) {
            errors.push({
              index,
              id: score.id,
              message: error.error ?? error.message ?? "Failed to create score",
            });
            continue;
          }

          const url = buildScoreTargetUrl({
            projectId: context.projectId,
            traceId: score.traceId,
            observationId: score.observationId,
            sessionId: score.sessionId,
          });
          created.push(
            url ? { index, id: score.id, url } : { index, id: score.id },
          );
        }

        return { data: created, errors };
      },
    }),
});
