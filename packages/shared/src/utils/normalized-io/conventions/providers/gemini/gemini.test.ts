import { capturedTraceFixtures } from "./fixtures";
import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  geminiEmbeddedToolDefinitionFixture,
  documentedFunctionRoundTripFixtures,
  geminiMediaAndCodeExecutionFixture,
  geminiSystemInstructionWithGenericMessagesFixture,
} from "./fixtures";

describe("Gemini normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedFunctionRoundTripFixtures,
    geminiEmbeddedToolDefinitionFixture,
    geminiSystemInstructionWithGenericMessagesFixture,
    geminiMediaAndCodeExecutionFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
