import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { type User } from "next-auth";
import { TRPCError } from "@trpc/server";
import {
  ChatMessageRole,
  ChatMessageType,
  fetchLLMCompletion,
  LLMAdapter,
  logger,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { z } from "zod";
import { DashboardWidgetChartType } from "@langfuse/shared/src/db";
import { CallbackHandler, Langfuse } from "langfuse-langchain";

const USE_CASE = "widget_builder";

interface GenerateWidgetConfigurationParams {
  projectId: string;
  description: string;
  sessionUser: User;
}

const generationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  view: z.enum([
    "traces",
    "observations",
    "scores-numeric",
    "scores-categorical",
  ]),
  metrics: z.array(
    z.object({
      measure: z.string(),
      agg: z.enum([
        "sum",
        "avg",
        "count",
        "max",
        "min",
        "p50",
        "p75",
        "p90",
        "p95",
        "p99",
        "histogram",
      ]),
    }),
  ),
  chartType: z.nativeEnum(DashboardWidgetChartType),
  dimensions: z.array(
    z.object({
      field: z.string(),
    }),
  ),
});

export async function generateWidgetConfiguration({
  projectId,
  description,
  sessionUser,
}: GenerateWidgetConfigurationParams): Promise<
  z.infer<typeof generationSchema>
> {
  // Check entitlements
  throwIfNoEntitlement({
    entitlement: "ai",
    sessionUser,
    projectId,
  });

  // Validate OpenAI API key is available
  const apiKey = env.LANGFUSE_AI_OPENAI_API_KEY;
  if (!apiKey) {
    logger.error("OpenAI API key not configured");
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI widget builder is not configured",
    });
  }

  const langfuse = new Langfuse({
    publicKey: env.LANGFUSE_AI_LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_AI_LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_AI_LANGFUSE_HOST,
  });

  try {
    const systemPrompt = await langfuse.getPrompt(`${USE_CASE}_system`);
    const userPrompt = await langfuse.getPrompt(`${USE_CASE}_user`);

    const result = await fetchLLMCompletion({
      runName: USE_CASE,
      streaming: false,
      apiKey,
      messages: [
        {
          role: ChatMessageRole.System,
          content: systemPrompt.compile(),
          type: ChatMessageType.System,
        },
        {
          role: ChatMessageRole.User,
          content: `${userPrompt.compile()}: "${description}"`,
          type: ChatMessageType.User,
        },
      ],
      modelParams: {
        provider: "openai",
        model: "gpt-4o-mini",
        adapter: LLMAdapter.OpenAI,
      },
      structuredOutputSchema: generationSchema,
      callbacks: [
        new CallbackHandler({
          userId: sessionUser.id,
          metadata: {
            projectId,
          },
          publicKey: env.LANGFUSE_AI_LANGFUSE_PUBLIC_KEY,
          secretKey: env.LANGFUSE_AI_LANGFUSE_SECRET_KEY,
          baseUrl: env.LANGFUSE_AI_LANGFUSE_HOST,
        }),
      ],
    });

    // const result = await generateObject({
    //   model: createOpenAI({
    //     apiKey,
    //   })("gpt-4o-mini"),
    //   system: WIDGET_BUILDER_PROMPT,
    //   prompt: `Generate a widget configuration for: "${description}"`,
    //   schema: generationSchema,
    //   experimental_telemetry: {
    //     isEnabled: true,
    //     functionId: USE_CASE,
    //     tracer: tracerProvider.getTracer(USE_CASE),
    //     metadata: {
    //       "langfuse.trace.name": USE_CASE,
    //     },
    //   },
    // });

    logger.info("Generated widget configuration", {
      projectId,
      description,
      result,
    });

    return result.completion as any; // TODO: Trust me for now
  } catch (error) {
    logger.error("Failed to generate widget configuration", error, {
      projectId,
      description,
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to generate widget configuration",
      cause: error,
    });
  }
}
