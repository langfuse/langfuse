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
  fetchLLMCompletion,
  LangfuseInternalTraceEnvironment,
  LLMAdapter,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { z } from "zod";
import {
  BEDROCK_USE_DEFAULT_CREDENTIALS,
  type FilterState,
  singleFilter,
} from "@langfuse/shared";
import { encrypt } from "@langfuse/shared/encryption";
import { randomBytes } from "crypto";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { buildFilterSystemPrompt } from "./buildFilterPrompt";
import { filterStateToQueryText } from "../lib/filter-state-to-query";

const GenerateFilterInput = z.object({
  projectId: z.string(),
  prompt: z.string().min(1).max(2048),
});

const FilterArraySchema = z.array(singleFilter);

/**
 * Extract a `FilterState` from the model's completion. Tries the whole string,
 * then a bracketed array, then a `{ "filters": [...] }` wrapper. Returns [] when
 * nothing parses (the client surfaces a "try again" message), mirroring the
 * legacy parser.
 */
function parseFiltersFromCompletion(completion: string): FilterState {
  const arrayMatch = completion.match(/\[[\s\S]*\]/)?.[0];
  const candidates = [completion, arrayMatch].filter((c): c is string =>
    Boolean(c),
  );
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const filtersArray = Array.isArray(parsed) ? parsed : parsed.filters;
      return FilterArraySchema.parse(filtersArray);
    } catch {
      // try the next candidate
    }
  }
  return [];
}

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
        const systemPrompt = buildFilterSystemPrompt(currentDatetime);

        const aiTelemetryEnabled = project.organization.aiTelemetryEnabled;
        const targetProjectId = aiTelemetryEnabled
          ? env.LANGFUSE_AI_FEATURES_PROJECT_ID
          : undefined;

        if (aiTelemetryEnabled && !targetProjectId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Langfuse AI Features not configured.",
          });
        }

        const traceSinkParams = targetProjectId
          ? {
              environment:
                LangfuseInternalTraceEnvironment.NaturalLanguageFilter,
              traceName: "search-bar-filter",
              traceId: randomBytes(16).toString("hex"),
              targetProjectId,
              userId: ctx.session.user.id,
              metadata: {
                langfuse_ai_feature: "search-bar-filter",
                langfuse_user_id: ctx.session.user.id,
                langfuse_project_id: ctx.session.projectId,
              },
            }
          : undefined;

        const llmCompletion = await fetchLLMCompletion({
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
          modelParams: {
            provider: "bedrock",
            adapter: LLMAdapter.Bedrock,
            model: env.LANGFUSE_AWS_BEDROCK_MODEL,
            temperature: 0.1,
            max_tokens: 2048,
            top_p: 0.9,
          },
          llmConnection: {
            secretKey: encrypt(BEDROCK_USE_DEFAULT_CREDENTIALS),
          },
          streaming: false,
          traceSinkParams,
          shouldUseLangfuseAPIKey: true,
        });

        if (typeof llmCompletion !== "string") {
          throw new Error("Expected LLM completion to be a string");
        }

        const parsed = parseFiltersFromCompletion(llmCompletion);

        // Keep only the filters that round-trip to bar grammar — a hallucinated
        // or non-v4 column lands in `skippedFilters` and is dropped here, so the
        // client never receives a filter the bar can't show as an editable pill.
        const { text, skippedFilters } = filterStateToQueryText(parsed);
        const skipped = new Set(skippedFilters);
        const filters = parsed.filter((f) => !skipped.has(f));

        if (skippedFilters.length > 0) {
          logger.warn(
            "Search-bar AI filter dropped non-representable filters",
            {
              projectId: input.projectId,
              droppedCount: skippedFilters.length,
            },
          );
        }

        return { filters, queryText: text };
      } catch (error) {
        logger.error("Failed to generate search-bar AI filter", error);
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The AI backend currently appears to be unavailable. Please try again later.",
        });
      }
    }),
});
