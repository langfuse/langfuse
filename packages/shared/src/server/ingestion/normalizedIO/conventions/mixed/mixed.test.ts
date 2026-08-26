import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../parser";
import { mixedNormalizedIOFixtures } from "./fixtures";

describe("mixed normalized I/O", () => {
  it.each(mixedNormalizedIOFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
