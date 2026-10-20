import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { normalizedMessageSchema } from "../../../schema";
import {
  anthropicMessagesRawServerToolsAndMediaFixture,
  anthropicMessagesRichContentFixture,
  capturedTraceFixtures,
  documentedToolResultFixtures,
} from "./fixtures";

describe("Anthropic normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedToolResultFixtures,
    anthropicMessagesRawServerToolsAndMediaFixture,
    anthropicMessagesRichContentFixture,
  ])("$name", ({ spanIO, expected }) => {
    const actual = normalizeSpanIO(spanIO);
    expect(actual).toEqual({
      ...expected,
      span: spanIO,
    });
    expect(normalizedMessageSchema.array().parse(actual.messages)).toEqual(
      actual.messages,
    );
  });
});
