import { type Span } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";

import { ioredisRequestHook } from "./ioredisRequestHook";

const recordFullCommand = (cmdName: string, cmdArgs: unknown[]) => {
  const attributes: Record<string, unknown> = {};
  const span = {
    setAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
  } as unknown as Span;
  ioredisRequestHook(span, { cmdName, cmdArgs });
  return attributes["redis.full_command"] as string;
};

describe("ioredisRequestHook", () => {
  it("records short commands verbatim", () => {
    expect(recordFullCommand("get", ["prompt:p1:name:label:production"])).toBe(
      "get prompt:p1:name:label:production",
    );
  });

  it("bounds the attribute when a value is large", () => {
    const value = "x".repeat(200_000);
    const command = recordFullCommand("set", [
      "prompt:p1:big",
      value,
      "EX",
      3600,
    ]);

    expect(command.length).toBeLessThan(1_000);
    expect(command).toContain("set prompt:p1:big");
    expect(command).toContain("200000 chars");
    expect(command).toContain("EX 3600");
  });

  it("bounds the attribute when there are many arguments", () => {
    const keys = Array.from({ length: 10_000 }, (_, i) => `key:${i}`);
    const command = recordFullCommand("del", keys);

    expect(command.length).toBeLessThanOrEqual(1_024 + "…[truncated]".length);
    expect(command.endsWith("…[truncated]")).toBe(true);
    expect(command.startsWith("del key:0 key:1")).toBe(true);
  });

  it("does not split a surrogate pair at the cut", () => {
    const value = `${"x".repeat(127)}😀${"y".repeat(500)}`;
    const command = recordFullCommand("set", ["k", value]);

    expect(command).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("redacts AUTH arguments", () => {
    expect(recordFullCommand("auth", ["secret"])).toBe("auth [REDACTED]");
  });
});
