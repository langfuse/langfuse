import { describe, expect, it } from "vitest";
import type winston from "winston";

import { formatTextLogLine } from "./logger";

const info = (extra: Record<string, unknown>) =>
  ({
    timestamp: "2026-09-30T12:00:00.000Z",
    level: "error",
    message: "something failed",
    ...extra,
  }) as unknown as winston.Logform.TransformableInfo;

describe("formatTextLogLine", () => {
  it("keeps structured metadata that callers pass as a second argument", () => {
    const line = formatTextLogLine(
      info({ projectId: "p-1", attempt: 3, retryable: false }),
    );

    // The regression this test exists for: these three keys used to be dropped.
    expect(line).toContain('"projectId":"p-1"');
    expect(line).toContain('"attempt":3');
    expect(line).toContain('"retryable":false');
    expect(line).toContain("2026-09-30T12:00:00.000Z error something failed");
  });

  it("leaves a metadata-free line exactly as before", () => {
    expect(formatTextLogLine(info({}))).toBe(
      "2026-09-30T12:00:00.000Z error something failed",
    );
  });

  it("appends the stack after the metadata, not before it", () => {
    const line = formatTextLogLine(
      info({ stack: "Error: boom\n    at x", projectId: "p-1" }),
    );

    expect(line).toBe(
      '2026-09-30T12:00:00.000Z error something failed {"projectId":"p-1"}\n' +
        "Error: boom\n    at x",
    );
  });

  it("unwraps an Error in the metadata instead of emitting {}", () => {
    const line = formatTextLogLine(info({ cause: new Error("inner") }));

    expect(line).toContain('"message":"inner"');
    expect(line).not.toContain('"cause":{}');
  });

  it("serialises a BigInt rather than throwing", () => {
    // JSON.stringify throws a TypeError on BigInt. A logger that throws while
    // reporting an error destroys the diagnostic it was called to emit.
    expect(() => formatTextLogLine(info({ traceId: 10n }))).not.toThrow();
    expect(formatTextLogLine(info({ traceId: 10n }))).toContain(
      '"traceId":"10"',
    );
  });

  it("degrades to a marker on circular metadata rather than throwing", () => {
    const circular: Record<string, unknown> = { id: "p-1" };
    circular.self = circular;

    const line = formatTextLogLine(info({ ctx: circular }));

    expect(line).toContain("[unserialisable log metadata]");
    expect(line).toContain("something failed");
  });

  it("does not leak winston's splat carrier into the output", () => {
    const line = formatTextLogLine(info({ splat: ["a", "b"], keep: 1 }));

    expect(line).not.toContain("splat");
    expect(line).toContain('"keep":1');
  });
});
