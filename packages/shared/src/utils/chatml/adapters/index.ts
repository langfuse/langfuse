import type { NormalizerContext, ProviderAdapter } from "../types";
import { langgraphAdapter } from "./langgraph";
import { aisdkAdapter } from "./aisdk";
import { openAIAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { microsoftAgentAdapter } from "./microsoft-agent";
import { semanticKernelAdapter } from "./semantic-kernel";
import { pydanticAIAdapter } from "./pydantic-ai";
import { genericAdapter } from "./generic";

const adapters: ProviderAdapter[] = [
  langgraphAdapter, // Must be before openAI (both use langfuse-sdk scope)
  aisdkAdapter, // Vercel AI SDK v5 (for all LLM providers like OpenAI, Bedrock, Anthropic, etc.)
  openAIAdapter, // OpenAI (Chat Completions & Responses API)
  geminiAdapter, // Gemini/VertexAI format
  microsoftAgentAdapter, // Microsoft Agent Framework
  pydanticAIAdapter, // Pydantic AI framework
  // Add more adapters here as needed
  semanticKernelAdapter, // Microsoft Semantic Kernel - detects by scope.name prefix
  genericAdapter, // Always last (fallback)
];

function selectAdapter(ctx: NormalizerContext): ProviderAdapter {
  // Explicit override
  if (ctx.framework) {
    const adapter = adapters.find((a) => a.id === ctx.framework);
    if (adapter) return adapter;
  }

  // First adapter that matches wins
  for (const adapter of adapters) {
    if (adapter.detect(ctx)) {
      return adapter;
    }
  }

  return genericAdapter;
}

// Export selectAdapter and individual adapters for direct use
export { selectAdapter };
export type { NormalizerContext, ProviderAdapter } from "../types";
export { langgraphAdapter } from "./langgraph";
export { aisdkAdapter } from "./aisdk";
export { openAIAdapter } from "./openai";
export { geminiAdapter } from "./gemini";
export { microsoftAgentAdapter } from "./microsoft-agent";
export { semanticKernelAdapter } from "./semantic-kernel";
export { pydanticAIAdapter } from "./pydantic-ai";
export { genericAdapter } from "./generic";
