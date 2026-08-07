// This module should contained ag-ui base schemas OR shared schemas,
// do not add any one-off schemas here.
// This module is shared by browser and server in-app-agent code. Keep it
// runtime-neutral: Zod schemas and TypeScript types only, with no React,
// browser-only, server-only, database, or Mastra imports.

import type { EventType } from "@ag-ui/core";
import { z } from "zod";

// AG-UI 0.0.57's Zod v3 declarations resolve as unknown under Zod v4.
// Remove these local schemas after ag-ui-protocol/ag-ui#1637 ships.

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

const AgUiToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.unknown().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const AgUiContextSchema = z.object({
  description: z.string(),
  value: z.string(),
});

export const AgUiInterruptSchema = z.object({
  id: z.string(),
  reason: z.string(),
  message: z.string().optional(),
  toolCallId: z.string().optional(),
  responseSchema: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type AgUiInterrupt = z.infer<typeof AgUiInterruptSchema>;

export const AgUiResumeEntrySchema = z.object({
  interruptId: z.string(),
  status: z.enum(["resolved", "cancelled"]),
  payload: z.unknown().optional(),
});

export type AgUiResumeEntry = z.infer<typeof AgUiResumeEntrySchema>;

export const AgUiRunFinishedOutcomeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("success") }),
  z.object({
    type: z.literal("interrupt"),
    interrupts: z.array(AgUiInterruptSchema).min(1),
  }),
]);

export type AgUiRunFinishedOutcome = z.infer<
  typeof AgUiRunFinishedOutcomeSchema
>;

export const AgUiRunAgentInputSchema = z.object({
  threadId: z.string(),
  runId: z.string(),
  parentRunId: z.string().optional(),
  state: z.unknown().optional(),
  messages: z.array(AgUiMessageSchema),
  tools: z.array(AgUiToolSchema),
  context: z.array(AgUiContextSchema),
  forwardedProps: z.unknown().optional(),
  resume: z.array(AgUiResumeEntrySchema).optional(),
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

export const InAppAgentApprovalPayloadSchema = z
  .object({
    approved: z.boolean(),
    approvalScope: z.enum(["once", "conversation"]).default("once"),
  })
  .refine((payload) => payload.approved || payload.approvalScope === "once", {
    message: "A rejection cannot grant a tool",
    path: ["approvalScope"],
  });

export type InAppAgentApprovalPayload = z.infer<
  typeof InAppAgentApprovalPayloadSchema
>;

export const InAppAgentApprovalResumeEntrySchema = z.object({
  interruptId: z.string().min(1),
  status: z.literal("resolved"),
  payload: InAppAgentApprovalPayloadSchema,
});

export type InAppAgentApprovalResumeEntry = z.infer<
  typeof InAppAgentApprovalResumeEntrySchema
>;

export const ResumeForwardedPropsSchema = z.object({
  command: z.object({
    resume: z.object({
      approved: z.boolean(),
      approvalRequest: InAppAgentToolApprovalRequestSchema,
    }),
  }),
});

export type ResumeForwardedProps = z.infer<typeof ResumeForwardedPropsSchema>;

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
