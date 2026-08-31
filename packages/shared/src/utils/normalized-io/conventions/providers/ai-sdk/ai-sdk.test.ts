import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  vercelAiSdkMixedToolMessagesFixture,
  vercelAiSdkOutputToolCallFixture,
} from "./fixtures";

describe("AI SDK normalized I/O", () => {
  it.each([
    vercelAiSdkMixedToolMessagesFixture,
    vercelAiSdkOutputToolCallFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
