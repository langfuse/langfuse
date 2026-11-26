import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { langfuseAgentPluginFixtures } from "./__tests__/fixtures";

describe("Langfuse agent plugin normalized I/O", () => {
  it.each(langfuseAgentPluginFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });
});
