import { describe, expect, it } from "vitest";

import {
  formatV4TraceTerminology,
  IN_APP_AGENT_SYSTEM_PROMPT_TEMPLATE,
} from "./systemPrompt";

describe("formatV4TraceTerminology", () => {
  it("maps user traces to root observations when v4 is on", () => {
    const guidance = formatV4TraceTerminology(true);

    expect(guidance).toContain("<v4_trace_terminology>");
    expect(guidance).toContain("isRootObservation true");
    expect(guidance).toContain("listObservations");
    expect(guidance).toContain("queryMetrics");
    expect(IN_APP_AGENT_SYSTEM_PROMPT_TEMPLATE).toContain(
      "{{v4TraceTerminology}}",
    );
  });

  it("is empty when v4 is off", () => {
    expect(formatV4TraceTerminology(false)).toBe("");
  });
});
