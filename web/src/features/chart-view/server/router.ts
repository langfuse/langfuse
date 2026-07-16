import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { logger } from "@langfuse/shared/src/server";
import { generateLangfuseAIText } from "@/src/features/ai-features/server/bedrockCompletion";
import { env } from "@/src/env.mjs";
import { throwIfNoProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  buildChartCompletionMessages,
  chartCompletionSchema,
} from "./chartCompletion";

/**
 * Parses the model's chart spec out of its text response. Tolerates a ```json
 * code fence or stray prose: tries the whole de-fenced text, then the outermost
 * `{…}` slice, validating each with `safeParse`. A parse miss (truncated output,
 * trailing prose with a brace, non-JSON) is a RECOVERABLE hiccup, surfaced as a
 * "try rephrasing" TRPCError — not the generic "backend unavailable" 500 the
 * mutation's catch would otherwise apply. The client re-clamps via `coerceConfig`.
 */
function parseChartCompletion(text: string) {
  const defenced = text.replace(/```(?:json)?/gi, "").trim();
  const candidates = [defenced];
  const start = defenced.indexOf("{");
  const end = defenced.lastIndexOf("}");
  if (start !== -1 && end > start) {
    candidates.push(defenced.slice(start, end + 1));
  }
  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    const result = chartCompletionSchema.safeParse(parsed);
    if (result.success) return result.data;
  }
  throw new TRPCError({
    code: "UNPROCESSABLE_CONTENT",
    message: "Couldn't build a chart from that — try rephrasing your request.",
  });
}

/**
 * "Ask AI → chart": the sibling of `searchBar.generateFilter` that emits a
 * chart spec instead of a filter list. Same cloud-only + `aiFeaturesEnabled` +
 * Bedrock gating; uses an inline prompt (the chart vocabulary is fixed) via the
 * shared `generateLangfuseAIText` helper, then parses the JSON spec out of the
 * text response. Returns the raw spec — the client clamps it through
 * `coerceConfig`.
 */
export const chartViewRouter = createTRPCRouter({
  generateChartConfig: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        prompt: z.string().min(1).max(2048),
      }),
    )
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
              "Ask AI for charts is not available in self-hosted deployments.",
          });
        }

        const project = await ctx.prisma.project.findUnique({
          where: { id: input.projectId },
          select: { organization: { select: { aiFeaturesEnabled: true } } },
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

        const now = new Date();
        const dayOfWeek = now.toLocaleDateString("en-US", { weekday: "long" });
        const currentDatetime = `${dayOfWeek}, ${now.toISOString()}`;

        const text = await generateLangfuseAIText({
          messages: buildChartCompletionMessages({
            prompt: input.prompt,
            currentDatetime,
          }),
          // The chart spec is small; cap output so a runaway generation can't
          // stall the request.
          maxTokens: 500,
        });

        const config = parseChartCompletion(text);
        return { config };
      } catch (error) {
        // Already-shaped rejections (FORBIDDEN / PRECONDITION_FAILED / NOT_FOUND
        // / RBAC) are expected control flow, not backend faults — rethrow them
        // without ERROR-level noise. Only unexpected errors get logged + masked.
        if (error instanceof TRPCError) throw error;
        logger.error("Failed to generate chart config from prompt", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The AI backend currently appears to be unavailable. Please try again later.",
        });
      }
    }),
});
