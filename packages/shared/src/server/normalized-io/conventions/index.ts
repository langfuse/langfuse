import type { IOConvention } from "./IOConvention";
import { agnoProvider } from "./providers/agno";
import { aiSdkProvider } from "./providers/aiSdk";
import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { langchainProvider } from "./providers/langchain";
import { openAiProvider } from "./providers/openai";
import { otelGenaiProvider } from "./providers/otelGenai";
import { pydanticAiProvider } from "./providers/pydanticAi";
import { semanticKernelProvider } from "./providers/semanticKernel";

export type {
  ConventionResult,
  IOConvention,
  MessageEnvelopeContext,
  PartHandlerContext,
  PartHandler,
  RootMessageSource,
  SiblingPartContribution,
  SiblingPartSlot,
  ToolDefinitionCarrier,
  ToolDefinitionOptions,
  ToolDefinitionSource,
} from "./IOConvention";
export { claimed, dropped, unmatched } from "./IOConvention";

/**
 * All registered provider conventions, in deliberate order: common providers
 * first, so every fold checks the hot dialects before the long tail.
 * Provider shapes are disjoint, so order never decides *whether* something
 * is recognized — it is observable only where several providers contribute
 * to the same message (sibling-part slots), which the fixtures pin.
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
