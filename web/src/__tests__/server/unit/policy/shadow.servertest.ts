import { describe, expect, it } from "vitest";

import {
  diffResults,
  newVerdict,
  recordCoverage,
  type LegacyDecision,
  type NewResult,
  type ParitySink,
} from "@/src/features/auth/policy/shadow";

const capture = () => {
  const calls: { stat: string; tags: Record<string, string | number> }[] = [];
  const sink: ParitySink = {
    increment: (stat, tags) => calls.push({ stat, tags }),
    span: () => undefined,
  };
  return { calls, sink };
};

const deny: NewResult = { success: false, error: { httpCode: 403 } };
const allow: NewResult = { success: true };

describe("diffResults — the ship-gate signal", () => {
  it.each([
    ["both allow", allow, { ok: true } as LegacyDecision, "match"],
    ["both deny", deny, { ok: false, code: 403 } as LegacyDecision, "match"],
    [
      "new denies what legacy allows",
      deny,
      { ok: true } as LegacyDecision,
      "new_denies",
    ],
    [
      "new allows what legacy denies",
      allow,
      { ok: false, code: 403 } as LegacyDecision,
      "new_allows",
    ],
    ["legacy has no gate", deny, { absent: true } as LegacyDecision, "net_new"],
  ] as const)("%s", (_name, neu, legacy, result) => {
    const { calls, sink } = capture();
    expect(
      diffResults(
        neu,
        legacy,
        { seam: "project_route", action: "traces:read" },
        sink,
      ),
    ).toBe(result);
    expect(calls[0].tags.result).toBe(result);
  });
});

describe("newVerdict maps the new result to a verdict and code", () => {
  it.each([
    [allow, "allow", 200],
    [deny, "deny", 403],
    [{ success: false, error: { httpCode: 401 } } as NewResult, "deny", 401],
    [{ success: false, error: { httpCode: 400 } } as NewResult, "deny", 400],
  ] as const)("%o", (result, verdict, code) => {
    expect(newVerdict(result)).toEqual({ verdict, code });
  });
});

describe("recordCoverage", () => {
  it("counts a request against its operation", () => {
    const { calls, sink } = capture();
    recordCoverage("GET /api/public/v2/prompts", sink);
    expect(calls).toEqual([
      {
        stat: "langfuse.authz.coverage",
        tags: { operation: "GET /api/public/v2/prompts" },
      },
    ]);
  });
});
