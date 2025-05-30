import {
  type PromptVariable,
  type ChatMessage,
  type UIModelParams,
  type LlmSchema,
  type LLMToolDefinition,
  type LlmTool,
  type LLMJSONSchema,
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

export type PlaygroundCache = {
  messages: ChatMessage[];
  modelParams?: Partial<UIModelParams> &
    Pick<UIModelParams, "provider" | "model">;
  output?: string | null;
  promptVariables?: PromptVariable[];
  tools?: PlaygroundTool[];
  structuredOutputSchema?: PlaygroundSchema | null;
} | null;
