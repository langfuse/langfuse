import type { IOConvention } from "./io-convention";
import { agnoProvider } from "./providers/agno";
import { aiSdkProvider } from "./providers/ai-sdk";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { langchainProvider } from "./providers/langchain";
import { openAiProvider } from "./providers/openai";
import { otelGenaiProvider } from "./providers/otel-genai";
import { pydanticAiProvider } from "./providers/pydantic-ai";
import { semanticKernelProvider } from "./providers/semantic-kernel";

export type { IOConvention } from "./io-convention";
export { claimed, dropped, unmatched } from "./io-convention";

/**
 * All registered provider conventions, in deliberate order: common providers
 * first, so every fold checks the hot dialects before the long tail.
 * Part and tool-definition shapes are mostly disjoint, but message claims are
 * intentionally exclusive: the first provider claiming a conversation owns
 * that carrier. Keep this list ordered from the most specific/common root
 * envelopes to the generic tail; parser context then tries the selected
 * provider first while normalizing nested parts.
 * Adding a provider is a directory plus one entry here; `registry.test.ts`
 * asserts folder <-> registry parity.
 *
 * Eager: provider files depend on canonical part builders and JSON helpers,
 * never on `normalize/message.ts`, `normalize/part.ts`, or the accumulator
 * collector, which import this registry, so there is no import cycle to
 * protect against.
 */
export const registeredProviders: readonly IOConvention[] = [
  openAiProvider,
  anthropicProvider,
  geminiProvider,
  langchainProvider,
  aiSdkProvider,
  otelGenaiProvider,
  pydanticAiProvider,
  semanticKernelProvider,
  agnoProvider,
];
