import { geminiEmbeddedToolDefinitionFixture } from "./geminiEmbeddedToolDefinition";
import { openAiChatCompletionToolSequenceFixture } from "./openAiChatCompletionToolSequence";
import { openAiResponsesFunctionCallFixture } from "./openAiResponsesFunctionCall";
import { outputOnlyPlainTextFixture } from "./outputOnlyPlainText";
import { outputOnlyStructuredMessageFixture } from "./outputOnlyStructuredMessage";
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
  rawPassthroughToolCallsFixture,
  semanticKernelEventContentFixture,
  geminiEmbeddedToolDefinitionFixture,
];

export * from "./geminiEmbeddedToolDefinition";
export * from "./openAiChatCompletionToolSequence";
export * from "./openAiResponsesFunctionCall";
export * from "./outputOnlyPlainText";
export * from "./outputOnlyStructuredMessage";
export * from "./rawPassthroughToolCalls";
export * from "./semanticKernelEventContent";
export * from "./types";
export * from "./vercelAiSdkMixedToolMessages";
export * from "./vercelAiSdkOutputToolCall";
