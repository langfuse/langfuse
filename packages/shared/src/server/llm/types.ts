import { LlmApiKeys } from "@prisma/client";
import z from "zod";
import {
  BedrockConfigSchema,
  OpenAIConfigSchema,
  VertexAIConfigSchema,
} from "../../interfaces/customLLMProviderConfigSchemas";
import { JSONObjectSchema } from "../../utils/zod";
import type {
  InternalTraceEventInput,
  InternalTraceExperimentContext,
} from "./internalTraceEvents";

// disable lint as this is exported and used in web/worker

export const LLMJSONSchema = z.record(z.string(), z.any());
export type LLMJSONSchema = z.infer<typeof LLMJSONSchema>;

export const JSONSchemaFormSchema = z
  .string()
  .transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value);
      return parsed;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Parameters must be valid JSON",
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .object({
        type: z.literal("object"),
        properties: z.record(z.string(), z.any()),
        required: z.array(z.string()).optional(),
        additionalProperties: z.boolean().optional(),
      })
      .loose()
      .transform((data) => JSON.stringify(data, null, 2)),
  );

export const LLMToolNameSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Name must contain only alphanumeric letters, hyphens, periods and underscores",
  )
  .min(1, "Name is required");

export const LLMToolDefinitionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: LLMJSONSchema,
});
export type LLMToolDefinition = z.infer<typeof LLMToolDefinitionSchema>;

export const LLMToolCallSchema = z.object({
  name: z.string(),
  id: z.string(),
  args: z
    .record(z.string(), z.unknown())
    .nullable()
    .transform((val) => val ?? {}),
});
export type LLMToolCall = z.infer<typeof LLMToolCallSchema>;

export const OpenAIToolCallSchema = z.object({
  id: z.string(),
  function: z.object({
    name: z.string(),
    arguments: z.union([
      z.record(z.string(), z.unknown()),
      z
        .string()
        .transform((v) => {
          try {
            return JSON.parse(v);
          } catch {
            return v;
          }
        })
        .pipe(z.record(z.string(), z.unknown())),
    ]),
  }),
  type: z.literal("function"),
});
export type OpenAIToolCallSchema = z.infer<typeof OpenAIToolCallSchema>;

export const OpenAIToolSchema = z.object({
  type: z.literal("function"),
  function: LLMToolDefinitionSchema,
});
export type OpenAIToolSchema = z.infer<typeof OpenAIToolSchema>;

export const OpenAIResponseFormatSchema = z.object({
  type: z.literal("json_schema"),
  json_schema: z.object({
    name: z.string(),
    schema: LLMJSONSchema,
  }),
});

// Legacy playground tool-call content can be either text or an array of
// provider-normalized blocks. Keep the discriminator loose while persisted
// responses migrate to native AI SDK tool-call results.
const StandardContentBlockSchema = z
  .object({
    type: z.string(),
  })
  .loose();

export const ToolCallResponseSchema = z.object({
  content: z.union([z.string(), z.array(StandardContentBlockSchema)]),
  tool_calls: z.array(LLMToolCallSchema),
});
export type ToolCallResponse = z.infer<typeof ToolCallResponseSchema>;
export enum ChatMessageRole {
  System = "system",
  Developer = "developer",
  User = "user",
  Assistant = "assistant",
  Tool = "tool",
  Model = "model", // Google Gemini assistant format
}

// Thought: should placeholder not semantically be part of this, because it can be
// PublicAPICreated of type? Works for now though.
export enum ChatMessageType {
  System = "system",
  Developer = "developer",
  User = "user",
  AssistantText = "assistant-text",
  AssistantToolCall = "assistant-tool-call",
  ToolResult = "tool-result",
  ModelText = "model-text",
  PublicAPICreated = "public-api-created",
  Placeholder = "placeholder",
}

export const SystemMessageSchema = z.object({
  type: z.literal(ChatMessageType.System),
  role: z.literal(ChatMessageRole.System),
  content: z.string(),
});
export type SystemMessage = z.infer<typeof SystemMessageSchema>;

export const DeveloperMessageSchema = z.object({
  type: z.literal(ChatMessageType.Developer),
  role: z.literal(ChatMessageRole.Developer),
  content: z.string(),
});
export type DeveloperMessage = z.infer<typeof DeveloperMessageSchema>;

export const UserMessageSchema = z.object({
  type: z.literal(ChatMessageType.User),
  role: z.literal(ChatMessageRole.User),
  content: z.string(),
});
export type UserMessage = z.infer<typeof UserMessageSchema>;

export const AssistantTextMessageSchema = z.object({
  type: z.literal(ChatMessageType.AssistantText),
  role: z.literal(ChatMessageRole.Assistant),
  content: z.string(),
});
export type AssistantTextMessage = z.infer<typeof AssistantTextMessageSchema>;

export const ModelMessageSchema = z.object({
  type: z.literal(ChatMessageType.ModelText),
  role: z.literal(ChatMessageRole.Model),
  content: z.string(),
});
export type ModelMessage = z.infer<typeof ModelMessageSchema>;

export const AssistantToolCallMessageSchema = z.object({
  type: z.literal(ChatMessageType.AssistantToolCall),
  role: z.literal(ChatMessageRole.Assistant),
  content: z.string(),
  toolCalls: z.array(LLMToolCallSchema),
});
export type AssistantToolCallMessage = z.infer<
  typeof AssistantToolCallMessageSchema
>;

export const ToolResultMessageSchema = z.object({
  type: z.literal(ChatMessageType.ToolResult),
  role: z.literal(ChatMessageRole.Tool),
  content: z.string(),
  toolCallId: z.string(),
});
export type ToolResultMessage = z.infer<typeof ToolResultMessageSchema>;

export const PlaceholderMessageSchema = z.object({
  type: z.literal(ChatMessageType.Placeholder),
  name: z
    .string()
    .regex(
      /^[a-zA-Z][a-zA-Z0-9_]*$/,
      "Placeholder name must start with a letter and contain only alphanumeric characters and underscores",
    ),
});
export type PlaceholderMessage = z.infer<typeof PlaceholderMessageSchema>;

export const ChatMessageDefaultRoleSchema = z.enum(ChatMessageRole);
export const ChatMessageSchema = z.union([
  SystemMessageSchema,
  DeveloperMessageSchema,
  UserMessageSchema,
  AssistantTextMessageSchema,
  AssistantToolCallMessageSchema,
  ToolResultMessageSchema,
  ModelMessageSchema,
  z
    .object({
      role: z.union([ChatMessageDefaultRoleSchema, z.string()]), // Users may ingest any string as role via API/SDK
      content: z.union([z.string(), z.array(z.any()), z.any()]), // Support arbitrary content types for message placeholders
    })
    .transform((msg) => {
      return {
        ...msg,
        type: ChatMessageType.PublicAPICreated as const,
      };
    }),
]);

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatMessageWithId =
  | (ChatMessage & { id: string })
  | (PlaceholderMessage & { id: string });
export type ChatMessageWithIdNoPlaceholders = ChatMessage & { id: string };

export const PromptChatMessageSchema = z.union([
  z.object({
    role: z.string(),
    content: z.string(),
  }),
  PlaceholderMessageSchema,
]);
export const PromptChatMessageListSchema = z.array(PromptChatMessageSchema);

export type PromptVariable = { name: string; value: string; isUsed: boolean };

export enum LLMAdapter {
  Anthropic = "anthropic",
  OpenAI = "openai",
  Azure = "azure",
  Bedrock = "bedrock",
  VertexAI = "google-vertex-ai",
  GoogleAIStudio = "google-ai-studio",
}

// Some providers require at least one user message. The persisted-message
// conversion boundary turns a lone message into a user message for them.
export const PROVIDERS_WITH_REQUIRED_USER_MESSAGE: readonly LLMAdapter[] = [
  LLMAdapter.VertexAI,
  LLMAdapter.GoogleAIStudio,
  LLMAdapter.Anthropic,
  LLMAdapter.Bedrock,
];

export const TextPromptContentSchema = z.string().min(1, "Enter a prompt");

export const PromptContentSchema = z.union([
  PromptChatMessageListSchema,
  TextPromptContentSchema,
]);
export type PromptContent = z.infer<typeof PromptContentSchema>;

export type ModelParams = {
  provider: string;
  adapter: LLMAdapter;
  model: string;
} & ModelConfig;

type RecordWithEnabledFlag<T> = {
  [K in keyof T]: { value: T[K]; enabled: boolean };
};
export type UIModelParams = RecordWithEnabledFlag<
  Required<ModelParams> & {
    maxTemperature: number;
  }
>;

// Generic config
export type ModelConfig = z.infer<typeof ZodModelConfig>;
export const ZodModelConfig = z.object({
  max_tokens: z.coerce.number().optional(),
  temperature: z.coerce.number().optional(),
  top_p: z.coerce.number().optional(),
  maxReasoningTokens: z.coerce.number().optional(),
  providerOptions: JSONObjectSchema.optional(),
});

// Experiment config
export const ExperimentMetadataSchema = z
  .object({
    prompt_id: z.string(),
    provider: z.string(),
    model: z.string(),
    model_params: ZodModelConfig,
    structured_output_schema: LLMJSONSchema.optional(),
    experiment_name: z.string().optional(),
    experiment_run_name: z.string().optional(),
    error: z.string().optional(),
    dataset_version: z.coerce.date().optional(),
  })
  .strict();
export type ExperimentMetadata = z.infer<typeof ExperimentMetadataSchema>;

// NOTE: Update docs page when changing this! https://langfuse.com/docs/prompt-management/features/playground#openai-playground--anthropic-playground
// WARNING: The first entry in the array is chosen as the default model to add LLM API keys
export const openAIModels = [
  "gpt-4.1",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano",
  "gpt-4.1-nano-2025-04-14",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.5-2026-04-23",
  "gpt-5.5-pro",
  "gpt-5.5-pro-2026-04-23",
  "gpt-5.4",
  "gpt-5.4-2026-03-05",
  "gpt-5.4-pro",
  "gpt-5.4-pro-2026-03-05",
  "gpt-5.4-mini",
  "gpt-5.4-mini-2026-03-17",
  "gpt-5.4-nano",
  "gpt-5.4-nano-2026-03-17",
  "gpt-5.2-2025-12-11",
  "gpt-5.1",
  "gpt-5.1-2025-11-13",
  "gpt-5",
  "gpt-5-2025-08-07",
  "gpt-5-mini",
  "gpt-5-mini-2025-08-07",
  "gpt-5-nano",
  "gpt-5-nano-2025-08-07",
  "o3",
  "o3-2025-04-16",
  "o4-mini",
  "o4-mini-2025-04-16",
  "gpt-4o",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-05-13",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "o3-mini",
  "o3-mini-2025-01-31",
  "o1-preview",
  "o1-preview-2024-09-12",
  "o1-mini",
  "o1-mini-2024-09-12",
  "gpt-4.5-preview",
  "gpt-4.5-preview-2025-02-27",
  "gpt-4-turbo-preview",
  "gpt-4-1106-preview",
  "gpt-4-0613",
  "gpt-4-0125-preview",
  "gpt-4",
  "gpt-3.5-turbo-16k-0613",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-1106",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-0301",
  "gpt-3.5-turbo-0125",
  "gpt-3.5-turbo",
] as const;

export type OpenAIModel = (typeof openAIModels)[number];

// NOTE: Update docs page when changing this! https://langfuse.com/docs/prompt-management/features/playground#openai-playground--anthropic-playground
// WARNING: The first entry in the array is chosen as the default model to add LLM API keys
export const anthropicModels = [
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-mythos-5",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-opus-4-5-20251101",
  "claude-sonnet-4-20250514",
  "claude-opus-4-1-20250805",
  "claude-opus-4-20250514",
  "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet-20240620",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-5-haiku-20241022",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2",
] as const;

// WARNING: The first entry in the array is chosen as the default model to add LLM API keys
export const vertexAIModels = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-preview-09-2025",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-live-2.5-flash-native-audio",
  "gemini-2.0-flash",
  "gemini-2.0-pro-exp-02-05",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.0-pro",
] as const;

// WARNING: The first entry in the array is chosen as the default model to add LLM API keys. Make sure it supports top_p, max_tokens and temperature.
export const googleAIStudioModels = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash-lite-preview-09-2025",
  "gemini-2.0-flash",
  "gemini-2.0-flash-thinking-exp-01-21",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
] as const;

export type AnthropicModel = (typeof anthropicModels)[number];
export type VertexAIModel = (typeof vertexAIModels)[number];
export const supportedModels = {
  [LLMAdapter.Anthropic]: anthropicModels,
  [LLMAdapter.OpenAI]: openAIModels,
  [LLMAdapter.VertexAI]: vertexAIModels,
  [LLMAdapter.GoogleAIStudio]: googleAIStudioModels,
  [LLMAdapter.Azure]: [],
  [LLMAdapter.Bedrock]: [],
} as const;

export type LLMFunctionCall = {
  name: string;
  description: string;
  parameters: z.ZodType; // this has to be a json schema for OpenAI
};

export const LLMApiKeySchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    adapter: z.enum(LLMAdapter),
    provider: z.string(),
    displaySecretKey: z.string(),
    secretKey: z.string(),
    extraHeaders: z.string().nullish(),
    extraHeaderKeys: z.array(z.string()),
    baseURL: z.string().nullable(),
    customModels: z.array(z.string()),
    withDefaultModels: z.boolean(),
    config: z
      .union([BedrockConfigSchema, VertexAIConfigSchema, OpenAIConfigSchema])
      .nullish(),
  })
  // strict mode to prevent extra keys. Thorws error otherwise
  // https://github.com/colinhacks/zod?tab=readme-ov-file#strict
  .strict();

export type LLMApiKey =
  z.infer<typeof LLMApiKeySchema> extends LlmApiKeys
    ? z.infer<typeof LLMApiKeySchema>
    : never;

export enum LangfuseInternalTraceEnvironment {
  PromptExperiments = "langfuse-prompt-experiment",
  LLMJudge = "langfuse-llm-as-a-judge",
  CodeEval = "langfuse-code-eval",
  NaturalLanguageFilter = "langfuse-natural-language-filter",
  InAppAgent = "langfuse-in-app-agent",
}

export type ProcessedTraceEvent = {
  type: string;
  timestamp: string;
  body: Record<string, unknown>;
};

export type InternalTraceWriteInput = {
  rootSpanId: string;
  eventInputs: InternalTraceEventInput[];
};

export type InternalTraceWriter = (
  params: InternalTraceWriteInput,
) => Promise<void>;

/**
 * Configuration for direct writing of trace events to the events table.
 * Used by internal tracing (prompt experiments, evaluations).
 */
export type InternalEventsWriter = {
  experimentContext?: InternalTraceExperimentContext;
  write: InternalTraceWriter;
};

export type TraceSinkParams = {
  /**
   * IMPORTANT: This controls into what project the resulting traces are ingested.
   */
  targetProjectId: string;
  traceId: string;
  traceName: string;
  // NOTE: These strings must be whitelisted in the TS SDK to allow ingestion of traces by Langfuse. Please mirror edits to this string in https://github.com/langfuse/langfuse-js/blob/main/langfuse-core/src/index.ts.
  environment: string;
  userId?: string;
  metadata?: Record<string, unknown>;
  prompt?: {
    name: string;
    version: number;
  };
  /**
   * When provided, traced events are written directly to the events table,
   * bypassing the legacy traces/observations ingestion pipeline for the events write.
   * Used for internal tracing (prompt experiments, LLM-as-a-judge evaluations). Traced
   * events are still written to the legacy traces/observations tables.
   */
  eventsWriter?: InternalEventsWriter;
};
