import { describe, expect, it } from "vitest";

import { normalizeIO } from "./parser";
import { mixedNormalizedIOFixtures } from "./testing/fixtures";

describe("normalized observation I/O (mixed inputs)", () => {
  it.each(mixedNormalizedIOFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
