import { geminiEmbeddedToolDefinitionFixture } from "./geminiEmbeddedToolDefinition";
import { langgraphProductionShapeFixture } from "./langgraphSynthetic";
import { microsoftAgentProductionShapeFixture } from "./microsoftAgentSynthetic";
import { openAiChatCompletionToolSequenceFixture } from "./openAiChatCompletionToolSequence";
import { openAiResponsesFunctionCallFixture } from "./openAiResponsesFunctionCall";
import { outputOnlyPlainTextFixture } from "./outputOnlyPlainText";
import { outputOnlyStructuredMessageFixture } from "./outputOnlyStructuredMessage";
import { pydanticAiProductionShapeFixture } from "./pydanticAiSynthetic";
import { rawPassthroughToolCallsFixture } from "./rawPassthroughToolCalls";
import { semanticKernelEventContentFixture } from "./semanticKernelEventContent";
import { vercelAiSdkMixedToolMessagesFixture } from "./vercelAiSdkMixedToolMessages";
import { vercelAiSdkOutputToolCallFixture } from "./vercelAiSdkOutputToolCall";

export const normalizedIOFixtures = [
  vercelAiSdkOutputToolCallFixture,
  vercelAiSdkMixedToolMessagesFixture,
  outputOnlyStructuredMessageFixture,
  outputOnlyPlainTextFixture,
  openAiChatCompletionToolSequenceFixture,
  openAiResponsesFunctionCallFixture,
  langgraphProductionShapeFixture,
  microsoftAgentProductionShapeFixture,
  pydanticAiProductionShapeFixture,
  rawPassthroughToolCallsFixture,
  semanticKernelEventContentFixture,
  geminiEmbeddedToolDefinitionFixture,
];

export * from "./geminiEmbeddedToolDefinition";
export * from "./langgraphSynthetic";
export * from "./microsoftAgentSynthetic";
export * from "./openAiChatCompletionToolSequence";
export * from "./openAiResponsesFunctionCall";
export * from "./outputOnlyPlainText";
export * from "./outputOnlyStructuredMessage";
export * from "./pydanticAiSynthetic";
export * from "./rawPassthroughToolCalls";
export * from "./semanticKernelEventContent";
export * from "./types";
export * from "./vercelAiSdkMixedToolMessages";
export * from "./vercelAiSdkOutputToolCall";
