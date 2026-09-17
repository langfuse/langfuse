import type { TranscriptFixture } from "./fixture-types";
import { cumulativeHistoryFixture } from "./session/cumulative-history";
import { orderSupportRoutingFixture } from "./session/order-support-routing";
import { reorderedHistoryFixture } from "./session/reordered-history";
import { supportCopilotFollowUpFixture } from "./session/support-copilot-follow-up";
import { openaiAgentsSpanishHandoffFixture } from "./trace/openai-agents-spanish-handoff";
import { vercelAiSdkDocsToolLoopFixture } from "./trace/vercel-ai-sdk-docs-tool-loop";
import { openaiAgentsJokeAndRatingFixture } from "./trace/openai-agents-joke-and-rating";
import { supportCopilotRefundLoopFixture } from "./trace/support-copilot-refund-loop";
import { standaloneToolObservationFixture } from "./trace/standalone-tool-observation";

export type { TranscriptFixture } from "./fixture-types";

const traceTranscriptFixtures: TranscriptFixture[] = [
  standaloneToolObservationFixture,
  openaiAgentsSpanishHandoffFixture,
  vercelAiSdkDocsToolLoopFixture,
  openaiAgentsJokeAndRatingFixture,
  supportCopilotRefundLoopFixture,
];

const sessionTranscriptFixtures: TranscriptFixture[] = [
  supportCopilotFollowUpFixture,
  orderSupportRoutingFixture,
  cumulativeHistoryFixture,
  reorderedHistoryFixture,
];

export const transcriptFixtures: TranscriptFixture[] = [
  ...traceTranscriptFixtures,
  ...sessionTranscriptFixtures,
];
