import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  anthropicMessagesRawServerToolsAndMediaFixture,
  anthropicMessagesRichContentFixture,
} from "./fixtures";

describe("Anthropic normalized I/O", () => {
  it.each([
    anthropicMessagesRawServerToolsAndMediaFixture,
    anthropicMessagesRichContentFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
