import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  geminiEmbeddedToolDefinitionFixture,
  geminiMediaAndCodeExecutionFixture,
  geminiSystemInstructionWithGenericMessagesFixture,
} from "./fixtures";

describe("Gemini normalized I/O", () => {
  it.each([
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
