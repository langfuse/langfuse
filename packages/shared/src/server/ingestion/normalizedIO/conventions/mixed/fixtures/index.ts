import { looseProviderMessageShapesFixture } from "./looseProviderMessageShapes";
import { outputOnlyPlainTextFixture } from "./outputOnlyPlainText";
import { outputOnlyStructuredMessageFixture } from "./outputOnlyStructuredMessage";
import { rawPassthroughToolCallsFixture } from "./rawPassthroughToolCalls";

export const mixedNormalizedIOFixtures = [
  looseProviderMessageShapesFixture,
  outputOnlyStructuredMessageFixture,
  outputOnlyPlainTextFixture,
  rawPassthroughToolCallsFixture,
];
