import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  langchainSerializedEnvelopeFixture,
  langgraphProductionShapeFixture,
} from "./fixtures";

describe("LangChain normalized I/O", () => {
  it.each([
    langchainSerializedEnvelopeFixture,
    langgraphProductionShapeFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
