import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { agnoPythonReprFixture, capturedTraceFixtures } from "./fixtures";

describe("Agno normalized I/O", () => {
  it.each([...capturedTraceFixtures, agnoPythonReprFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeSpanIO(spanIO)).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
