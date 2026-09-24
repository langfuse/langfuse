import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  documentedFunctionRoundTripFixtures,
  geminiEmbeddedToolDefinitionFixture,
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
