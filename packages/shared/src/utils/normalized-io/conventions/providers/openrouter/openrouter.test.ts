import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { openRouterBroadcastFixtures } from "./fixtures";

describe("OpenRouter normalized I/O", () => {
  it.each(openRouterBroadcastFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
