import { anthropicMessagesRichContentFixture } from "./anthropicMessagesRichContent";
import { geminiEmbeddedToolDefinitionFixture } from "./geminiEmbeddedToolDefinition";
import { langgraphProductionShapeFixture } from "./langgraphSynthetic";
import { microsoftAgentProductionShapeFixture } from "./microsoftAgentSynthetic";
import { openAiChatCompletionToolSequenceFixture } from "./openAiChatCompletionToolSequence";
import { openAiResponsesFunctionCallFixture } from "./openAiResponsesFunctionCall";
import { openAiResponsesReasoningWithParallelCallsFixture } from "./openAiResponsesReasoningWithParallelCalls";
import { outputOnlyPlainTextFixture } from "./outputOnlyPlainText";
import { outputOnlyStructuredMessageFixture } from "./outputOnlyStructuredMessage";
import { pydanticAiProductionShapeFixture } from "./pydanticAiSynthetic";
import { rawPassthroughToolCallsFixture } from "./rawPassthroughToolCalls";
import { semanticKernelEventContentFixture } from "./semanticKernelEventContent";
import { vercelAiSdkMixedToolMessagesFixture } from "./vercelAiSdkMixedToolMessages";
import { vercelAiSdkOutputToolCallFixture } from "./vercelAiSdkOutputToolCall";

import type { NormalizedIOFixture } from "./types";

// Widened to the canonical fixture type so consumers work with NormalizedIO
// rather than the union of each fixture's narrow literal type.
export const normalizedIOFixtures: NormalizedIOFixture[] = [
  anthropicMessagesRichContentFixture,
  vercelAiSdkOutputToolCallFixture,
  vercelAiSdkMixedToolMessagesFixture,
  outputOnlyStructuredMessageFixture,
  outputOnlyPlainTextFixture,
  openAiChatCompletionToolSequenceFixture,
  openAiResponsesFunctionCallFixture,
  openAiResponsesReasoningWithParallelCallsFixture,
  langgraphProductionShapeFixture,
  microsoftAgentProductionShapeFixture,
  pydanticAiProductionShapeFixture,
  rawPassthroughToolCallsFixture,
  semanticKernelEventContentFixture,
  geminiEmbeddedToolDefinitionFixture,
];

export * from "./anthropicMessagesRichContent";
export * from "./geminiEmbeddedToolDefinition";
export * from "./langgraphSynthetic";
export * from "./microsoftAgentSynthetic";
export * from "./openAiChatCompletionToolSequence";
export * from "./openAiResponsesFunctionCall";
export * from "./openAiResponsesReasoningWithParallelCalls";
export * from "./outputOnlyPlainText";
export * from "./outputOnlyStructuredMessage";
export * from "./pydanticAiSynthetic";
export * from "./rawPassthroughToolCalls";
export * from "./semanticKernelEventContent";
export * from "./types";
export * from "./vercelAiSdkMixedToolMessages";
export * from "./vercelAiSdkOutputToolCall";
