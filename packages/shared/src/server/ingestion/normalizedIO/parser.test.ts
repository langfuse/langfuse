import { describe, expect, it } from "vitest";

import { normalizedIOFixtures } from "./fixtures";
import { normalizeIO } from "./parser";

describe("normalized observation I/O", () => {
  it.each(normalizedIOFixtures)(
    "normalizes the $name production-shaped fixture",
    ({ spanIO, expected }) => {
      expect(normalizeIO(spanIO)).toEqual(expected);
    },
  );
});
