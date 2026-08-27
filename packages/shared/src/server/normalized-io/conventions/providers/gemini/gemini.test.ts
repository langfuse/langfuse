import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../../parser";
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
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
