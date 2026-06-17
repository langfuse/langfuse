// This module should contained ag-ui base schemas OR shared schemas,
// do not add any one-off schemas here.
// This module is shared by browser and server in-app-agent code. Keep it
// runtime-neutral: Zod schemas and TypeScript types only, with no React,
// browser-only, server-only, database, or Mastra imports.

import type { EventType } from "@ag-ui/core";
import { ObservationLevelDomain, TracingSearchType } from "@langfuse/shared";
import { z } from "zod";
import { TABLE_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";

// @ag-ui/core@0.0.52 publishes Zod v3-shaped declarations, but this package
// uses Zod v4, causing its exported z.infer-based types to resolve as unknown.
// Duplicate the relevant schemas locally until
// https://github.com/ag-ui-protocol/ag-ui/pull/1637 is merged, then remove
// these definitions and use @ag-ui/core directly again.

const AgUiBaseMessageSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  encryptedValue: z.string().optional(),
});

const AgUiToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
  encryptedValue: z.string().optional(),
});

export const InAppAgentMessageFeedbackValueSchema = z.enum([
  "thumbs_up",
  "thumbs_down",
]);

export type InAppAgentMessageFeedbackValue = z.infer<
  typeof InAppAgentMessageFeedbackValueSchema
>;

export const InAppAgentMessageFeedbackSchema = z.object({
  value: InAppAgentMessageFeedbackValueSchema,
  comment: z.string().nullable(),
});

export type InAppAgentMessageFeedback = z.infer<
  typeof InAppAgentMessageFeedbackSchema
>;

export const InAppAgentRedirectActionToolResultSchema = z.object({
  type: z.literal("redirectAction"),
  label: z.string().min(1).max(80),
  href: z.string().min(1),
});

export type InAppAgentRedirectActionToolResult = z.infer<
  typeof InAppAgentRedirectActionToolResultSchema
>;

const AgUiInputContentSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("data"),
    value: z.string(),
    mimeType: z.string(),
  }),
  z.object({
    type: z.literal("url"),
    value: z.string(),
    mimeType: z.string().optional(),
  }),
]);

const AgUiInputContentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("image"),
    source: AgUiInputContentSourceSchema,
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("audio"),
    source: AgUiInputContentSourceSchema,
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("video"),
    source: AgUiInputContentSourceSchema,
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("document"),
    source: AgUiInputContentSourceSchema,
    metadata: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("binary"),
    mimeType: z.string(),
    id: z.string().optional(),
    url: z.string().optional(),
    data: z.string().optional(),
    filename: z.string().optional(),
  }),
]);

export const AgUiMessageSchema = z.discriminatedUnion("role", [
  AgUiBaseMessageSchema.extend({
    role: z.literal("developer"),
    content: z.string(),
  }),
  AgUiBaseMessageSchema.extend({
    role: z.literal("system"),
    content: z.string(),
  }),
  AgUiBaseMessageSchema.extend({
    role: z.literal("assistant"),
    content: z.string().optional(),
    toolCalls: z.array(AgUiToolCallSchema).optional(),
    feedback: InAppAgentMessageFeedbackSchema.optional(),
    runId: z.string().optional(),
  }),
  AgUiBaseMessageSchema.extend({
    role: z.literal("user"),
    content: z.union([z.string(), z.array(AgUiInputContentSchema)]),
  }),
  z.object({
    id: z.string(),
    content: z.string(),
    role: z.literal("tool"),
    toolCallId: z.string(),
    error: z.string().optional(),
    encryptedValue: z.string().optional(),
  }),
  z.object({
    id: z.string(),
    role: z.literal("activity"),
    activityType: z.string(),
    content: z.record(z.string(), z.any()),
  }),
  z.object({
    id: z.string(),
    role: z.literal("reasoning"),
    content: z.string(),
    encryptedValue: z.string().optional(),
  }),
]);

export type AgUiMessage = z.infer<typeof AgUiMessageSchema>;

const AbsoluteHttpUrlSchema = z.string().transform((value, ctx) => {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    ctx.addIssue({
      code: "custom",
      message: "URL must be absolute",
    });
    return z.NEVER;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    ctx.addIssue({
      code: "custom",
      message: "URL protocol must be http or https",
    });
    return z.NEVER;
  }

  return parsedUrl.href;
});

export const InAppAgentMessageSourceSchema = z.object({
  title: z.string(),
  url: AbsoluteHttpUrlSchema,
  faviconUrl: AbsoluteHttpUrlSchema,
});

export type InAppAgentMessageSource = z.infer<
  typeof InAppAgentMessageSourceSchema
>;

const AgUiToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.any().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const AgUiContextSchema = z.object({
  description: z.string(),
  value: z.string(),
});

export const AgUiRunAgentInputSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
  parentRunId: z.string().optional(),
  state: z.any().optional(),
  messages: z.array(AgUiMessageSchema),
  tools: z.array(AgUiToolSchema),
  context: z.array(AgUiContextSchema),
  forwardedProps: z.any().optional(),
});

export type AgUiRunAgentInput = z.infer<typeof AgUiRunAgentInputSchema>;

export type AgUiEvent = {
  type: EventType;
  timestamp?: number;
  rawEvent?: unknown;
  [key: string]: unknown;
};

export type AgUiCustomEvent = AgUiEvent & {
  type: EventType.CUSTOM;
  name: string;
  value: unknown;
};

export const InAppAgentRuntimeStateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("newConversation"),
    projectId: z.string(),
  }),
  z.object({
    type: z.literal("existingConversation"),
    projectId: z.string(),
    conversationId: z.string(),
  }),
]);

export type InAppAgentRuntimeState = z.infer<
  typeof InAppAgentRuntimeStateSchema
>;

export const IN_APP_AGENT_REDIRECT_TOOL_NAME = "langfuse_proposeRedirect";

const InAppAgentRedirectDestinationSchema = z.enum([
  "dashboards",
  "datasets",
  "evals",
  "experiments",
  "models",
  "monitors",
  "playground",
  "projectMembers",
  "projectSettings",
  "prompts",
  "scores",
  "session",
  "sessions",
  "trace",
  "traces",
]);

const InAppAgentRedirectBaseSchema = z.object({
  label: z.string().min(1).max(80),
});

const InAppAgentTableTimeRangePresetSchema = z.enum(TABLE_AGGREGATION_OPTIONS);

const InAppAgentTableTimeRangeStrictSchema = z.union([
  z.object({
    preset: InAppAgentTableTimeRangePresetSchema,
  }),
  z.object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  }),
]);

const InAppAgentTableTimeRangeSchema = z
  .object({
    preset: InAppAgentTableTimeRangePresetSchema.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (!InAppAgentTableTimeRangeStrictSchema.safeParse(value).success) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either a preset or both from and to.",
      });
    }
  }) as z.ZodType<z.infer<typeof InAppAgentTableTimeRangeStrictSchema>>;

const InAppAgentTracingFiltersSchema = z.object({
  bookmarked: z.boolean().optional(),
  environment: z.array(z.string().min(1).max(100)).max(10).optional(),
  level: z.array(ObservationLevelDomain).max(4).optional(),
  metadata: z
    .array(
      z.object({
        key: z.string().min(1).max(100),
        value: z.string().max(200),
      }),
    )
    .max(5)
    .optional(),
  sessionId: z.array(z.string().min(1).max(200)).max(10).optional(),
  tags: z.array(z.string().min(1).max(100)).max(10).optional(),
  traceId: z.string().min(1).max(200).optional(),
  traceName: z.array(z.string().min(1).max(200)).max(10).optional(),
  userId: z.array(z.string().min(1).max(200)).max(10).optional(),
  version: z.string().min(1).max(200).optional(),
});

const InAppAgentTracesParamsSchema = z.object({
  filters: InAppAgentTracingFiltersSchema.optional(),
  orderBy: z
    .object({
      column: z.enum(["timestamp", "startTime", "traceName", "latency"]),
      order: z.enum(["ASC", "DESC"]),
    })
    .optional(),
  search: z
    .object({
      query: z.string().min(1).max(300),
      type: z.array(TracingSearchType).max(4).optional(),
    })
    .optional(),
  timeRange: InAppAgentTableTimeRangeSchema.optional(),
});

const InAppAgentProjectSettingsPageSchema = z.enum([
  "index",
  "api-keys",
  "developer-tools",
  "llm-connections",
  "models",
  "scores",
  "members",
  "integrations",
  "exports",
  "batch-actions",
  "audit-logs",
  "notifications",
]);

const InAppAgentRedirectToolInputStrictSchema = z.discriminatedUnion(
  "destination",
  [
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("dashboards"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("datasets"),
      params: z
        .object({ folder: z.string().min(1).max(200).optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("evals") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("experiments"),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("models") }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("monitors") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("playground"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("projectMembers"),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("projectSettings"),
      params: z
        .object({ page: InAppAgentProjectSettingsPageSchema.optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("prompts"),
      params: z
        .object({ folder: z.string().min(1).max(200).optional() })
        .optional(),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("scores") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("session"),
      params: z.object({ sessionId: z.string().min(1).max(200) }),
    }),
    InAppAgentRedirectBaseSchema.extend({ destination: z.literal("sessions") }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("trace"),
      params: z.object({
        timestamp: z.iso.datetime().optional(),
        traceId: z.string().min(1).max(200),
      }),
    }),
    InAppAgentRedirectBaseSchema.extend({
      destination: z.literal("traces"),
      params: InAppAgentTracesParamsSchema.optional(),
    }),
  ],
);

const InAppAgentRedirectParamsSchema = z.object({
  folder: z.string().min(1).max(200).optional(),
  page: InAppAgentProjectSettingsPageSchema.optional(),
  sessionId: z.string().min(1).max(200).optional(),
  timestamp: z.iso.datetime().optional(),
  traceId: z.string().min(1).max(200).optional(),
  filters: InAppAgentTracingFiltersSchema.optional(),
  orderBy: InAppAgentTracesParamsSchema.shape.orderBy,
  search: InAppAgentTracesParamsSchema.shape.search,
  timeRange: InAppAgentTableTimeRangeSchema.optional(),
});

export const InAppAgentRedirectToolInputSchema =
  InAppAgentRedirectBaseSchema.extend({
    destination: InAppAgentRedirectDestinationSchema,
    params: InAppAgentRedirectParamsSchema.optional(),
  }).superRefine((value, ctx) => {
    const result = InAppAgentRedirectToolInputStrictSchema.safeParse(value);

    if (!result.success) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid redirect destination parameters.",
      });
    }
  }) as z.ZodType<z.infer<typeof InAppAgentRedirectToolInputStrictSchema>>;

export type InAppAgentRedirectToolInput = z.infer<
  typeof InAppAgentRedirectToolInputStrictSchema
>;
export type InAppAgentTracesRedirectInput = Extract<
  InAppAgentRedirectToolInput,
  { destination: "traces" }
>;
type InAppAgentTracesRedirectParams = NonNullable<
  InAppAgentTracesRedirectInput["params"]
>;
export type InAppAgentTracesRedirectFilters = NonNullable<
  InAppAgentTracesRedirectParams["filters"]
>;
export type InAppAgentTracesRedirectOrderBy = NonNullable<
  InAppAgentTracesRedirectParams["orderBy"]
>;
export type InAppAgentTracesRedirectTimeRange = NonNullable<
  InAppAgentTracesRedirectParams["timeRange"]
>;
