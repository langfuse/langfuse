import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../parser";
import {
  vercelAiSdkMixedToolMessagesFixture,
  vercelAiSdkOutputToolCallFixture,
} from "./fixtures";

describe("AI SDK normalized I/O", () => {
  it.each([
    vercelAiSdkMixedToolMessagesFixture,
    vercelAiSdkOutputToolCallFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
