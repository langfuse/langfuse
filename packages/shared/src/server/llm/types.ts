export type PromptVariable = { name: string; value: string; isUsed: boolean };
export type ChatMessage = {
  role: ChatMessageRole;
  content: string;
};

export type ChatMessageWithId = ChatMessage & { id: string };

export enum ModelProvider {
  Anthropic = "anthropic",
  OpenAI = "openai",
}
export enum ChatMessageRole {
  System = "system",
  User = "user",
  Assistant = "assistant",
}
export type ModelParams = AnthropicModelParams | OpenAIModelParams;
export type UIModelParams = Required<
  AnthropicModelParams | OpenAIModelParams
> & {
  maxTemperature: number;
};

// Generic config
export type ModelConfig = {
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
};

// OpenAI
export type OpenAIModelParams = {
  provider: ModelProvider.OpenAI;
  model: OpenAIModel;
} & ModelConfig;

export const openAIModels = [
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

// Anthropic
export type AnthropicModelParams = {
  provider: ModelProvider.Anthropic;
  model: AnthropicModel;
} & ModelConfig;

export const anthropicModels = [
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
  "claude-2.1",
  "claude-2.0",
  "claude-instant-1.2",
] as const;

export type AnthropicModel = (typeof anthropicModels)[number];
export const supportedModels = {
  [ModelProvider.Anthropic]: anthropicModels,
  [ModelProvider.OpenAI]: openAIModels,
} as const;
