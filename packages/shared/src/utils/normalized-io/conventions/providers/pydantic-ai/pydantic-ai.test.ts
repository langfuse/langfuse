import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import {
  capturedTraceFixtures,
  agentRunFixture,
  pydanticAiProductionShapeFixture,
} from "./fixtures";

describe("Pydantic AI normalized I/O", () => {
  it("leaves unrelated message history as data", () => {
    const output = {
      _state: { message_history: [{ content: "An audit entry." }] },
    };
    expect(
      normalizeSpanIO({ input: undefined, output, metadata: undefined }),
    ).toEqual({
      messages: [
        {
          role: "assistant",
          source: "output",
          parts: [{ type: "data", value: output }],
        },
      ],
      toolDefinitions: [],
      span: { input: undefined, output, metadata: undefined },
    });
  });

  it.each([
    ...capturedTraceFixtures,
    pydanticAiProductionShapeFixture,
    agentRunFixture,
  ])("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
