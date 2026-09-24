import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  pydanticAiProductionShapeFixture,
} from "./fixtures";

describe("Pydantic AI normalized I/O", () => {
  it.each([...capturedTraceFixtures, pydanticAiProductionShapeFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeSpanIO(spanIO)).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
