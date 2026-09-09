import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { microsoftAgentProductionShapeFixture } from "./fixtures";

describe("OTel GenAI normalized I/O", () => {
  it.each([microsoftAgentProductionShapeFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeSpanIO(spanIO)).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
