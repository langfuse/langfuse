import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { semanticKernelEventContentFixture } from "./fixtures";

describe("Semantic Kernel normalized I/O", () => {
  it.each([semanticKernelEventContentFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeSpanIO(spanIO)).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
