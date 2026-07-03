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
import { buildFilterSystemPrompt } from "./buildFilterPrompt";
import { parseGeneratedFilters } from "./parseFilterCompletion";
import {
  fetchLangfuseAICompletion,
  getLangfuseAITraceSinkParams,
  isLangfuseAITracingConfigured,
} from "@/src/features/ai-features/server/bedrockCompletion";

const GenerateFilterInput = z.object({
  projectId: z.string(),
  prompt: z.string().min(1).max(2048),
  /** Existing bar query text, so the model refines the current filters. */
  currentQuery: z.string().max(4096).optional(),
  /** Project data context (observed values, metadata keys, result count) built
   *  on the client from already-loaded filterOptions + visible rows. */
  dataContext: z.string().max(16000).optional(),
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

        if (!env.LANGFUSE_AWS_BEDROCK_MODEL) {
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

        const llmCompletion = await fetchLangfuseAICompletion({
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

        if (typeof llmCompletion !== "string") {
          throw new Error("Expected LLM completion to be a string");
        }

        // Parse the model output and keep only the filters that round-trip to
        // bar grammar — a hallucinated/non-v4 column is dropped, never applied.
        const { filters, queryText, droppedCount } =
          parseGeneratedFilters(llmCompletion);

        if (droppedCount > 0) {
          logger.warn(
            "Search-bar AI filter dropped non-representable filters",
            {
              projectId: input.projectId,
              droppedCount,
            },
          );
        }

        return { filters, queryText };
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
