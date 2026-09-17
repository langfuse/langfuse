import { capturedTraceFixtures } from "./fixtures";
import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  anthropicMessagesRawServerToolsAndMediaFixture,
  anthropicMessagesRichContentFixture,
  documentedToolResultFixtures,
} from "./fixtures";

describe("Anthropic normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    ...documentedToolResultFixtures,
    anthropicMessagesRawServerToolsAndMediaFixture,
    anthropicMessagesRichContentFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
