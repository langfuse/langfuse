import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@langfuse/shared/src/server";

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
const legacyDeny = {
  success: false,
  error: { httpCode: 403 },
} as LegacyDecision;

describe("shadowAuthDiff — the ship-gate signal", () => {
  afterEach(() => vi.restoreAllMocks());

  it("adds the route resource to metrics without duplicating it on the span", () => {
    vi.spyOn(logger, "info").mockImplementation(() => logger);
    const { calls, telemetry } = capture();
    const setAttribute = vi.fn();
    telemetry.span = () => ({ setAttribute });

    shadowAuthDiff(
      deny,
      legacyAllow,
      "prompts:read",
      {
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        resource: "GET /api/public/prompts/[promptName]",
      },
      telemetry,
    );

    expect(Object.fromEntries(setAttribute.mock.calls)).toEqual({
      "langfuse.authz.parity.action": "prompts:read",
      "langfuse.authz.parity.access_level": "project",
      "langfuse.authz.parity.result": "new_denies",
      "langfuse.authz.parity.legacy_code": 200,
      "langfuse.authz.parity.new_code": 403,
    });
    expect(calls[0].tags).toEqual({
      action: "prompts:read",
      resource: "GET /api/public/prompts/[promptName]",
      access_level: "project",
      result: "new_denies",
      legacy_code: 200,
      new_code: 403,
    });
  });

  it.each([
    [deny, legacyAllow, "new_denies", 200, 403],
    [allow, legacyDeny, "new_allows", 403, 200],
  ] as const)(
    "logs every mismatch with codes %s / %s without a recording span",
    (newDecision, legacyDecision, result, legacyCode, newCode) => {
      const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { telemetry } = capture();
      const metadata = {
        apiKeyId: "key_1",
        publicKey: "pk-lf-1",
        resource: "GET /api/public/prompts/[promptName]",
        secretKey: "sk-lf-never-log",
      };
      for (let i = 0; i < 3; i++) {
        shadowAuthDiff(
          newDecision,
          legacyDecision,
          "prompts:read",
          metadata,
          telemetry,
        );
      }
      expect(log).toHaveBeenCalledTimes(3);
      expect(log).toHaveBeenCalledWith("Public API authorization mismatch", {
        event: "authz_parity",
        action: "prompts:read",
        access_level: result === "new_denies" ? "project" : "unknown",
        result,
        legacy_code: legacyCode,
        new_code: newCode,
        api_key_id: "key_1",
        public_key: "pk-lf-1",
        resource: "GET /api/public/prompts/[promptName]",
      });
    },
  );

  it("does not log matches", () => {
    const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
    const { telemetry } = capture();
    for (const [newDecision, legacyDecision] of [
      [allow, legacyAllow],
      [deny, legacyDeny],
    ] as const) {
      shadowAuthDiff(
        newDecision,
        legacyDecision,
        "traces:read",
        { resource: "unknown" },
        telemetry,
      );
    }
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["both allow", allow, legacyAllow],
    ["both deny", deny, legacyDeny],
    [
      "both deny with different codes",
      { success: false, error: { httpCode: 401 } } as NewDecision,
      legacyDeny,
    ],
  ] as const)(
    "does not publish telemetry when %s",
    (_name, newDecision, legacyDecision) => {
      const log = vi.spyOn(logger, "info").mockImplementation(() => logger);
      const { calls, telemetry } = capture();
      const setAttribute = vi.fn();
      telemetry.span = vi.fn(() => ({ setAttribute }));

      expect(
        shadowAuthDiff(
          newDecision,
          legacyDecision,
          "traces:read",
          { resource: "unknown" },
          telemetry,
        ),
      ).toBe("match");
      expect(calls).toEqual([]);
      expect(telemetry.span).not.toHaveBeenCalled();
      expect(setAttribute).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["both allow", allow, legacyAllow, "match"],
    ["both deny", deny, legacyDeny, "match"],
    ["new denies what legacy allows", deny, legacyAllow, "new_denies"],
    ["new allows what legacy denies", allow, legacyDeny, "new_allows"],
  ] as const)("%s", (_name, newVerdict, legacyVerdict, result) => {
    const { calls, telemetry } = capture();
    expect(
      shadowAuthDiff(
        newVerdict,
        legacyVerdict,
        "traces:read",
        { resource: "unknown" },
        telemetry,
      ),
    ).toBe(result);
    if (result === "match") {
      expect(calls).toEqual([]);
    } else {
      expect(calls[0].tags.result).toBe(result);
    }
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
