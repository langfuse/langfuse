import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../parser";
import { pydanticAiProductionShapeFixture } from "./fixtures";

describe("Pydantic AI normalized I/O", () => {
  it.each([pydanticAiProductionShapeFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
