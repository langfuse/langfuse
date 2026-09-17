import { capturedTraceFixtures } from "./fixtures";
import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { microsoftAgentProductionShapeFixture } from "./fixtures";

describe("OTel GenAI normalized I/O", () => {
  it.each([...capturedTraceFixtures, microsoftAgentProductionShapeFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeSpanIO(spanIO)).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
