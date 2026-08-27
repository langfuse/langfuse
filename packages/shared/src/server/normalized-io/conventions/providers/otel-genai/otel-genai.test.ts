import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../../parser";
import { microsoftAgentProductionShapeFixture } from "./fixtures";

describe("OTel GenAI normalized I/O", () => {
  it.each([microsoftAgentProductionShapeFixture])(
    "$name",
    ({ spanIO, expected }) => {
      expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
        ...expected,
        span: spanIO,
      });
    },
  );
});
