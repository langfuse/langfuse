import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../parser";
import {
  geminiEmbeddedToolDefinitionFixture,
  geminiMediaAndCodeExecutionFixture,
} from "./fixtures";

describe("Gemini normalized I/O", () => {
  it.each([
    geminiEmbeddedToolDefinitionFixture,
    geminiMediaAndCodeExecutionFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
