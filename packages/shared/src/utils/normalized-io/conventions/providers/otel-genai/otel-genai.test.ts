import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  microsoftAgentProductionShapeFixture,
} from "./__tests__/fixtures";

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
