import { describe, expect, it } from "vitest";

import { normalizedIOFixtures } from "./fixtures";
import { normalizeIO } from "./parser";

describe("normalized observation I/O", () => {
  it.each(normalizedIOFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
