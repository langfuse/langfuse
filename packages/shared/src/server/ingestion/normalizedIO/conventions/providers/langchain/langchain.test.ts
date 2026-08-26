import { describe, expect, it } from "vitest";

import { normalizeIO } from "../../../parser";
import {
  langchainSerializedEnvelopeFixture,
  langgraphProductionShapeFixture,
} from "./fixtures";

describe("LangChain normalized I/O", () => {
  it.each([
    langchainSerializedEnvelopeFixture,
    langgraphProductionShapeFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeIO({ kind: "io", io: spanIO })).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
