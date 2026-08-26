import {
  anthropicMessagesRawServerToolsAndMediaFixture,
  anthropicMessagesRichContentFixture,
} from "../conventions/anthropic.fixtures";
import {
  geminiEmbeddedToolDefinitionFixture,
  geminiMediaAndCodeExecutionFixture,
} from "../conventions/gemini.fixtures";
import {
  langchainSerializedEnvelopeFixture,
  langgraphProductionShapeFixture,
} from "../conventions/langchain.fixtures";
import { looseProviderMessageShapesFixture } from "./looseProviderMessageShapes";
import { microsoftAgentProductionShapeFixture } from "../conventions/otelGenai.fixtures";
import {
  openAiChatCompletionToolSequenceFixture,
  openAiChatMultimodalRichResponseFixture,
  openAiResponsesBuiltInToolsAndMediaFixture,
  openAiResponsesFunctionCallFixture,
  openAiResponsesReasoningWithParallelCallsFixture,
} from "../conventions/openai.fixtures";
import { outputOnlyPlainTextFixture } from "./outputOnlyPlainText";
import { outputOnlyStructuredMessageFixture } from "./outputOnlyStructuredMessage";
import { pydanticAiProductionShapeFixture } from "../conventions/pydanticAi.fixtures";
import { rawPassthroughToolCallsFixture } from "./rawPassthroughToolCalls";
import { semanticKernelEventContentFixture } from "../conventions/semanticKernel.fixtures";
import {
  vercelAiSdkMixedToolMessagesFixture,
  vercelAiSdkOutputToolCallFixture,
} from "../conventions/aiSdk.fixtures";

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
  looseProviderMessageShapesFixture,
  microsoftAgentProductionShapeFixture,
  pydanticAiProductionShapeFixture,
  rawPassthroughToolCallsFixture,
  semanticKernelEventContentFixture,
  geminiEmbeddedToolDefinitionFixture,
  geminiMediaAndCodeExecutionFixture,
];

export * from "../conventions/anthropic.fixtures";
export * from "../conventions/gemini.fixtures";
export * from "../conventions/langchain.fixtures";
export * from "./looseProviderMessageShapes";
export * from "../conventions/otelGenai.fixtures";
export * from "../conventions/openai.fixtures";
export * from "./outputOnlyPlainText";
export * from "./outputOnlyStructuredMessage";
export * from "../conventions/pydanticAi.fixtures";
export * from "./rawPassthroughToolCalls";
export * from "../conventions/semanticKernel.fixtures";
export * from "./types";
export * from "../conventions/aiSdk.fixtures";
