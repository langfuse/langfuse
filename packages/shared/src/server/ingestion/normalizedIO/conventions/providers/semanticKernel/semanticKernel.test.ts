import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../parser";
import { semanticKernelEventContentFixture } from "./fixtures";

describe("Semantic Kernel normalized I/O", () => {
  it.each([semanticKernelEventContentFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
