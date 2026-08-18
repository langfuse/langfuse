// This module should contained ag-ui base schemas OR shared schemas,
// do not add any one-off schemas here.
// This module is shared by browser and server in-app-agent code. Keep it
// runtime-neutral: Zod schemas and TypeScript types only, with no React,
// browser-only, server-only, database, or Mastra imports.

import type { EventType } from "@ag-ui/core";
import { z } from "zod";

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

export const InAppAgentRateLimitErrorResponseSchema = z.object({
  code: z.literal("rate_limited"),
  details: z.object({
    retryAfterSeconds: z.number().int().positive(),
  }),
});

// Changes to this schema need to be backwards-compatible as messages with this are already persisted.
export const InAppAgentRedirectActionToolResultSchema = z.object({
  type: z.literal("redirectAction"),
  label: z.string().min(1).max(80),
  href: z.string().min(1),
});

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

type AgUiTool = {
  name: string;
  description: string;
  parameters?: unknown;
  metadata?: Record<string, unknown>;
};

export const AgUiContextSchema = z.object({
  description: z.string(),
  value: z.string(),
});

export type AgUiRunAgentInput = {
  threadId: string;
  runId: string;
  parentRunId?: string;
  state?: unknown;
  messages: AgUiMessage[];
  tools: AgUiTool[];
  context: Array<z.infer<typeof AgUiContextSchema>>;
  forwardedProps?: unknown;
};

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

export const InAppAgentToolApprovalRequestSchema = z.object({
  type: z.literal("tool_approval_request"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.unknown().optional(),
  runId: z.string().min(1),
});

export type InAppAgentToolApprovalRequest = z.infer<
  typeof InAppAgentToolApprovalRequestSchema
>;

export const ResumeForwardedPropsSchema = z.object({
  command: z.object({
    resume: z.object({
      approved: z.boolean(),
      continuationNumber: z.number().int().positive().optional(),
      rootRunId: z.string().min(1).optional(),
      traceStartedAt: z.iso.datetime({ offset: true }).optional(),
      approvalRequestedAt: z.iso.datetime({ offset: true }).optional(),
      approvalDecidedAt: z.iso.datetime({ offset: true }).optional(),
      approvalRequest: InAppAgentToolApprovalRequestSchema,
    }),
  }),
});

export type ResumeForwardedProps = z.infer<typeof ResumeForwardedPropsSchema>;
