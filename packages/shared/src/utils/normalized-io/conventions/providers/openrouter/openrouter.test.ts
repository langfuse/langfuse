import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  openRouterBroadcastReplyFixture,
  openRouterToolCallReplyFixture,
} from "./fixtures";

describe("OpenRouter normalized I/O", () => {
  it.each([openRouterBroadcastReplyFixture, openRouterToolCallReplyFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeSpanIO(spanIO)).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
