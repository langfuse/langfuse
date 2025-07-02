import {
  type ChatMessage,
  type LLMJSONSchema,
  type LlmSchema,
  type LlmTool,
  type LLMToolDefinition,
  type PlaceholderMessage,
  type PromptVariable,
  type UIModelParams,
  type ChatMessageWithId,
  type LLMToolCall,
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

// Multi-column types
export interface PlaygroundColumnState {
  id: string;
  messages: ChatMessageWithId[];
  modelParams: UIModelParams;
  tools: PlaygroundTool[];
  structuredOutputSchema: PlaygroundSchema | null;
  messagePlaceholders: PlaceholderMessageFillIn[];
  output: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];
  isStreaming: boolean;
}

export interface SyncSettings {
  modelParams: boolean;
  tools: boolean;
  structuredOutputSchema: boolean;
  messages: boolean;
}

export interface MultiPlaygroundState {
  columns: PlaygroundColumnState[];
  syncSettings: SyncSettings;
  promptVariables: PromptVariable[];
}

export type MultiPlaygroundCache = {
  columns: PlaygroundColumnState[];
  syncSettings: SyncSettings;
  promptVariables: PromptVariable[];
} | null;
