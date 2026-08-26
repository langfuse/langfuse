import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../../parser";
import { agnoPythonReprFixture } from "./fixtures";

describe("Agno normalized I/O", () => {
  it.each([agnoPythonReprFixture])("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
