import type { TranscriptFixture } from "./fixture-types";
import { cumulativeHistoryFixture } from "./session/cumulative-history";
import { reorderedHistoryFixture } from "./session/reordered-history";
import { openaiAgentsSpanishHandoffFixture } from "./trace/openai-agents-spanish-handoff";
import { vercelAiSdkDocsToolLoopFixture } from "./trace/vercel-ai-sdk-docs-tool-loop";
import { openaiAgentsJokeAndRatingFixture } from "./trace/openai-agents-joke-and-rating";
import { supportCopilotRefundLoopFixture } from "./trace/support-copilot-refund-loop";

export type { TranscriptFixture } from "./fixture-types";

export const traceTranscriptFixtures: TranscriptFixture[] = [
  openaiAgentsSpanishHandoffFixture,
  vercelAiSdkDocsToolLoopFixture,
  openaiAgentsJokeAndRatingFixture,
  supportCopilotRefundLoopFixture,
];

export const sessionTranscriptFixtures: TranscriptFixture[] = [
  cumulativeHistoryFixture,
  reorderedHistoryFixture,
];

export const transcriptFixtures: TranscriptFixture[] = [
  ...traceTranscriptFixtures,
  ...sessionTranscriptFixtures,
];
