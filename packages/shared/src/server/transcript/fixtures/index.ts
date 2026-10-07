import { codeExecutionChildToolFixture } from "./trace/code-execution-child-tool";
import type { TranscriptFixture } from "./fixture-types";
import { openaiAgentsSpanishHandoffFixture } from "./trace/openai-agents-spanish-handoff";
import { vercelAiSdkDocsToolLoopFixture } from "./trace/vercel-ai-sdk-docs-tool-loop";
import { openaiAgentsJokeAndRatingFixture } from "./trace/openai-agents-joke-and-rating";
import { supportCopilotRefundLoopFixture } from "./trace/support-copilot-refund-loop";
import { supportCopilotFollowUpFixture } from "./trace/support-copilot-follow-up";
import { standaloneToolObservationFixture } from "./trace/standalone-tool-observation";
import { inheritedConversationHistoryFixture } from "./trace/inherited-conversation-history";
import { replayedToolCallsWithLateReasoningFixture } from "./trace/replayed-tool-calls-with-late-reasoning";

export type { TranscriptFixture } from "./fixture-types";

export const transcriptFixtures: TranscriptFixture[] = [
  standaloneToolObservationFixture,
  codeExecutionChildToolFixture,
  openaiAgentsSpanishHandoffFixture,
  vercelAiSdkDocsToolLoopFixture,
  openaiAgentsJokeAndRatingFixture,
  supportCopilotRefundLoopFixture,
  supportCopilotFollowUpFixture,
  inheritedConversationHistoryFixture,
  replayedToolCallsWithLateReasoningFixture,
];
