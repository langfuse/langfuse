import type { TranscriptFixture } from "./fixture-types";
import { vercelAiSdkDocsToolLoopFixture } from "./trace/vercel-ai-sdk-docs-tool-loop";
import { openaiAgentsJokeAndRatingFixture } from "./trace/openai-agents-joke-and-rating";

export type { TranscriptFixture } from "./fixture-types";

export const traceTranscriptFixtures: TranscriptFixture[] = [
  vercelAiSdkDocsToolLoopFixture,
  openaiAgentsJokeAndRatingFixture,
  // supportCopilotRefundLoopFixture,
  // supportCopilotRefundLoopWithoutSystemFixture,
];

export const sessionTranscriptFixtures: TranscriptFixture[] = [];

export const transcriptFixtures: TranscriptFixture[] = [
  ...traceTranscriptFixtures,
  ...sessionTranscriptFixtures,
];
