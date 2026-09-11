import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { mixedNormalizedIOFixtures } from "./fixtures";

describe("mixed normalized I/O", () => {
  it.each(mixedNormalizedIOFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
