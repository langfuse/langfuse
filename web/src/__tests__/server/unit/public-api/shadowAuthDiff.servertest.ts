import { describe, expect, it } from "vitest";

import {
  __test,
  shadowAuthDiff,
  type LegacyDecision,
  type NewDecision,
  type Telemetry,
} from "@/src/features/public-api/server/shadowAuthDiff";

const capture = () => {
  const calls: { stat: string; tags: Record<string, string | number> }[] = [];
  const telemetry: Telemetry = {
    increment: (stat, tags) => calls.push({ stat, tags }),
    span: () => undefined,
  };
  return { calls, telemetry };
};

const deny: NewDecision = { success: false, error: { httpCode: 403 } };
const allow: NewDecision = { success: true };
const legacyAllow = {
  success: true,
  scope: { accessLevel: "project" },
} as LegacyDecision;
const legacyDeny = { success: false, status: 403 } as LegacyDecision;

describe("shadowAuthDiff — the ship-gate signal", () => {
  it.each([
    ["both allow", allow, legacyAllow, "match"],
    ["both deny", deny, legacyDeny, "match"],
    ["new denies what legacy allows", deny, legacyAllow, "new_denies"],
    ["new allows what legacy denies", allow, legacyDeny, "new_allows"],
    ["legacy has no gate", deny, { absent: true } as LegacyDecision, "net_new"],
  ] as const)("%s", (_name, neu, legacy, result) => {
    const { calls, telemetry } = capture();
    expect(shadowAuthDiff(neu, legacy, "traces:read", telemetry)).toBe(result);
    expect(calls[0].tags.result).toBe(result);
  });
});

describe("newVerdict maps the new decision to a verdict and code", () => {
  it.each([
    [allow, "allow", 200],
    [deny, "deny", 403],
    [{ success: false, error: { httpCode: 401 } } as NewDecision, "deny", 401],
    [{ success: false, error: { httpCode: 400 } } as NewDecision, "deny", 400],
  ] as const)("%o", (result, verdict, code) => {
    expect(__test.newVerdict(result)).toEqual({ verdict, code });
  });
});
