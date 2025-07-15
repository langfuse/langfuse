import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { throwIfNoEntitlement } from "@/src/features/entitlements/server/hasEntitlement";
import { type User } from "next-auth";
import { TRPCError } from "@trpc/server";
import { logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { z } from "zod/v4";
import { StringNoHTMLNonEmpty, StringNoHTML } from "@langfuse/shared";
import { metricAggregations, views } from "@/src/features/query";
import { DashboardWidgetChartType } from "@langfuse/shared/src/db";

const WIDGET_BUILDER_PROMPT = `
You are an expert at creating data visualization widgets for Langfuse, an LLM engineering platform.

Your task is to generate a widget configuration based on the user's description.
The widget should help users analyze their LLM traces, observations, and performance metrics.

Available views:
- traces: For analyzing trace data
- observations: For analyzing individual observations
- scores: For analyzing scoring data. Scores are separated into scores-numeric and scores-categorical.

Available chart types:
- LINE_TIME_SERIES: For time-based line charts
- BAR_TIME_SERIES: For time-based bar charts
- HORIZONTAL_BAR: For horizontal bar charts
- VERTICAL_BAR: For vertical bar charts
- PIE: For pie charts
- NUMBER: For displaying single numbers/KPIs
- HISTOGRAM: For distribution analysis
- PIVOT_TABLE: For tabular data analysis

Available metrics (use appropriate ones based on view):
- count: Count of items
- sum: Sum of values
- avg: Average of values
- min: Minimum value
- max: Maximum value
- p50: 50th percentile
- p90: 90th percentile
- p95: 95th percentile
- p99: 99th percentile

Common dimensions:
- time: Time-based grouping
- model: Model name
- user_id: User identifier
- name: Trace/observation name
- status_message: Status information
- level: Log level
- version: Version information
- tags: Tag information

Common measures:
- latency: Response time
- input_cost: Input token cost
- output_cost: Output token cost
- total_cost: Total cost
- input_tokens: Input token count
- output_tokens: Output token count
- total_tokens: Total token count

Generate a widget configuration that best matches the user's intent.
Make reasonable assumptions about filters, dimensions, and metrics.

A basic query needs to follow this structure:
{
  view: "traces",
  dimensions: [{ field: "name" }],
  metrics: [
    { measure: "count", aggregation: "count" },
    { measure: "observationsCount", aggregation: "p95" },
  ],
  filters: [
    {
      column: "name",
      operator: "=",
      value: "qa",
      type: "string",
    },
  ],
  timeDimension: null,
  fromTimestamp: "2025-01-01T00:00:00.000Z",
  toTimestamp: "2025-03-01T00:00:00.000Z",
  orderBy: null,
}
`;

interface GenerateWidgetConfigurationParams {
  projectId: string;
  description: string;
  sessionUser: User;
}

const generationSchema = z.object({
  name: StringNoHTMLNonEmpty,
  description: StringNoHTML.optional(),
  view: views,
  metrics: z.array(
    z.object({
      measure: z.string(),
      agg: metricAggregations,
    }),
  ),
  chartType: z.enum(DashboardWidgetChartType),
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

  try {
    const result = await generateObject({
      model: createOpenAI({
        apiKey,
      })("gpt-4o-mini"),
      system: WIDGET_BUILDER_PROMPT,
      prompt: `Generate a widget configuration for: "${description}"`,
      schema: generationSchema,
    });

    logger.info("Generated widget configuration", {
      projectId,
      description,
      result,
    });

    return result.object;
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
