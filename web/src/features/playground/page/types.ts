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

// Multi-column playground types
export interface PlaygroundColumnState {
  id: string;
  messages: ChatMessageWithId[];
  modelParams: UIModelParams;
  tools: PlaygroundTool[];
  structuredOutputSchema: PlaygroundSchema | null;
  output: string;
  outputJson: string;
  outputToolCalls: LLMToolCall[];
  isStreaming: boolean;
  // Sync flags per category
  syncFlags: {
    prompt: boolean;
    modelParams: boolean;
    tools: boolean;
    structuredOutput: boolean;
  };
}

export interface MultiPlaygroundState {
  columns: PlaygroundColumnState[];
  // Global state
  promptVariables: PromptVariable[];
  messagePlaceholders: PlaceholderMessageFillIn[];
  // Global sync settings
  globalSyncEnabled: boolean;
}

export type MultiPlaygroundCache = {
  columns: Array<{
    messages: (ChatMessage | PlaceholderMessage)[];
    modelParams?: Partial<UIModelParams> & Pick<UIModelParams, "provider" | "model">;
    output?: string | null;
    tools?: PlaygroundTool[];
    structuredOutputSchema?: PlaygroundSchema | null;
    syncFlags?: PlaygroundColumnState["syncFlags"];
  }>;
  promptVariables?: PromptVariable[];
  messagePlaceholders?: PlaceholderMessageFillIn[];
  globalSyncEnabled?: boolean;
} | null;
