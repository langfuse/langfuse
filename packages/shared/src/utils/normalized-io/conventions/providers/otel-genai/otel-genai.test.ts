import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  microsoftAgentProductionShapeFixture,
  semconvMediaPartsFixture,
} from "./fixtures";

describe("OTel GenAI normalized I/O", () => {
  it.each([
    ...capturedTraceFixtures,
    microsoftAgentProductionShapeFixture,
    semconvMediaPartsFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
