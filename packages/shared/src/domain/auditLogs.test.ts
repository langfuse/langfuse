import { describe, expect, it } from "vitest";
import {
  AUDIT_LOG_PARAMS_MAX_BYTES,
  AUDIT_LOG_RESOURCE_REFS_MAX,
  AUDIT_LOG_TRUNCATION_MARKER,
  AuditLogEventSchema,
  toAuditLogResourceRef,
  type AuditLogEvent,
} from "./auditLogs";

const accessEvent = (
  overrides: Partial<Extract<AuditLogEvent, { kind: "access" }>>,
): AuditLogEvent => ({
  kind: "access",
  orgId: "org-1",
  projectId: "project-1",
  actor: { type: "USER", userId: "user-1" },
  resourceType: "trace",
  action: "list",
  ...overrides,
});

const parseAccess = (overrides: Parameters<typeof accessEvent>[0]) => {
  const payload = AuditLogEventSchema.parse(accessEvent(overrides));
  if (payload.kind !== "access") throw new Error("expected an access event");
  return payload;
};

describe("AuditLogEventSchema size caps", () => {
  it("keeps params under the cap as serialized JSON", () => {
    const params = { filter: [{ column: "name", value: "checkout" }] };

    expect(parseAccess({ params }).params).toBe(JSON.stringify(params));
  });

  it.each([
    { name: "ASCII", char: "a" },
    { name: "3-byte characters", char: "€" },
    { name: "surrogate pairs", char: "😀" },
  ])("cuts params with $name to the byte cap", ({ char }) => {
    const params = { searchQuery: char.repeat(AUDIT_LOG_PARAMS_MAX_BYTES) };

    const capped = parseAccess({ params }).params ?? "";

    expect(Buffer.byteLength(capped)).toBeLessThanOrEqual(
      AUDIT_LOG_PARAMS_MAX_BYTES,
    );
    expect(Buffer.byteLength(capped)).toBeGreaterThan(
      AUDIT_LOG_PARAMS_MAX_BYTES - 4,
    );
    expect(capped.endsWith(AUDIT_LOG_TRUNCATION_MARKER)).toBe(true);
    expect(capped.isWellFormed()).toBe(true);
  });

  it("dedupes resource refs and caps their count", () => {
    const refs = Array.from(
      { length: AUDIT_LOG_RESOURCE_REFS_MAX + 10 },
      (_, i) => toAuditLogResourceRef("observation", `obs-${i}`),
    );
    const trace = toAuditLogResourceRef("trace", "trace-1");

    const { resourceRefs } = parseAccess({
      resourceRefs: [trace, trace, ...refs],
    });

    expect(resourceRefs).toHaveLength(AUDIT_LOG_RESOURCE_REFS_MAX);
    expect(resourceRefs.slice(0, 2)).toEqual([trace, refs[0]]);
  });

  it.each(["prompt:p-1", "trace:", "trace-1"])(
    "rejects the malformed resource ref %s",
    (ref) => {
      expect(() =>
        AuditLogEventSchema.parse(
          accessEvent({ resourceRefs: [ref as `trace:${string}`] }),
        ),
      ).toThrow();
    },
  );
});
