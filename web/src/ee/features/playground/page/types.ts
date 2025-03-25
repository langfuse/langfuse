import {
  type PromptVariable,
  type ChatMessage,
  type UIModelParams,
  type LlmSchema,
  type LLMTool,
} from "@langfuse/shared";

export type PlaygroundTool = LLMTool & { id: string; llmSchema?: LlmSchema };

export type PlaygroundCache = {
  messages: ChatMessage[];
  modelParams?: Partial<UIModelParams> &
    Pick<UIModelParams, "provider" | "model">;
  output?: string | null;
  promptVariables?: PromptVariable[];
  tools?: PlaygroundTool[];
  structuredOutputSchema?: PlaygroundTool | null;
} | null;
