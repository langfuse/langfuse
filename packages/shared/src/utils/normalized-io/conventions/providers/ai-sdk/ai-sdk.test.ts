import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  documentedPromptFixtures,
  vercelAiSdkMixedToolMessagesFixture,
  vercelAiSdkOutputToolCallFixture,
} from "./fixtures";

describe("AI SDK normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedPromptFixtures,
    vercelAiSdkMixedToolMessagesFixture,
    vercelAiSdkOutputToolCallFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
