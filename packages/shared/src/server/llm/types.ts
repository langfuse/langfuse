import { LlmApiKeys } from "@prisma/client";
import z from "zod";
import { BedrockConfigSchema } from "../../interfaces/customLLMProviderConfigSchemas";
import { TokenCountDelegate } from "../ingestion/processEventBatch";
import { AuthHeaderValidVerificationResult } from "../auth/types";

/* eslint-disable no-unused-vars */
// disable lint as this is exported and used in web/worker

export type PromptVariable = { name: string; value: string; isUsed: boolean };

export type ChatMessage = {
  role: ChatMessageRole | string; // Users may ingest any string as role via API/SDK
  content: string;
};

export type ChatMessageWithId = ChatMessage & { id: string };

export enum LLMAdapter {
  Anthropic = "anthropic",
  OpenAI = "openai",
  Azure = "azure",
  Bedrock = "bedrock",
  VertexAI = "google-vertex-ai",
  GoogleAIStudio = "google-ai-studio",
}

export enum ChatMessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
  Developer = "developer",
}

export const SYSTEM_ROLES: string[] = [
  ChatMessageRole.System,
  ChatMessageRole.Developer,
];

export const ChatMessageDefaultRoleSchema = z.nativeEnum(ChatMessageRole);

const ChatMessageSchema = z.object({
  role: z.union([ChatMessageDefaultRoleSchema, z.string()]), // Users may ingest any string as role via API/SDK
  content: z.string(),
});

export const ChatMessageListSchema = z.array(ChatMessageSchema);
export const TextPromptSchema = z.string().min(1, "Enter a prompt");

export const PromptContentSchema = z.union([
  ChatMessageListSchema,
  TextPromptSchema,
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
});

// Experiment config
export const ExperimentMetadataSchema = z
  .object({
    prompt_id: z.string(),
    provider: z.string(),
    model: z.string(),
    model_params: ZodModelConfig,
    error: z.string().optional(),
  })
  .strict();
export type ExperimentMetadata = z.infer<typeof ExperimentMetadataSchema>;

// NOTE: Update docs page when changing this! https://langfuse.com/docs/playground#openai-playground--anthropic-playground
export const openAIModels = [
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

// NOTE: Update docs page when changing this! https://langfuse.com/docs/playground#openai-playground--anthropic-playground
export const anthropicModels = [
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

export const vertexAIModels = [
  "gemini-2.0-pro-exp-02-05",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-preview-02-05",
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gemini-1.0-pro",
] as const;

export const googleAIStudioModels = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite-preview-02-05",
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
  parameters: z.ZodTypeAny; // this has to be a json schema for OpenAI
};

export const LLMApiKeySchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    createdAt: z.date(),
    updatedAt: z.date(),
    adapter: z.nativeEnum(LLMAdapter),
    provider: z.string(),
    displaySecretKey: z.string(),
    secretKey: z.string(),
    extraHeaders: z.string().nullish(),
    extraHeaderKeys: z.array(z.string()),
    baseURL: z.string().nullable(),
    customModels: z.array(z.string()),
    withDefaultModels: z.boolean(),
    config: BedrockConfigSchema.nullish(), // currently only Bedrock has additional config
  })
  // strict mode to prevent extra keys. Thorws error otherwise
  // https://github.com/colinhacks/zod?tab=readme-ov-file#strict
  .strict();

export type LLMApiKey =
  z.infer<typeof LLMApiKeySchema> extends LlmApiKeys
    ? z.infer<typeof LLMApiKeySchema>
    : never;

export type TraceParams = {
  traceName: string;
  traceId: string;
  projectId: string;
  tags: string[];
  tokenCountDelegate: TokenCountDelegate;
  authCheck: AuthHeaderValidVerificationResult;
};
