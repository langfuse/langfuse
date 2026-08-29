import { looseProviderMessageShapesFixture } from "./loose-provider-message-shapes";
import { outputOnlyPlainTextFixture } from "./output-only-plain-text";
import { outputOnlyStructuredMessageFixture } from "./output-only-structured-message";
import { rawPassthroughToolCallsFixture } from "./raw-passthrough-tool-calls";

export const mixedNormalizedIOFixtures = [
  looseProviderMessageShapesFixture,
  outputOnlyStructuredMessageFixture,
  outputOnlyPlainTextFixture,
  rawPassthroughToolCallsFixture,
];
