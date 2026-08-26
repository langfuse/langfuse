// This module should contained ag-ui base schemas OR shared schemas,
// do not add any one-off schemas here.
// This module is shared by browser and server in-app-agent code. Keep it
// runtime-neutral: Zod schemas and TypeScript types only, with no React,
// browser-only, server-only, database, or Mastra imports.

import type { EventType } from "@ag-ui/core";
import { z } from "zod";

import { PersistedEvalOutputDefinitionSchema } from "../features/evals/outputDefinition";

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

export const InAppAgentEvaluatorDraftVariableMappingSchema = z.object({
  templateVariable: z.string().min(1),
  selectedColumnId: z.string().min(1),
  jsonSelector: z.string().nullish(),
});

export const InAppAgentLlmEvaluatorDraftSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable(),
  definition: z.object({
    type: z.literal("LLM_AS_JUDGE"),
    prompt: z.string().min(1).max(100_000),
    provider: z.string().nullable(),
    model: z.string().nullable(),
    modelParams: z.record(z.string(), z.unknown()).nullable(),
    vars: z.array(z.string()),
    variableMapping: z
      .array(InAppAgentEvaluatorDraftVariableMappingSchema)
      .nullable(),
    outputDefinition: PersistedEvalOutputDefinitionSchema,
  }),
});

export type InAppAgentLlmEvaluatorDraft = z.infer<
  typeof InAppAgentLlmEvaluatorDraftSchema
>;

export const InAppAgentUiDraftActionToolResultSchema = z.object({
  type: z.literal("uiDraftAction"),
  label: z.string().min(1).max(80),
  href: z.string().min(1),
  destination: z.literal("newEvaluator"),
  draft: InAppAgentLlmEvaluatorDraftSchema,
});

export const InAppAgentUiProposalToolResultSchema = z.discriminatedUnion(
  "type",
  [
    InAppAgentRedirectActionToolResultSchema,
    InAppAgentUiDraftActionToolResultSchema,
  ],
);

export const InAppAgentSandboxToolNameSchema = z.enum([
  "read",
  "write",
  "edit",
  "bash",
]);

export const InAppAgentSandboxReadArgsSchema = z.object({
  path: z.string().min(1),
});

export const InAppAgentSandboxWriteArgsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export const InAppAgentSandboxEditArgsSchema = z.object({
  path: z.string().min(1),
  oldText: z.string(),
  newText: z.string(),
});

export const InAppAgentSandboxBashArgsSchema = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(120_000).default(120_000),
});

export const InAppAgentSandboxReadResultSchema = z.object({
  path: z.string(),
  content: z.string().nullable(),
});

export const InAppAgentSandboxWriteResultSchema = z.object({
  path: z.string(),
  bytesWritten: z.number().int().nonnegative(),
});

export const InAppAgentSandboxEditResultSchema = z.object({
  path: z.string(),
  replaced: z.boolean(),
});

export const InAppAgentSandboxBashResultSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exitCode: z.number().int(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

export const InAppAgentSandboxToolArgsSchemas = {
  read: InAppAgentSandboxReadArgsSchema,
  write: InAppAgentSandboxWriteArgsSchema,
  edit: InAppAgentSandboxEditArgsSchema,
  bash: InAppAgentSandboxBashArgsSchema,
} as const;

export const InAppAgentSandboxToolResultSchemas = {
  read: InAppAgentSandboxReadResultSchema,
  write: InAppAgentSandboxWriteResultSchema,
  edit: InAppAgentSandboxEditResultSchema,
  bash: InAppAgentSandboxBashResultSchema,
} as const;

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

export const AgUiContextSchema = z.object({
  description: z.string(),
  value: z.string(),
});

export type AgUiContext = Array<z.infer<typeof AgUiContextSchema>>;

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
