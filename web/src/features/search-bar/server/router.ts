// v4 search-bar AI filter endpoint.
//
// Unlike the legacy `naturalLanguageFilters.createCompletion` (whose remotely
// managed prompt targets the OLD trace columns), this procedure builds its
// prompt from the search-bar field registry (`buildFilterSystemPrompt`), so the
// model's vocabulary is exactly the v4 events grammar. It then ROUND-TRIPS the
// model output through `filterStateToQueryText` and returns only the filters
// that lower to bar pills — a hallucinated/unknown column can never reach the
// client. The frontend applies the result via the bar's existing setFilterState
// path (apply-immediately), and the bar re-derives the editable pills.

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  ChatMessageRole,
  ChatMessageType,
  LangfuseInternalTraceEnvironment,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { z } from "zod";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  MAX_SCORE_NAME_LENGTH,
  MAX_SCORE_NAMES_PER_TYPE,
} from "../lib/observed-options";
import { buildFilterSystemPrompt } from "./buildFilterPrompt";
import { parseGeneratedFilters } from "./parseFilterCompletion";
import {
  generateLangfuseAIText,
  getLangfuseAITraceSinkParams,
  isLangfuseAITracingConfigured,
} from "@/src/features/ai-features/server/bedrockCompletion";
import { getProductBaseUrl } from "@/src/utils/base-url";

// Caps shared with `observedScoreNamesFromOptions` (the client-side builder),
// which sends a set as undefined instead of ever exceeding them.
const scoreNameList = z
  .array(z.string().max(MAX_SCORE_NAME_LENGTH))
  .max(MAX_SCORE_NAMES_PER_TYPE);

const GenerateFilterInput = z.object({
  projectId: z.string(),
  prompt: z.string().min(1).max(2048),
  /** Existing bar query text, so the model refines the current filters. */
  currentQuery: z.string().max(4096).optional(),
  /** Project data context (observed values, metadata keys, result count) built
   *  on the client from already-loaded filterOptions + visible rows. */
  dataContext: z.string().max(16000).optional(),
  /** Observed score names by column type (from filterOptions), used to
   *  validate/correct the score names the model returns. A set left undefined
   *  means that column hasn't loaded client-side — it is not enforced. */
  scoreNames: z
    .object({
      numeric: scoreNameList.optional(),
      categorical: scoreNameList.optional(),
      booleans: scoreNameList.optional(),
      traceNumeric: scoreNameList.optional(),
      traceCategorical: scoreNameList.optional(),
      traceBooleans: scoreNameList.optional(),
    })
    .optional(),
});

export const searchBarRouter = createTRPCRouter({
  generateFilter: protectedProjectProcedure
    .input(GenerateFilterInput)
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "prompts:CUD",
        });

        if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "AI filter generation is not available in self-hosted deployments.",
          });
        }

        const project = await ctx.prisma.project.findUnique({
          where: { id: input.projectId },
          select: {
            organization: {
              select: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
            },
          },
        });

        if (!project) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Project not found.",
          });
        }

        if (!project.organization.aiFeaturesEnabled) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "AI features are not enabled for this organization.",
          });
        }

        const model =
          env.LANGFUSE_AWS_BEDROCK_SMALL_MODEL ??
          env.LANGFUSE_AWS_BEDROCK_MODEL;

        if (!model) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Bedrock environment variables not configured. Please set LANGFUSE_AWS_BEDROCK_* variables.",
          });
        }

        // Anchor relative time expressions ("today", "last 24h") to now.
        const now = new Date();
        const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
        const currentDatetime = `${dayOfWeek}, ${now.toISOString()}`;
        const systemPrompt = buildFilterSystemPrompt(
          currentDatetime,
          input.currentQuery,
          input.dataContext,
        );

        const aiTelemetryEnabled = project.organization.aiTelemetryEnabled;

        if (aiTelemetryEnabled && !isLangfuseAITracingConfigured()) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Langfuse AI Features not configured.",
          });
        }

        const llmCompletion = await generateLangfuseAIText({
          messages: [
            {
              role: ChatMessageRole.System,
              content: systemPrompt,
              type: ChatMessageType.PublicAPICreated,
            },
            {
              role: ChatMessageRole.User,
              content: input.prompt,
              type: ChatMessageType.PublicAPICreated,
            },
          ],
          model,
          maxTokens: 2048,
          traceSinkParams: aiTelemetryEnabled
            ? getLangfuseAITraceSinkParams({
                environment:
                  LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
                feature: "search-bar-filter",
                projectId: ctx.session.projectId,
                traceName: "search-bar-filter",
                userId: ctx.session.user.id,
                metadata: {
                  langfuse_user_id: ctx.session.user.id,
                  langfuse_project_url: new URL(
                    `project/${encodeURIComponent(ctx.session.projectId)}`,
                    getProductBaseUrl(),
                  ).toString(),
                  ...(ctx.session.user.email
                    ? { langfuse_user_email: ctx.session.user.email }
                    : {}),
                  langfuse_user_project_role: ctx.session.projectRole,
                  langfuse_cloud_region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
                  // Debugging context for prompt iteration: a trace alone should
                  // explain WHY the model produced what it did. refine_mode marks
                  // refine vs. from-scratch; current_query is the filters being
                  // refined (the #1 thing to inspect when refine misbehaves);
                  // data_context_chars is how much observed-project context we
                  // injected. (Model + token usage are auto-captured on the
                  // generation.)
                  langfuse_refine_mode: Boolean(input.currentQuery?.trim()),
                  langfuse_current_query: input.currentQuery?.trim() || null,
                  langfuse_data_context_chars: input.dataContext?.length ?? 0,
                },
              })
            : undefined,
        });

        // Parse the model output and keep only the filters that round-trip to
        // bar grammar — a hallucinated/non-v4 column is dropped, never applied.
        // Score names are validated against the observed sets (exact keeps, a
        // unique `_`/`-`/space/case-normalized match corrects, anything else is
        // dropped and reported) so a misspelled score name can never apply as a
        // dead filter that silently matches nothing.
        const { filters, queryText, droppedCount, unknownScoreNames } =
          parseGeneratedFilters(llmCompletion, input.scoreNames);

        if (droppedCount > 0) {
          logger.warn(
            "Search-bar AI filter dropped non-representable filters",
            {
              projectId: input.projectId,
              droppedCount,
              unknownScoreNames,
            },
          );
        }

        return { filters, queryText, unknownScoreNames };
      } catch (error) {
        // Already-shaped rejections (auth / precondition / not-found) are
        // expected control flow, not backend faults — rethrow them without
        // ERROR-level noise. Reserve `logger.error` for the unexpected, so it
        // stays a signal for genuine failures.
        if (error instanceof TRPCError) {
          throw error;
        }
        logger.error("Failed to generate search-bar AI filter", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The AI backend currently appears to be unavailable. Please try again later.",
        });
      }
    }),
});
