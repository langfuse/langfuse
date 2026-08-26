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

export * from "./looseProviderMessageShapes";
export * from "./outputOnlyPlainText";
export * from "./outputOnlyStructuredMessage";
export * from "./rawPassthroughToolCalls";
export type { NormalizedIOFixture } from "../fixtureTypes";
