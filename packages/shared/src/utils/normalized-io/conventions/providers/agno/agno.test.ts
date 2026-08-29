import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { agnoPythonReprFixture } from "./fixtures";

describe("Agno normalized I/O", () => {
  it.each([agnoPythonReprFixture])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
