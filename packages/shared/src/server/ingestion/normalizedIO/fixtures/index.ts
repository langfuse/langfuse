import { anthropicMessagesRichContentFixture } from "./anthropicMessagesRichContent";
import { anthropicMessagesRawServerToolsAndMediaFixture } from "./anthropicMessagesRawServerToolsAndMedia";
import { geminiEmbeddedToolDefinitionFixture } from "./geminiEmbeddedToolDefinition";
import { langchainSerializedEnvelopeFixture } from "./langchainSerializedEnvelope";
import { langgraphProductionShapeFixture } from "./langgraphSynthetic";
import { microsoftAgentProductionShapeFixture } from "./microsoftAgentSynthetic";
import { openAiChatCompletionToolSequenceFixture } from "./openAiChatCompletionToolSequence";
import { openAiChatMultimodalRichResponseFixture } from "./openAiChatMultimodalRichResponse";
import { openAiResponsesBuiltInToolsAndMediaFixture } from "./openAiResponsesBuiltInToolsAndMedia";
import { openAiResponsesFunctionCallFixture } from "./openAiResponsesFunctionCall";
import { openAiResponsesReasoningWithParallelCallsFixture } from "./openAiResponsesReasoningWithParallelCalls";
import { outputOnlyPlainTextFixture } from "./outputOnlyPlainText";
import { outputOnlyStructuredMessageFixture } from "./outputOnlyStructuredMessage";
import { pydanticAiProductionShapeFixture } from "./pydanticAiSynthetic";
import { rawPassthroughToolCallsFixture } from "./rawPassthroughToolCalls";
import { semanticKernelEventContentFixture } from "./semanticKernelEventContent";
import { vercelAiSdkMixedToolMessagesFixture } from "./vercelAiSdkMixedToolMessages";
import { vercelAiSdkOutputToolCallFixture } from "./vercelAiSdkOutputToolCall";

export const normalizedIOFixtures = [
  anthropicMessagesRichContentFixture,
  anthropicMessagesRawServerToolsAndMediaFixture,
  vercelAiSdkOutputToolCallFixture,
  vercelAiSdkMixedToolMessagesFixture,
  outputOnlyStructuredMessageFixture,
  outputOnlyPlainTextFixture,
  openAiChatCompletionToolSequenceFixture,
  openAiChatMultimodalRichResponseFixture,
  openAiResponsesFunctionCallFixture,
  openAiResponsesBuiltInToolsAndMediaFixture,
  openAiResponsesReasoningWithParallelCallsFixture,
  langchainSerializedEnvelopeFixture,
  langgraphProductionShapeFixture,
  microsoftAgentProductionShapeFixture,
  pydanticAiProductionShapeFixture,
  rawPassthroughToolCallsFixture,
  semanticKernelEventContentFixture,
  geminiEmbeddedToolDefinitionFixture,
];

export * from "./anthropicMessagesRichContent";
export * from "./anthropicMessagesRawServerToolsAndMedia";
export * from "./geminiEmbeddedToolDefinition";
export * from "./langchainSerializedEnvelope";
export * from "./langgraphSynthetic";
export * from "./microsoftAgentSynthetic";
export * from "./openAiChatCompletionToolSequence";
export * from "./openAiChatMultimodalRichResponse";
export * from "./openAiResponsesBuiltInToolsAndMedia";
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
