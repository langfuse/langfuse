// LFE-14544 — experimental "customize everything" demo spike.
//
// Generates a self-contained React component (as source code) that renders one
// observation's data per the user's natural-language instruction. The client
// renders the returned code inside a sandboxed iframe served by
// `/api/custom-view-sandbox` — the code never executes in the app's origin.
//
// DEMO NOTE: the system prompt is hardcoded here. In production it would be a
// managed Langfuse prompt (like the search-bar's `search-bar-filter` prompt,
// see `resolveFilterPrompt.ts`), with AI telemetry wired to the AI-features
// project. Both are deliberately out of the spike's scope.

import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import {
  type ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  generateLangfuseAIText,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { z } from "zod";

export const CUSTOM_VIEW_SYSTEM_PROMPT = `You are an expert React engineer inside Langfuse, an LLM engineering platform. The user is looking at one observation (a span / generation event) of an LLM application trace and wants a custom view of its data. You generate that view as a React component.

Return a single self-contained React function component:

- Define exactly one top-level component: \`function CustomView({ data })\`. Small helper functions/constants next to it are fine. Do NOT render it yourself — the host renders \`CustomView\`.
- \`data\` is the observation object. A representative sample (long values truncated) is shown in the user message — but the SAME component will be applied to ALL observations in the project (different types: GENERATION, SPAN, TOOL, AGENT, …; different IO shapes; missing fields). Do not hardcode to the sample: degrade gracefully — render what is present, skip what is not. Any field can be null, missing, or a string where you'd expect an object — code defensively (optional chaining, Array.isArray checks, try/catch around JSON.parse of stringified JSON).
- \`data.input\`, \`data.output\`, \`data.metadata\` carry the observation IO. Chat-style inputs are often arrays of {role, content} messages or {messages: [...]}; content may be a string or an array of typed parts. Handle at least the shapes visible in the sample.
- Environment: React 18 is available as the global \`React\` (destructure hooks from it, e.g. \`const { useState, useMemo } = React\`). JSX is compiled for you. No imports, no require(), no external libraries, no network requests, no localStorage — the sandbox blocks all of these.
- Styling: inline styles only. Use the host-provided CSS variables for base colors: var(--background), var(--foreground), var(--muted-foreground), var(--border). Accent colors are yours to pick, but they must stay readable on both light and dark backgrounds. Page background, text color, and font are already set. Aim for a polished, information-dense view.
- Timestamps may be Date objects or ISO strings; numbers are raw (latency in seconds, cost in USD) — format them nicely.
- Never overflow horizontally: wrap long text (overflowWrap: "anywhere") or scroll it inside a maxWidth: "100%" container.
- Output ONLY the JavaScript/JSX source code. No markdown fences, no explanations, no HTML document.`;

const GenerateViewInput = z.object({
  projectId: z.string(),
  /** The user's natural-language description of the wanted view. */
  instruction: z.string().min(1).max(4000),
  /** Truncated JSON sample of the observation, built client-side. */
  dataSample: z.string().max(24000),
  /** Present when iterating on an existing view. */
  previousCode: z.string().max(48000).optional(),
  /** Present when the previous code failed at runtime in the sandbox. */
  lastError: z.string().max(2000).optional(),
});

/** Models sometimes fence their output despite instructions — unwrap it. */
function extractComponentCode(completion: string): string {
  const fenced = completion.match(
    /```(?:jsx|tsx|javascript|js)?\s*\n([\s\S]*?)```/,
  );
  return (fenced ? fenced[1] : completion).trim();
}

export const customDataViewRouter = createTRPCRouter({
  generate: protectedProjectProcedure
    .input(GenerateViewInput)
    .mutation(async ({ input, ctx }) => {
      try {
        const project = await ctx.prisma.project.findUnique({
          where: { id: input.projectId },
          select: {
            organization: { select: { aiFeaturesEnabled: true } },
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

        // Deliberately the LARGE model (not LANGFUSE_AWS_BEDROCK_SMALL_MODEL):
        // code generation quality carries this feature.
        const model = env.LANGFUSE_AWS_BEDROCK_MODEL;
        if (!model) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Bedrock environment variables not configured. Please set LANGFUSE_AWS_BEDROCK_* variables.",
          });
        }

        const contextParts = [
          `Observation data sample (JSON, long values truncated):\n${input.dataSample}`,
        ];
        if (input.previousCode) {
          contextParts.push(
            `Current CustomView code (the user wants it changed — keep everything that still applies):\n${input.previousCode}`,
          );
        }
        if (input.lastError) {
          contextParts.push(
            `The current code failed at runtime in the sandbox with:\n${input.lastError}`,
          );
        }

        const messages: ChatMessage[] = [
          {
            role: ChatMessageRole.System,
            content: CUSTOM_VIEW_SYSTEM_PROMPT,
            type: ChatMessageType.PublicAPICreated,
          },
          {
            role: ChatMessageRole.User,
            content: contextParts.join("\n\n"),
            type: ChatMessageType.PublicAPICreated,
          },
          {
            role: ChatMessageRole.User,
            content: input.instruction,
            type: ChatMessageType.PublicAPICreated,
          },
        ];

        const completion = await generateLangfuseAIText({
          messages,
          model,
          maxTokens: 8192,
        });

        return { code: extractComponentCode(completion) };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        logger.error("Failed to generate custom data view", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "The AI backend currently appears to be unavailable. Please try again later.",
        });
      }
    }),
});
