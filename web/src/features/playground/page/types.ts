import {
  type ChatMessage,
  type LLMJSONSchema,
  type LlmSchema,
  type LlmTool,
  type LLMToolDefinition,
  type PlaceholderMessage,
  type PromptVariable,
  type UIModelParams,
} from "@langfuse/shared";

export type PlaygroundTool = LLMToolDefinition & {
  id: string;
  existingLlmTool?: LlmTool;
};

export type PlaygroundSchema = {
  id: string;
  name: string;
  description: string;
  schema: LLMJSONSchema;
  existingLlmSchema?: LlmSchema;
};

export type PlaceholderMessageFillIn = {
  name: string;
  value: ChatMessage[];
  isUsed: boolean;
};

export type PlaygroundCache = {
  messages: (ChatMessage | PlaceholderMessage)[];
  modelParams?: Partial<UIModelParams> &
    Pick<UIModelParams, "provider" | "model">;
  output?: string | null;
  promptVariables?: PromptVariable[];
  // TODO: also cache placeholders?
  tools?: PlaygroundTool[];
  structuredOutputSchema?: PlaygroundSchema | null;
} | null;
