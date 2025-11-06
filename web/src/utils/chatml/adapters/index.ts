import type { NormalizerContext, ProviderAdapter } from "../types";
import { mapToChatMl, mapOutputToChatMl } from "../core";
import { langgraphAdapter } from "./langgraph";
import { openAIAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { microsoftAgentAdapter } from "./microsoft-agent";
import { genericAdapter } from "./generic";

const adapters: ProviderAdapter[] = [
  langgraphAdapter, // Must be before openAI (both use langfuse-sdk scope)
  openAIAdapter, // OpenAI (Chat Completions & Responses API)
  geminiAdapter, // Gemini/VertexAI format
  microsoftAgentAdapter, // Microsoft Agent Framework
  // Add more adapters here as needed
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

export function normalizeInput(input: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? input,
    data: input,
  });
  const preprocessed = adapter.preprocess(input, "input", ctx);
  return mapToChatMl(preprocessed);
}

export function normalizeOutput(output: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? output,
    data: output,
  });
  const preprocessed = adapter.preprocess(output, "output", ctx);
  return mapOutputToChatMl(preprocessed);
}
